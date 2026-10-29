"""Question-set checks against the same read-only Agent used by the query UI."""
from __future__ import annotations
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Literal
from pydantic import BaseModel, Field
from fastapi.encoders import jsonable_encoder


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


GRADER_VERSION = 'agent-question-checks-v1'
BOUNDARY_REVIEW = 'Generated missing-data answers require review of the answer boundary'


class RequiredPath(BaseModel):
    source_id: str = Field(min_length=1, max_length=120)
    relation: str = Field(min_length=1, max_length=120)
    target_id: str = Field(min_length=1, max_length=120)


class EvaluationCase(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    expected: str = Field(min_length=1, max_length=4000)
    assets: list[str] = Field(default_factory=list, max_length=30)
    required_ids: list[str] = Field(default_factory=list, max_length=100)
    product_ids: list[str] | None = Field(default=None, max_length=100)
    required_paths: list[RequiredPath] = Field(default_factory=list, max_length=30)
    answer_terms: list[str] = Field(default_factory=list, max_length=30)
    forbidden_terms: list[str] = Field(default_factory=list, max_length=30)
    evidence_terms: list[str] = Field(default_factory=list, max_length=30)
    expected_unknown: bool = False
    no_paths: bool = False
    source_feedback_id: str | None = None


class EvaluationRequest(BaseModel):
    case_ids: list[str] = Field(min_length=1, max_length=20)
    execution_mode: Literal['model', 'deterministic'] = 'model'


def criteria_hash(case):
    return digest(EvaluationCase(**case).model_dump(mode='json'))


def result_references(result):
    ids = set()
    def collect(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in ('id', 'product_id', 'rule_id', 'ingredient_id', 'brand_id') and isinstance(item, str):
                    ids.add(item)
                collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
    tools = result.get('tool_results', [])
    for tool in tools:
        collect(tool.get('data'))
    paths = [p for tool in tools for p in tool.get('paths', [])]
    return {'ids': sorted(ids), 'paths': paths,
            'evidence': [str(item) for tool in tools for item in tool.get('evidence', [])]}


def check_answer(case, result, execution_mode):
    refs = result_references(result)
    checks = {}
    ids = set(refs['ids'])
    if case.get('required_ids') or case.get('product_ids') is not None:
        actual_products = {item for item in ids if item.startswith('PF')}
        checks['facts'] = set(case.get('required_ids', [])).issubset(ids) and (
            case.get('product_ids') is None or actual_products == set(case['product_ids']))
    if case.get('required_paths') or case.get('no_paths'):
        checks['path'] = all(any(all(path.get(k) == v for k, v in expected.items()) for path in refs['paths'])
                             for expected in case.get('required_paths', [])) and (not refs['paths'] if case.get('no_paths') else True)
    answer = result.get('answer', '').casefold()
    if case.get('answer_terms') or case.get('forbidden_terms'):
        checks['answer'] = all(term.casefold() in answer for term in case.get('answer_terms', [])) and not any(
            term.casefold() in answer for term in case.get('forbidden_terms', []))
    if case.get('evidence_terms'):
        evidence = '\n'.join(refs['evidence']).casefold()
        checks['evidence'] = all(term.casefold() in evidence for term in case['evidence_terms'])
    if case.get('expected_unknown'):
        tools = result.get('tool_results', [])
        checks['abstention'] = not refs['ids'] and (not tools or all(t.get('status') in ('not_found', 'not_evaluable') for t in tools))
    issues = [f'{name}: configured expectation did not match' for name, passed in checks.items() if not passed]
    if not result.get('answer'):
        issues.append('No answer was returned')
    if execution_mode == 'model' and not result.get('answer_llm_used'):
        issues.append('The configured model did not generate this answer; fallback cannot pass a model evaluation')
    if any(t.get('status') == 'error' for t in result.get('tool_results', [])):
        issues.append('A query tool failed')
    automatic_issues = list(issues)
    if not checks:
        issues.append('No automatic check criteria; human review required')
    if case.get('expected_unknown'):
        issues.append(BOUNDARY_REVIEW)
    return {'checks': checks, 'score': round(100 * sum(checks.values()) / len(checks)) if checks else None,
            'automatic_issues': automatic_issues, 'review_required': bool(case.get('expected_unknown') or not checks),
            'status': 'needs_review' if issues else 'passed', 'issues': issues, 'references': refs}


class EvaluationWorkbench:
    def __init__(self, root: Path, directory: Path):
        self.root, self.directory = Path(root), Path(directory)
        self.lock = RLock()
        self.cases_file = self.directory / 'agent-question-cases.json'
        self.runs_file = self.directory / 'agent-question-runs.json'
        # A process restart cannot turn an unfinished model call into a completed run.
        runs = self._read(self.runs_file)
        if any(run['status'] == 'running' for run in runs):
            for run in runs:
                if run['status'] == 'running':
                    run.update(status='interrupted', completed_at=now())
            self._write(self.runs_file, runs)

    @staticmethod
    def _read(path):
        return json.loads(path.read_text()) if path.exists() else []

    @staticmethod
    def _write(path, rows):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f'.{path.name}.{uuid.uuid4().hex}.tmp')
        try:
            temporary.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    def cases(self):
        with self.lock:
            if self.cases_file.exists():
                return [{**row, 'criteria_hash':criteria_hash(row)} for row in self._read(self.cases_file)]
            source = self.root / 'sample-data/pet-food/agent-evaluation-cases.v1.json'
            return [{**EvaluationCase(**row).model_dump(mode='json'), 'id': row['id'], 'revision': 1, 'criteria_hash':criteria_hash(row)}
                    for row in json.loads(source.read_text())['cases']]

    def save_case(self, request: EvaluationCase, case_id=None):
        if not request.question.strip() or not request.expected.strip():
            raise ValueError('Question and expected result are required')
        with self.lock:
            rows = self.cases()
            previous = next((row for row in rows if row['id'] == case_id), None)
            if case_id and not previous:
                raise ValueError('Evaluation case not found')
            if request.source_feedback_id and not case_id:
                existing = next((row for row in rows if row.get('source_feedback_id') == request.source_feedback_id), None)
                if existing:
                    return existing
            row = {**request.model_dump(mode='json'), 'id': case_id or f'AQ-{uuid.uuid4().hex[:10]}',
                   'revision': previous['revision'] + 1 if previous else 1, 'updated_at': now()}
            self._write(self.cases_file, [item for item in rows if item['id'] != row['id']] + [row])
            return row

    def list_runs(self):
        with self.lock:
            return [{**{k:v for k,v in row.items() if k not in ('results','case_snapshots')},
                     'completed_case_ids':list(row['results'])} for row in reversed(self._read(self.runs_file))]

    def latest_results(self):
        latest = {}
        with self.lock:
            current = {row['id']:criteria_hash(row) for row in self.cases()}
            for run in reversed(self._read(self.runs_file)):
                if run.get('grader_version') != GRADER_VERSION:
                    continue
                snapshots = {row['id']:criteria_hash(row) for row in run['case_snapshots']}
                for case_id, row in run['results'].items():
                    if case_id not in latest and snapshots.get(case_id) == current.get(case_id):
                        latest[case_id] = {'run_id':run['id'], 'status':row['status'], 'score':row['score'], 'criteria_hash':snapshots[case_id]}
        return latest

    def get_run(self, run_id):
        with self.lock:
            row = next((r for r in self._read(self.runs_file) if r['id'] == run_id), None)
            if row is None:
                raise ValueError('Evaluation run not found')
            if row.get('runtime_code_hash') == digest({}):
                row['runtime_code_hash'] = None
            return row

    def start(self, request: EvaluationRequest, model_status: dict, schema_hash: str):
        if request.execution_mode == 'model' and not model_status.get('configured'):
            raise ValueError('Configure a model before running model evaluation')
        with self.lock:
            rows = self._read(self.runs_file)
            if any(row['status'] == 'running' for row in rows):
                raise ValueError('Another evaluation is running')
            selected = [c for c in self.cases() if c['id'] in request.case_ids]
            if len(selected) != len(set(request.case_ids)):
                raise ValueError('One or more evaluation cases were not found')
            run = {'id': f'eval-{uuid.uuid4().hex[:12]}', 'status':'running', 'started_at':now(), 'completed_at':None,
                   'grader_version':GRADER_VERSION,
                   'runtime_code_hash':digest({name:(Path(__file__).resolve().parent.parent/name).read_text() for name in ('petfood_agent_v2.py','llm_client.py','rule_engine.py','agent_trace/evaluation_workbench.py')}),
                   'execution_mode':request.execution_mode, 'provider': model_status.get('provider') if request.execution_mode == 'model' else None,
                   'model':model_status.get('model') if request.execution_mode == 'model' else None,
                   'schema_hash':schema_hash, 'case_snapshots':selected, 'cases_hash':digest(selected),
                   'case_ids':[case['id'] for case in selected],
                   'total':len(selected), 'completed':0, 'passed':0, 'needs_review':0, 'failed':0, 'results':{}}
            self._write(self.runs_file, rows + [run])
            return run

    def _update(self, run):
        with self.lock:
            rows = self._read(self.runs_file)
            self._write(self.runs_file, [run if r['id'] == run['id'] else r for r in rows])

    def execute(self, run_id, query):
        run = self.get_run(run_id)
        for case in run['case_snapshots']:
            started = now()
            try:
                result = jsonable_encoder(query(case['question'], run['execution_mode']))
                checked = check_answer(case, result, run['execution_mode'])
                row = {**checked, 'answer': result, 'started_at': started, 'completed_at': now()}
            except Exception as exc:
                row = {'status':'failed','score':None,'checks':{},'issues':[f'Query execution failed ({type(exc).__name__})'],
                       'answer':{}, 'references':{'ids':[],'paths':[],'evidence':[]}, 'started_at':started,'completed_at':now()}
            run['results'][case['id']] = row
            run['completed'] += 1
            run['passed' if row['status'] == 'passed' else 'failed' if row['status'] == 'failed' else 'needs_review'] += 1
            self._update(run)
        run.update(status='completed', completed_at=now())
        self._update(run)

    def review_result(self, run_id, case_id, decision, note=''):
        if decision not in ('accepted','rejected'):
            raise ValueError('Invalid review decision')
        with self.lock:
            run = self.get_run(run_id)
            row = run['results'].get(case_id)
            if run['status'] == 'running' or not row or not row.get('review_required'):
                raise ValueError('This result is not ready for manual review')
            row['manual_review'] = {'decision':decision, 'note':note[:2000], 'reviewed_at':now()}
            row['issues'] = list(row['automatic_issues'])
            if decision == 'rejected':
                row['issues'].append('Reviewer did not accept this answer')
            row['status'] = 'reviewed' if decision == 'accepted' and not row['issues'] else 'needs_review'
            for status in ('passed','needs_review','failed','reviewed'):
                run[status] = sum(item['status'] == status for item in run['results'].values())
            self._update(run)
            return run

    def compare(self, before_id, after_id, case_id):
        before, after = self.get_run(before_id), self.get_run(after_id)
        old, new = before['results'].get(case_id), after['results'].get(case_id)
        if not old or not new:
            raise ValueError('Both runs must contain this question')
        old_case = next(c for c in before['case_snapshots'] if c['id'] == case_id)
        new_case = next(c for c in after['case_snapshots'] if c['id'] == case_id)
        def delta(key):
            a = {json.dumps(v,sort_keys=True,ensure_ascii=False) for v in old['references'][key]}
            b = {json.dumps(v,sort_keys=True,ensure_ascii=False) for v in new['references'][key]}
            return {'added':[json.loads(v) for v in sorted(b-a)],'removed':[json.loads(v) for v in sorted(a-b)]}
        return {'before':old,'after':new,'same_criteria':criteria_hash(old_case) == criteria_hash(new_case),
                'schema_changed':before['schema_hash'] != after['schema_hash'],
                'code_changed':(before['runtime_code_hash'] != after['runtime_code_hash']) if before.get('runtime_code_hash') and after.get('runtime_code_hash') else None,
                'evidence_delta':delta('evidence'),'path_delta':delta('paths'),'object_delta':delta('ids')}
