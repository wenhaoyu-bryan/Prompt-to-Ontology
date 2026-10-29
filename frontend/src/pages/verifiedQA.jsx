import { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Drawer, Empty, Input, Select, Space, Table, Tag, Typography, theme } from 'antd';
import { FileSearchOutlined, LinkOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QueryEvaluationPage from '../components/evaluation/QueryEvaluationPage';
import { api } from '../providers/dataProvider';
import EvidencePath from '../components/graph/EvidencePath';

const { Text, Title } = Typography;

function VerifiedReferencePage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const zh = i18n.language === 'zh';
  const { token } = theme.useToken();
  const [questions, setQuestions] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [activeId, setActiveId] = useState('');
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [asset, setAsset] = useState('rules.yaml:RR004');
  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [draftMessage, setDraftMessage] = useState('');

  const loadQuestions = async () => {
    try {
      const { data } = await api.get('/verified-qa/questions');
      setQuestions(data.questions || []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.detail || (zh ? '题目加载失败' : 'Could not load questions'));
    }
  };

  const loadRuns = async () => {
    try { const { data } = await api.get('/verified-qa/evaluations'); setRuns(data.runs || []); }
    catch { setRuns([]); }
  };

  useEffect(() => { loadQuestions(); loadRuns(); }, []);

  const runEvaluation = async (changedAssets) => {
    setError(''); setComparison(null); setLoading(true);
    try {
      const { data } = await api.post('/verified-qa/evaluations', { changed_assets: changedAssets });
      setEvaluation(data);
      await loadRuns();
    } catch (err) { setError(err?.response?.data?.detail || (zh ? '评估失败' : 'Evaluation failed')); }
    finally { setLoading(false); }
  };

  const compareRuns = async () => {
    if (runs.length < 2) return;
    try {
      const { data } = await api.get('/verified-qa/evaluations/compare', { params: { before: runs[1].run_id, after: runs[0].run_id } });
      setComparison(data);
    } catch (err) { setError(err?.response?.data?.detail || (zh ? '对比失败' : 'Comparison failed')); }
  };

  const saveDraft = async () => {
    try {
      const { data } = await api.post('/verified-qa/feedback', { question: draftQuestion, reason: draftReason });
      setDraftMessage(`${zh ? '已保存草稿' : 'Draft saved'}: ${data.draft_id}`);
      setDraftQuestion(''); setDraftReason('');
    } catch (err) { setError(err?.response?.data?.detail || (zh ? '草稿保存失败' : 'Could not save draft')); }
  };

  const runQuestion = async (id) => {
    setActiveId(id);
    setAnswer(null);
    setSource(null);
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/verified-qa/answer', { question_id: id });
      setAnswer(data);
    } catch (err) {
      setError(err?.response?.data?.detail || (zh ? '回答失败' : 'Could not answer question'));
    } finally { setLoading(false); }
  };

  const questionColumns = [
    { title: 'ID', dataIndex: 'id', width: 75, render: id => <Text code>{id}</Text> },
    { title: zh ? '可验证问题' : 'Verified question', key: 'question', render: (_, row) => zh ? row.question_zh : row.question },
    { title: zh ? '操作' : 'Action', width: 120, render: (_, row) => <Button size="small" type={activeId === row.id ? 'primary' : 'default'} icon={<PlayCircleOutlined />} onClick={() => runQuestion(row.id)}>{zh ? '只读查询' : 'Run read-only'}</Button> },
  ];

  const evidenceColumns = [
    { title: zh ? '类型' : 'Type', dataIndex: 'kind', width: 105, render: kind => <Tag>{kind}</Tag> },
    { title: zh ? '来源' : 'Source', dataIndex: 'source_path', ellipsis: true },
    { title: zh ? '记录' : 'Record', dataIndex: 'record_id', width: 115 },
    { title: zh ? '字段' : 'Field', dataIndex: 'field', width: 150 },
    { title: zh ? '详情' : 'Detail', width: 100, render: (_, row) => <Button type="link" size="small" onClick={() => setSource(row)}>{zh ? '查看来源' : 'View source'}</Button> },
  ];

  const pathColumns = [
    { title: zh ? '路径类别' : 'Path kind', dataIndex: 'kind', width: 160 },
    { title: zh ? '从' : 'From', dataIndex: 'source_id' },
    { title: zh ? '关系' : 'Relation', dataIndex: 'relation' },
    { title: zh ? '到' : 'To', dataIndex: 'target_id' },
    { title: zh ? '证据' : 'Evidence', width: 110, render: (_, row) => <Button size="small" type="link" onClick={() => setSource(answer?.evidence?.find(item => row.evidence_ids.includes(item.evidence_id)) || null)}>{zh ? '查看依据' : 'View evidence'}</Button> },
  ];

  return <Space orientation="vertical" size={16} style={{ width: '100%' }}>
    <div>
      <Title level={3} style={{ marginBottom: 4 }}><FileSearchOutlined /> {zh ? '可核对问答' : 'Verified Questions'}</Title>
      <Text type="secondary">{zh ? '在固定的 Pet Food 题集上只读查询。答案逐项列出事实、路径与未知原因；此页面不运行自由文本 Agent。' : 'Read-only answers over a bounded Pet Food question set, with facts, paths, and explicit unknowns. This view does not run the free-form Agent.'}</Text>
    </div>
    {error && <Alert type="error" showIcon message={error} action={<Button size="small" icon={<ReloadOutlined />} onClick={loadQuestions}>{zh ? '重试' : 'Retry'}</Button>} />}
    <Card title={zh ? '问题集' : 'Question catalog'}>
      <Table dataSource={questions} columns={questionColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} scroll={{ x: 650 }} />
    </Card>
    <Card title={zh ? '本轮答案' : 'Read-only answer'} loading={loading}>
      {!answer ? <Empty description={zh ? '选择一个问题并点击只读查询' : 'Choose a question and run it'} /> : <Space orientation="vertical" size={14} style={{ width: '100%' }} data-testid="verified-answer">
        <Space wrap><Text code>{answer.question_id}</Text><Tag color={answer.status === 'answered' ? 'green' : answer.status === 'unknown' ? 'orange' : 'blue'}>{answer.status}</Tag><Tag color="default">{zh ? '只读' : 'Read-only'}</Tag></Space>
        <Text strong style={{ fontSize: 16 }}>{answer.conclusion}</Text>
        <Text type="secondary">{zh ? '答案和路径来自仓库中的样例文件；运行时图谱需单独核对。' : 'The answer and path come from checked-in sample files; the runtime graph is checked separately.'}</Text>
        {answer.unknown_reasons?.length > 0 && <Alert type="warning" showIcon message={zh ? '无法确认的原因' : 'Why this cannot be confirmed'} description={answer.unknown_reasons.join(', ')} />}
        {answer.path?.length > 0 && <Card size="small" title={zh ? '样例证据路径' : 'Sample evidence path'} extra={answer.path.some(step => step.kind === 'instance_relation') && <Button onClick={() => navigate(`/graph?question=${encodeURIComponent(answer.question_id)}`)}>{zh ? '在图谱中查看' : 'Explore in graph'}</Button>}>
          <EvidencePath path={answer.path} zh={zh} onEvidence={ids => setSource(answer.evidence.find(item => ids?.includes(item.evidence_id)) || null)} />
          <Text type="secondary">{zh ? '点击连线查看来源；图谱入口会核对运行时中是否存在该关系。' : 'Select a relationship to inspect its source. The graph view checks whether the relationship exists at runtime.'}</Text>
        </Card>}
        <Card size="small" title={<><FileSearchOutlined /> {zh ? '事实与来源' : 'Facts and sources'}</>} styles={{ body: { padding: 0 } }}>
          <Table dataSource={answer.evidence || []} columns={evidenceColumns} rowKey="evidence_id" size="small" pagination={false} locale={{ emptyText: zh ? '没有可引用的事实' : 'No cited facts' }} scroll={{ x: 700 }} />
        </Card>
        <Card size="small" title={<><LinkOutlined /> {zh ? '关系与评估路径' : 'Relations and evaluation paths'}</>} styles={{ body: { padding: 0 } }}>
          <Table dataSource={answer.path || []} columns={pathColumns} rowKey={row => `${row.kind}-${row.source_id}-${row.relation}-${row.target_id}`} size="small" pagination={false} locale={{ emptyText: zh ? '没有可引用的路径' : 'No cited path' }} scroll={{ x: 700 }} />
        </Card>
      </Space>}
    </Card>
    <Card title={zh ? '回归评估' : 'Regression evaluation'}>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Text type="secondary">{zh ? '22 道已核对题分别评估结论、证据、路径与恰当弃答。参考答案只供评估器使用。' : '22 reviewed questions score conclusion, evidence, path, and appropriate abstention separately. Reference answers are evaluator-only.'}</Text>
        <Space wrap>
          <Button type="primary" loading={loading} onClick={() => runEvaluation(null)}>{zh ? '运行全部 22 题' : 'Run all 22 questions'}</Button>
          <Select value={asset} onChange={setAsset} style={{ width: 230 }} options={[...new Set(questions.flatMap(q => q.depends_on || []))].map(value => ({ value, label: value }))} />
          <Button loading={loading} onClick={() => runEvaluation([asset])}>{zh ? '重跑受影响题' : 'Rerun affected questions'}</Button>
          <Button disabled={runs.length < 2} onClick={compareRuns}>{zh ? '对比最近两轮' : 'Compare latest two runs'}</Button>
        </Space>
        {evaluation && <>
          <Text code>{evaluation.run_id}</Text>
          <Space wrap>{Object.entries(evaluation.summary).map(([key, result]) => <Tag key={key} color={result.passed === result.total ? 'green' : 'red'}>{key}: {result.passed}/{result.total}</Tag>)}</Space>
          <Table size="small" rowKey="id" pagination={{ pageSize: 10 }} dataSource={Object.entries(evaluation.results).map(([id, result]) => ({ id, ...result }))} columns={[
            { title: 'ID', dataIndex: 'id', width: 80 },
            { title: zh ? '状态' : 'Status', render: (_, row) => row.answer.status },
            { title: zh ? '结论' : 'Conclusion', render: (_, row) => row.answer.conclusion },
            { title: zh ? '四项评分' : 'Four scores', render: (_, row) => Object.entries(row.scores).map(([key, passed]) => <Tag key={key} color={passed ? 'green' : 'red'}>{key}</Tag>) },
          ]} />
        </>}
        {comparison && <Card size="small" title={zh ? '逐题前后对比' : 'Per-question before / after'}>
          <Table size="small" rowKey="id" pagination={{ pageSize: 10 }} dataSource={Object.entries(comparison.questions).map(([id, result]) => ({ id, ...result }))} columns={[
            { title: 'ID', dataIndex: 'id', width: 80 },
            { title: zh ? '变化' : 'Changed', dataIndex: 'changed', render: changed => <Tag color={changed ? 'orange' : 'green'}>{changed ? 'yes' : 'no'}</Tag> },
            { title: zh ? '前结论' : 'Before', render: (_, row) => row.conclusion.before || '—' },
            { title: zh ? '后结论' : 'After', render: (_, row) => row.conclusion.after },
            { title: zh ? '证据 / 路径 / 未知' : 'Evidence / path / unknown', render: (_, row) => ['evidence', 'path', 'unknown_reasons'].map(key => <Tag key={key} color={JSON.stringify(row[key].before) === JSON.stringify(row[key].after) ? 'green' : 'orange'}>{key}</Tag>) },
          ]} />
        </Card>}
        <Card size="small" title={zh ? '建议新增问题（仅存草稿）' : 'Suggest a question (draft only)'}>
          <Space wrap><Input value={draftQuestion} onChange={e => setDraftQuestion(e.target.value)} placeholder={zh ? '问题' : 'Question'} style={{ width: 280 }} /><Input value={draftReason} onChange={e => setDraftReason(e.target.value)} placeholder={zh ? '原因或缺口' : 'Reason or gap'} style={{ width: 220 }} /><Button disabled={!draftQuestion.trim() || !draftReason.trim()} onClick={saveDraft}>{zh ? '保存草稿' : 'Save draft'}</Button></Space>
          {draftMessage && <Alert style={{ marginTop: 8 }} type="success" message={draftMessage} />}
        </Card>
      </Space>
    </Card>
    <Drawer title={zh ? '原始来源记录' : 'Source record'} open={!!source} onClose={() => setSource(null)} size={480}>
      {source && <Descriptions column={1} bordered size="small" items={[
        { key: 'path', label: zh ? '来源文件' : 'Source file', children: <Text code>{source.source_path}</Text> },
        { key: 'hash', label: 'SHA-256', children: <Text copyable style={{ wordBreak: 'break-all' }}>{source.source_sha256}</Text> },
        { key: 'record', label: zh ? '记录 ID' : 'Record ID', children: source.record_id },
        { key: 'field', label: zh ? '字段' : 'Field', children: source.field },
        { key: 'value', label: zh ? '原始值' : 'Source value', children: <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, color: token.colorText }}>{typeof source.value === 'object' ? JSON.stringify(source.value, null, 2) : String(source.value ?? '')}</pre> },
      ]} />}
    </Drawer>
  </Space>;
}

export default function VerifiedQAPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  if (params.get("view") !== "reference") return <QueryEvaluationPage />;
  return <><Button style={{marginBottom:16}} onClick={() => navigate("/verified-qa")}>{i18n.language.startsWith("zh") ? "返回评测与反馈" : "Back to evaluation"}</Button><VerifiedReferencePage /></>;
}
