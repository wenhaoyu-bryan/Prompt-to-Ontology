import { useState, useEffect, useRef, Component } from 'react';
import { Card, Input, Button, Space, Typography, Tag, Divider, Spin, message, Modal, Select, Alert, Drawer, Table, Tabs, Row, Col, Statistic, Empty, Descriptions, theme } from 'antd';

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return <pre style={{ color: 'red', padding: 16, fontSize: 12, whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message || this.state.error)}</pre>;
    }
    return this.props.children;
  }
}
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ToolOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useThemeContext } from '../providers/ThemeProvider';
import { api } from '../providers/dataProvider';
import { MOCK_AGENT_RUNS } from '../mocks/agentRuns';
import ReactMarkdown from 'react-markdown';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const EXAMPLE_QUESTION_KEYS = [
  'agent.exampleQ1',
  'agent.exampleQ2',
  'agent.exampleQ3',
  'agent.exampleQ4',
  'agent.exampleQ5',
];

const STATUS_COLORS = {
  completed: 'green',
  running: 'blue',
  failed: 'red',
};

export default function AgentPage() {
  const { t, i18n } = useTranslation();
  const { mode } = useThemeContext();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [llmStatus, setLlmStatus] = useState(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ provider: 'openai', api_key: '', model: 'gpt-4o-mini', base_url: 'https://api.openai.com/v1' });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedRun, setSelectedRun] = useState(null);
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  const chatEndRef = useRef(null);

  const loadLLMStatus = async () => {
    try {
      const { data } = await api.get('/llm/config');
      setLlmStatus(data);
    } catch (err) {
      console.warn('[Agent] failed to load LLM status', err);
      setLlmStatus(null);
    }
  };

  useEffect(() => { loadLLMStatus(); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    const langHint = i18n.language === 'zh' ? '\n\n请用中文回答。' : '';
    try {
      const { data } = await api.post('/pet-food/agent/chat', {
        question: q + langHint,
        context: { current_domain: 'pet_food' },
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer || t('agent.noAnswer'),
        tools: data.tools_used || [],
        llm_used: data.llm_used || false,
        suggestions: data.suggestions || [],
        can_submit_to_review: data.can_submit_to_review || false,
        agent_run_id: data.agent_run_id || '',
        user_message: q,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('agent.connectionError'),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSuggestions = async (msgIndex, suggestions, agentRunId, userMessage) => {
    try {
      const { data } = await api.post('/agent/suggestions/submit-review', {
        agent_run_id: agentRunId,
        user_message: userMessage,
        suggestions: suggestions,
      });
      message.success(t('agent.suggestionsSubmitted'));
      // Update the message to mark as submitted
      setMessages(prev => prev.map((msg, i) =>
        i === msgIndex ? { ...msg, suggestionsSubmitted: true, reviewBatchId: data.batch?.id } : msg
      ));
    } catch (err) {
      message.error(err?.response?.data?.detail || t('agent.suggestionsFailed'));
    }
  };

  const handleSaveConfig = async () => {
    try {
      const { data } = await api.post('/llm/config', configForm);
      setLlmStatus(data);
      setConfigModalOpen(false);
      message.success(t('agent.configSaved'));
      loadLLMStatus();
    } catch (err) {
      message.error(t('agent.configSaveFailed'));
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/llm/test', configForm.api_key ? configForm : {});
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, message: t('agent.testFailed') });
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteConfig = async () => {
    try {
      await api.delete('/llm/config');
      setLlmStatus({ configured: false, source: 'none' });
      message.success(t('agent.runtimeDeleted'));
      loadLLMStatus();
    } catch {
      message.error(t('agent.runtimeDeleteFailed'));
    }
  };

  const handleViewRun = (run) => {
    setSelectedRun(run);
    setRunDrawerOpen(true);
  };

  const llmConfigured = llmStatus?.configured && llmStatus?.provider !== 'none';

  const runColumns = [
    {
      title: t('agent.runId', 'Run ID'),
      dataIndex: 'run_id',
      key: 'run_id',
      width: 90,
      render: (id) => <Text code style={{ fontSize: 12 }}>{id}</Text>,
    },
    {
      title: t('dashboard.prompt'),
      dataIndex: 'prompt',
      key: 'prompt',
      ellipsis: true,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s) => (
        <Tag color={STATUS_COLORS[s]} icon={s === 'running' ? <ClockCircleOutlined /> : <CheckCircleOutlined />}>
          {t(`common.statusLabels.${s}`, s)}
        </Tag>
      ),
    },
    {
      title: t('agent.objectsExtracted'),
      dataIndex: 'objects_extracted',
      key: 'objects',
      width: 80,
    },
    {
      title: t('agent.issuesFound'),
      dataIndex: 'issues_found',
      key: 'issues',
      width: 70,
      render: (v) => v > 0 ? <Tag color="red">{v}</Tag> : <Text type="secondary">0</Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 60,
      render: (_, record) => (
        <Button size="small" type="link" icon={<RightOutlined />} onClick={(e) => { e.stopPropagation(); handleViewRun(record); }} />
      ),
    },
  ];

  const tabItems = [
    {
      key: 'chat',
      label: <span><RobotOutlined /> {t('agent.chat')}</span>,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Chat area */}
          <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            styles={{ body: { height: '65vh', overflow: 'auto', padding: 16 } }}
          >
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <RobotOutlined style={{ fontSize: 48, opacity: 0.15, marginBottom: 16 }} />
                <div>
                  <Text type="secondary">{t('agent.askPrompt')}</Text>
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {EXAMPLE_QUESTION_KEYS.map((key, i) => (
                    <Tag key={i} style={{ cursor: 'pointer' }} onClick={() => { setInput(t(key)); }}>
                      {t(key)}
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 12,
              }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: msg.role === 'user' ? token.colorPrimary : token.colorBgLayout,
                  color: msg.role === 'user' ? '#fff' : token.colorText,
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{ marginBottom: 4 }}>
                      {msg.llm_used ? (
                        <Tag color="success" style={{ fontSize: 12 }}>{t('agent.llmTag')}</Tag>
                      ) : (
                        <Tag color="warning" style={{ fontSize: 12 }}>{t('agent.fallbackTag')}</Tag>
                      )}
                      {msg.tools?.map((tool, j) => (
                        <Tag key={j} style={{ fontSize: 12, marginLeft: 4 }}>{tool}</Tag>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: 'inherit' }}>
                    <ReactMarkdown
                      components={{
                        h1: ({children}) => <h4 style={{margin: '12px 0 4px', fontWeight: 700}}>{children}</h4>,
                        h2: ({children}) => <h5 style={{margin: '10px 0 4px', fontWeight: 700}}>{children}</h5>,
                        h3: ({children}) => <h6 style={{margin: '8px 0 4px', fontWeight: 700}}>{children}</h6>,
                        p: ({children}) => <p style={{margin: '4px 0'}}>{children}</p>,
                        ul: ({children}) => <ul style={{margin: '4px 0', paddingLeft: 20}}>{children}</ul>,
                        ol: ({children}) => <ol style={{margin: '4px 0', paddingLeft: 20}}>{children}</ol>,
                        li: ({children}) => <li style={{margin: '2px 0'}}>{children}</li>,
                        code: ({children, className}) => className
                          ? <pre style={{background: token.colorFillTertiary, padding: 8, borderRadius: 4, fontSize: 12, overflow: 'auto', margin: '6px 0'}}><code>{children}</code></pre>
                          : <code style={{background: token.colorFillTertiary, padding: '1px 4px', borderRadius: 3, fontSize: 12}}>{children}</code>,
                        strong: ({children}) => <strong style={{fontWeight: 600}}>{children}</strong>,
                        table: ({children}) => (
                          <div style={{overflowX: 'auto', margin: '6px 0'}}>
                            <table style={{borderCollapse: 'collapse', fontSize: 12, minWidth: '100%'}}>{children}</table>
                          </div>
                        ),
                        th: ({children}) => <th style={{border: `1px solid ${token.colorBorderSecondary}`, padding: '4px 8px', textAlign: 'left', fontWeight: 600, wordBreak: 'break-word'}}>{children}</th>,
                        td: ({children}) => <td style={{border: `1px solid ${token.colorBorderSecondary}`, padding: '4px 8px', wordBreak: 'break-word'}}>{children}</td>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>

                  {/* Phase 30: Show agent suggestions */}
                  {msg.suggestions?.length > 0 && (
                    <div style={{ marginTop: 12, padding: '8px 10px', background: `color-mix(in srgb, ${token.colorPrimary} 6%, transparent)`, borderRadius: 8, border: `1px solid color-mix(in srgb, ${token.colorPrimary} 15%, transparent)` }}>
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                        {t('agent.proposedUpdates')} ({msg.suggestions.length})
                      </Text>
                      {msg.suggestions.map((sug, j) => {
                        const showRule = sug.related_rule_id && sug.related_rule_id !== 'UNKNOWN_RULE';
                        const showMissingField = sug.missing_field && sug.missing_field !== 'data_quality';
                        return (
                        <div key={j} style={{ fontSize: 12, marginBottom: 6, padding: '6px 8px', background: token.colorBgElevated, borderRadius: 4 }}>
                          <div style={{ marginBottom: 3 }}>
                            <Tag color="purple" style={{ fontSize: 12 }}>{sug.type?.replace(/_/g, ' ')}</Tag>
                            {sug.confidence != null && (
                              <Text type="secondary" style={{ fontSize: 12 }}>({(sug.confidence * 100).toFixed(0)}%)</Text>
                            )}
                            {showRule && (
                              <Tag color="orange" style={{ fontSize: 12, marginLeft: 4 }}>
                                {t('agent.ruleLabel', 'Rule')}: {sug.related_rule_id}{sug.related_rule_name ? ` ${sug.related_rule_name}` : ''}
                              </Tag>
                            )}
                            {showMissingField && (
                              <Tag color="geekblue" style={{ fontSize: 12, marginLeft: 4 }}>
                                {t('agent.missingFieldLabel', 'Missing Field')}: {sug.missing_field}
                              </Tag>
                            )}
                          </div>
                          <Text style={{ fontSize: 12, display: 'block' }}>{sug.title}</Text>
                          {sug.target_object_id && (
                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{t('common.target')}: {sug.target_object_id}</Text>
                          )}
                          {sug.property_update && (
                            <Text code style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                              {sug.property_update.property}: {sug.property_update.old_value ?? '?'} → {sug.property_update.new_value}
                            </Text>
                          )}
                          {sug.candidate_link && (
                            <Text code style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                              {sug.candidate_link.source_id} → {sug.candidate_link.type} → {sug.candidate_link.target_id}
                            </Text>
                          )}
                          {sug.why_it_matters && (
                            <Text type="secondary" italic style={{ fontSize: 12, display: 'block', marginTop: 3 }}>{sug.why_it_matters}</Text>
                          )}
                          {sug.reason && (
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>{sug.reason}</Text>
                          )}
                          {sug.evidence && (
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>{sug.evidence}</Text>
                          )}
                        </div>
                        );
                      })}
                      {msg.suggestionsSubmitted ? (
                        <div style={{ marginTop: 8 }}>
                          <Tag color="success"><CheckCircleOutlined /> {t('agent.suggestionsSubmitted')}</Tag>
                          {msg.reviewBatchId && (
                            <Button type="link" size="small" onClick={() => navigate(`/review?batch_id=${msg.reviewBatchId}`)}>
                              {t('agent.goToReview')} <RightOutlined />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="small"
                          type="primary"
                          icon={<SendOutlined />}
                          style={{ marginTop: 8 }}
                          onClick={() => handleSubmitSuggestions(i, msg.suggestions, msg.agent_run_id, msg.user_message)}
                        >
                          {t('agent.submitSuggestions')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                <div style={{ padding: '10px 14px', borderRadius: 12, background: token.colorBgLayout }}>
                  <Spin size="small" /> <Text type="secondary" style={{ marginLeft: 8 }}>{t('agent.thinking')}</Text>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </Card>

          {/* Input */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <TextArea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={t('agent.askPlaceholder')}
              autoSize={{ minRows: 1, maxRows: 4 }}
              onPressEnter={e => {
                if (!e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              style={{ height: 'auto' }}
            >
              {t('agent.send')}
            </Button>
          </div>
        </div>
      ),
    },
    {
      key: 'history',
      label: <span><HistoryOutlined /> {t('agent.runHistory')} <Tag style={{ fontSize: 12 }}>{t('common.demoData')}</Tag></span>,
      children: (
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={MOCK_AGENT_RUNS}
            columns={runColumns}
            rowKey="run_id"
            size="small"
            pagination={false}
            onRow={(record) => ({
              onClick: () => handleViewRun(record),
              style: { cursor: 'pointer' },
            })}
          />
        </Card>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>{t('agent.title')}</Title>
        <Text type="secondary">{t('agent.subtitle')}</Text>
      </div>
      {/* Tools explanation — compact banner */}
      <Alert
        type="info"
        banner
        showIcon
        icon={<InfoCircleOutlined />}
        title={
          <span style={{ fontSize: 12 }}>
            {t('agent.toolsPanel')}{' '}
            {[t('agent.toolLookup'), t('agent.toolRelation'), t('agent.toolRule'), t('agent.toolEvidence'), t('agent.toolLimitation')].map((tool, i) => (
              <Tag key={i} color="blue" style={{ fontSize: 12, marginLeft: 2 }}>{tool}</Tag>
            ))}
          </span>
        }
      />
      {/* Agent safety boundary */}
      <Alert
        type="warning"
        banner
        showIcon
        icon={<InfoCircleOutlined />}
        message={t('agent.safetyBoundary')}
        style={{ fontSize: 12 }}
      />
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <RobotOutlined style={{ fontSize: 14 }} />
        <Text style={{ fontSize: 13 }}>{t('agent.llmMode')}:</Text>
        {llmConfigured ? (
          <Tag color="success">{t('agent.llmReasoning')}</Tag>
        ) : (
          <Tag color="warning">{t('agent.fallback')}</Tag>
        )}
        {llmConfigured && (
          <Tag>{llmStatus?.source === 'runtime' ? t('agent.runtimeConfig') : t('agent.envConfig')}</Tag>
        )}
        <div style={{ flex: 1 }} />
        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={() => setConfigModalOpen(true)}
        >
          {t('agent.configureLLM')}
        </Button>
      </div>

      {/* Main content */}
      <Card styles={{ body: { padding: '0 16px 16px' } }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ marginTop: 8 }} />
      </Card>

      {/* LLM Config Modal */}
      <Modal
        title={t('agent.llmConfigTitle')}
        open={configModalOpen}
        onCancel={() => { setConfigModalOpen(false); setTestResult(null); }}
        footer={null}
        width={480}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {llmStatus?.configured && (
            <Alert
              type={llmStatus.source === 'runtime' ? 'success' : 'info'}
              title={`${t('agent.currentConfig')}${llmStatus.provider} / ${llmStatus.model}`}
              description={llmStatus.source === 'runtime' ? t('agent.runtimeDesc') : t('agent.envDesc')}
              showIcon
            />
          )}

          <div>
            <Text>{t('agent.provider')}</Text>
            <Select
              value={configForm.provider}
              onChange={v => {
                const defaults = {
                  openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
                  anthropic: { base_url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
                  deepseek: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
                  mimo: { base_url: 'https://api.xiaomimimo.com/v1', model: '' },
                  minimax: { base_url: 'https://api.minimax.chat/v1', model: '' },
                };
                const d = defaults[v] || {};
                setConfigForm(p => ({ ...p, provider: v, base_url: d.base_url ?? p.base_url, model: d.model ?? p.model }));
              }}
              style={{ width: '100%', marginTop: 4 }}
              options={[
                { label: 'OpenAI', value: 'openai' },
                { label: 'Anthropic', value: 'anthropic' },
                { label: 'DeepSeek', value: 'deepseek' },
                { label: 'Mimo', value: 'mimo' },
                { label: 'MiniMax', value: 'minimax' },
              ]}
            />
          </div>

          <div>
            <Text>{t('agent.model')}</Text>
            <Input
              value={configForm.model}
              onChange={e => setConfigForm(p => ({ ...p, model: e.target.value }))}
              placeholder={t('agent.modelPlaceholder')}
              style={{ marginTop: 4 }}
            />
          </div>

          <div>
            <Text>{t('agent.baseUrl')}</Text>
            <Input
              value={configForm.base_url}
              onChange={e => setConfigForm(p => ({ ...p, base_url: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              style={{ marginTop: 4 }}
            />
          </div>

          <div>
            <Text>{t('agent.apiKey')}</Text>
            <Input.Password
              value={configForm.api_key}
              onChange={e => setConfigForm(p => ({ ...p, api_key: e.target.value }))}
              placeholder={t('agent.apiKeyPlaceholder')}
              style={{ marginTop: 4 }}
            />
          </div>

          <Alert
            type="warning"
            title={t('agent.securityNote')}
            showIcon
          />

          {testResult && (
            <Alert
              type={testResult.ok ? 'success' : 'error'}
              title={testResult.message}
              description={testResult.ok && testResult.latency_ms != null ? `${t('agent.latency')}${testResult.latency_ms}ms` : undefined}
              showIcon
            />
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" onClick={handleSaveConfig} disabled={!configForm.api_key}>
              {t('common.save')}
            </Button>
            <Button onClick={handleTestConnection} loading={testing}>
              {t('agent.testConnection')}
            </Button>
            {llmStatus?.source === 'runtime' && (
              <Button danger onClick={handleDeleteConfig}>
                {t('agent.deleteRuntimeKey')}
              </Button>
            )}
          </div>
        </Space>
      </Modal>

      {/* Agent Run Detail Drawer */}
      <Drawer
        title={selectedRun ? `${t('agent.runDetail')} — ${selectedRun.run_id}` : t('agent.runDetail')}
        open={runDrawerOpen}
        onClose={() => { setRunDrawerOpen(false); setSelectedRun(null); }}
        size="large"
      >
        <ErrorBoundary>
        {selectedRun && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Status & Meta */}
            <Card size="small" variant="inner">
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title={t('common.status')}
                    value={t('common.statusLabels.' + selectedRun.status, selectedRun.status)}
                    styles={{ content: { color: selectedRun.status === 'completed' ? token.colorSuccess : selectedRun.status === 'running' ? token.colorPrimary : token.colorError, fontSize: 16 } }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic title={t('agent.objectsExtracted')} value={selectedRun.objects_extracted} />
                </Col>
                <Col span={8}>
                  <Statistic
                    title={t('agent.issuesFound')}
                    value={selectedRun.issues_found}
                    styles={{ content: { color: selectedRun.issues_found > 0 ? token.colorError : undefined } }}
                  />
                </Col>
              </Row>
            </Card>

            {/* Input Prompt */}
            <Card size="small" title={t('agent.inputPrompt')} variant="inner">
              <Text>{selectedRun.prompt}</Text>
            </Card>

            {/* Tools Used */}
            {selectedRun.tools_used?.length > 0 && (
              <Card size="small" title={<><ToolOutlined /> {t('agent.toolsUsed')}</>} variant="inner">
                <Space wrap>
                  {selectedRun.tools_used.map((tool, i) => (
                    <Tag key={i} color="cyan">{tool}</Tag>
                  ))}
                </Space>
              </Card>
            )}

            {/* Summary */}
            {selectedRun.answer_summary && (
              <Card size="small" title={t('agent.answerSummary')} variant="inner">
                <Paragraph style={{ margin: 0, fontSize: 13 }}>{selectedRun.answer_summary}</Paragraph>
              </Card>
            )}

            {/* LLM Info */}
            <Card size="small" variant="inner">
              <Descriptions column={1} size="small">
                <Descriptions.Item label={t('agent.runId', 'Run ID')}>{selectedRun.run_id}</Descriptions.Item>
                <Descriptions.Item label={t('agent.llmUsed')}>
                  {selectedRun.llm_used ? <Tag color="success">{t('common.yes')}</Tag> : <Tag>{t('common.no') + ' (' + t('agent.fallback') + ')'}</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label={t('agent.relationshipsExtracted')}>{selectedRun.relationships_extracted}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Space>
        )}
        </ErrorBoundary>
      </Drawer>
    </div>
  );
}
