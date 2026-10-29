import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from agent_trace.evaluation_workbench import EvaluationWorkbench, EvaluationCase, EvaluationRequest, check_answer, digest

ROOT = Path(__file__).resolve().parents[2]


def sample_answer():
    return {'answer':'PF001 contains chicken. RR003 is a rule result.', 'answer_llm_used':True,
            'llm_used':True,'llm_model':'test-model','trace_id':'trace-test','agent_run_id':'run-test',
            'tool_results':[{'status':'success','data':[{'id':'PF001','ingredient_id':'ING001','rule_id':'RR003'}],
              'evidence':['RR003: contains chicken'], 'paths':[{'kind':'instance_relation','source_id':'PF001','relation':'CONTAINS','target_id':'ING001','evidence_ids':[]}]}]}


class AnswerCheckTests(unittest.TestCase):
    def test_only_configured_criteria_count_and_wrong_facts_fail(self):
        case=EvaluationCase(question='Question',expected='Expected',required_ids=['PF001'],product_ids=['PF001'],answer_terms=['PF001'],evidence_terms=['RR003']).model_dump()
        passed=check_answer(case,sample_answer(),'model')
        self.assertEqual(passed['score'],100)
        self.assertEqual(passed['status'],'passed')
        case['product_ids']=['PF002']
        failed=check_answer(case,sample_answer(),'model')
        self.assertFalse(failed['checks']['facts'])
        self.assertEqual(failed['status'],'needs_review')

    def test_fallback_cannot_pass_model_evaluation(self):
        result=sample_answer();result['answer_llm_used']=False
        checked=check_answer({'required_ids':['PF001']},result,'model')
        self.assertEqual(checked['status'],'needs_review')
        self.assertIn('fallback', ' '.join(checked['issues']))
        self.assertEqual(check_answer({'required_ids':['PF001']},result,'deterministic')['status'],'passed')

    def test_no_checks_requires_human_review_and_has_no_score(self):
        checked=check_answer({},sample_answer(),'model')
        self.assertIsNone(checked['score'])
        self.assertEqual(checked['status'],'needs_review')

    def test_paths_exclusions_and_unknowns_are_independent(self):
        case={'required_paths':[{'source_id':'PF001','relation':'CONTAINS','target_id':'ING001'}], 'forbidden_terms':['cures']}
        self.assertEqual(check_answer(case,sample_answer(),'model')['status'],'passed')
        case['required_paths'][0]['target_id']='ING002'
        self.assertFalse(check_answer(case,sample_answer(),'model')['checks']['path'])
        unknown={'answer':'Product not found','answer_llm_used':True,'tool_results':[{'status':'not_found','data':None}]}
        checked=check_answer({'product_ids':[],'expected_unknown':True,'no_paths':True},unknown,'model')
        self.assertTrue(checked['checks']['abstention'])
        self.assertTrue(checked['review_required'])
        self.assertEqual(checked['status'],'needs_review')
        self.assertEqual(check_answer({'expected_unknown':True},sample_answer(),'model')['status'],'needs_review')

    def test_tool_error_never_passes_as_empty_success(self):
        result={'answer':'Unable to query','answer_llm_used':True,'tool_results':[{'status':'error','data':None}]}
        self.assertEqual(check_answer({'product_ids':[]},result,'model')['status'],'needs_review')


class EvaluationRunTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.service=EvaluationWorkbench(ROOT,Path(self.tmp.name))

    def start(self,ids=None,mode='model'):
        return self.service.start(EvaluationRequest(case_ids=ids or ['AQ01'],execution_mode=mode),{'configured':True,'provider':'test','model':'test-model'},'schema-1')

    def test_run_uses_actual_callback_and_saves_progress_per_case(self):
        run=self.start(['AQ01','AQ02'])
        self.assertNotEqual(run['runtime_code_hash'], digest({}))
        calls=[]
        def query(question,mode):
            calls.append((question,mode))
            if len(calls)==1: raise RuntimeError('private provider details')
            return sample_answer()
        self.service.execute(run['id'],query)
        saved=self.service.get_run(run['id'])
        self.assertEqual(saved['completed'],2)
        self.assertEqual(saved['status'],'completed')
        self.assertEqual(saved['failed'],1)
        self.assertEqual(len(calls),2)
        self.assertNotIn('private provider details', str(saved))
        self.assertEqual(self.service.latest_results()['AQ02']['run_id'],run['id'])

    def test_only_one_batch_and_configured_model_required(self):
        with self.assertRaises(ValueError):
            self.service.start(EvaluationRequest(case_ids=['AQ01']),{'configured':False},'schema')
        self.start()
        with self.assertRaises(ValueError): self.start()

    def test_revisions_are_snapshotted_and_comparison_reports_real_changes(self):
        first=self.start();self.service.execute(first['id'],lambda *_: sample_answer())
        case=next(c for c in self.service.cases() if c['id']=='AQ01')
        self.service.save_case(EvaluationCase(**{**case,'expected':'New expected result'}),'AQ01')
        second=self.start()
        answer=sample_answer();answer['tool_results'][0]['paths']=[];answer['tool_results'][0]['evidence']=[]
        self.service.execute(second['id'],lambda *_: answer)
        compared=self.service.compare(first['id'],second['id'],'AQ01')
        self.assertFalse(compared['same_criteria'])
        self.assertEqual(len(compared['path_delta']['removed']),1)
        self.assertEqual(len(compared['evidence_delta']['removed']),1)
        self.assertEqual(self.service.get_run(first['id'])['case_snapshots'][0]['revision'],1)

    def test_restarting_marks_unfinished_run_interrupted(self):
        run=self.start()
        restored=EvaluationWorkbench(ROOT,Path(self.tmp.name))
        self.assertEqual(restored.get_run(run['id'])['status'],'interrupted')

    def test_feedback_conversion_is_idempotent(self):
        request=EvaluationCase(question='From feedback',expected='Needs review',source_feedback_id='feedback-1')
        a=self.service.save_case(request);b=self.service.save_case(request)
        self.assertEqual(a['id'],b['id'])
        self.assertEqual(len(self.service.cases()),5)

    def test_editing_case_invalidates_latest_result(self):
        run=self.start();self.service.execute(run['id'],lambda *_:sample_answer())
        self.assertIn('AQ01',self.service.latest_results())
        case=next(c for c in self.service.cases() if c['id']=='AQ01')
        self.service.save_case(EvaluationCase(**{**case,'question':'A different question'}),'AQ01')
        self.assertNotIn('AQ01',self.service.latest_results())

    def test_missing_data_answer_requires_recorded_review_without_changing_score(self):
        run=self.start(['AQ04'])
        result={'answer':'PF999 has 99 grams of fat', 'answer_llm_used':True, 'tool_results':[{'status':'not_found'}]}
        self.service.execute(run['id'],lambda *_:result)
        row=self.service.get_run(run['id'])['results']['AQ04']
        self.assertEqual(row['status'],'needs_review')
        self.assertTrue(row['review_required'])
        accepted=self.service.review_result(run['id'],'AQ04','accepted','Checked the answer')
        self.assertEqual(accepted['results']['AQ04']['status'],'reviewed')
        self.assertEqual(accepted['results']['AQ04']['score'],row['score'])
        rejected=self.service.review_result(run['id'],'AQ04','rejected','Unsupported claim')
        self.assertEqual(rejected['results']['AQ04']['status'],'needs_review')

    def test_real_suggestion_timestamps_are_serialized_before_persistence(self):
        run=self.start()
        answer=sample_answer();answer['suggestions']=[{'created_at':datetime(2026,10,29,tzinfo=timezone.utc)}]
        self.service.execute(run['id'],lambda *_:answer)
        saved=self.service.get_run(run['id'])
        self.assertEqual(saved['status'],'completed')
        self.assertEqual(saved['results']['AQ01']['answer']['suggestions'][0]['created_at'],'2026-10-29T00:00:00+00:00')

if __name__=='__main__':unittest.main()
