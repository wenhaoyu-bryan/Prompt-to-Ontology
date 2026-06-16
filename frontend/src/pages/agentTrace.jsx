import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Tag, Space, Typography, Button, message, Drawer,
  Timeline, Progress, Row, Col, Spin, Result, Descriptions, Alert,
} from 'antd';
import {
  ReloadOutlined,
  EyeOutlined,
  ExperimentOutlined,
  SyncOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ToolOutlined,
  NodeIndexOutlined,
  SafetyCertificateOutlined,
  BulbOutlined,
  LinkOutlined,
  RightOutlined,
  FileSearchOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../providers/dataProvider';

const { Title, Text, Paragraph } = Typography;

const STATUS_COLORS = {
  completed: 'green',
  running: 'blue',
  failed: 'red',
  pending: 'gold',
  partial: 'orange',
  success: 'green',
  error: 'red',
};

const SUGGESTION_STATUS_COLORS = {
  generated: 'blue',
  submitted_to_review: 'orange',
  approved: 'green',
  applied: 'green',
  rejected: 'red',
  failed: 'red',
};

const SCORE_COLORS = [
  { key: 'groundedness', color: '#1677ff', icon: <CheckCircleOutlined /> },
  { key: 'tool_usage', color: '#722ed1', icon: <ToolOutlined /> },
  { key: 'evidence_coverage', color: '#13c2c2', icon: <FileSearchOutlined /> },
  { key: 'review_safety', color: '#fa8c16', icon: <SafetyCertificateOutlined /> },
  { key: 'answer_completeness', color: '#52c41a', icon: <BarChartOutlined /> },
];

function getScoreColor(value) {
  if (value >= 80) return '#52c41a';
  if (value >= 60) return '#fa8c16';
  return '#ff4d4f';
}

function formatTime(ts) {
  if (!ts) return '---';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function truncate(str, len) {
  if (!str) return '---';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ── Evaluation Score Cards ────────────────────────────────────────────────

function EvaluationScores({ evaluation }) {
  const { t } = useTranslation();

  if (!evaluation) return null;

  const scores = evaluation.scores || {};
  const issues = evaluation.issues || [];
  const labels = evaluation.labels || {};

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Text strong style={{ fontSize: 14 }}>{t('agentTrace.evaluationScores')}</Text>
      <Row gutter={[12, 12]}>
        {SCORE_COLORS.map(({ key, color, icon }) => {
          const value = scores[key] ?? 0;
          return (
            <Col xs={12} sm={8} key={key}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <Progress
                  type="circle"
                  percent={value}
                  size={64}
                  strokeColor={getScoreColor(value)}
                  format={(pct) => `${pct}`}
                />
                <div style={{ marginTop: 8 }}>
                  {icon}{' '}
                  <Text style={{ fontSize: 11 }}>
                    {t(`agentTrace.score.${key}`, key)}
                  </Text>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Issues / Warnings */}
      {issues.length > 0 && (
        <div>
          <Text strong style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
            <WarningOutlined /> {t('agentTrace.issuesWarnings')}
          </Text>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {issues.map((issue, idx) => (
              <Alert
                key={idx}
                type={issue.severity === 'critical' ? 'error' : issue.severity === 'high' ? 'warning' : 'info'}
                message={issue.message || issue.label || String(issue)}
                description={issue.detail || undefined}
                showIcon
                style={{ fontSize: 12 }}
              />
            ))}
          </Space>
        </div>
      )}

      {/* Labels */}
      {Object.keys(labels).length > 0 && (
        <div>
          <Text strong style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
            {t('agentTrace.labels')}
          </Text>
          <Space wrap size={[4, 4]}>
            {Object.entries(labels).map(([key, value]) => (
              <Tag key={key} color="default">
                {key}: {String(value)}
              </Tag>
            ))}
          </Space>
        </div>
      )}
    </Space>
  );
}

// ── Suggestion Lifecycle Table ────────────────────────────────────────────

function SuggestionTable({ suggestions, t, navigate }) {
  if (!suggestions || suggestions.length === 0) {
    return <Text type="secondary">{t('agentTrace.noSuggestions')}</Text>;
  }

  const columns = [
    {
      title: t('agentTrace.suggestionId'),
      dataIndex: 'suggestion_id',
      key: 'suggestion_id',
      width: 140,
      render: (v) => <Text code style={{ fontSize: 11 }}>{truncate(v, 12)}</Text>,
    },
    {
      title: t('common.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '---'}</Text>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status) => (
        <Tag color={SUGGESTION_STATUS_COLORS[status] || 'default'} style={{ fontSize: 11 }}>
          {t(`agentTrace.suggestionStatus.${status}`, status)}
        </Tag>
      ),
    },
    {
      title: t('agentTrace.reviewBatch'),
      dataIndex: 'review_batch_id',
      key: 'review_batch_id',
      width: 130,
      render: (batchId) => batchId ? (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, fontSize: 11 }}
          onClick={() => navigate(`/review?batch_id=${batchId}`)}
        >
          {truncate(batchId, 10)} <RightOutlined />
        </Button>
      ) : '---',
    },
  ];

  return (
    <Table
      dataSource={suggestions}
      columns={columns}
      rowKey={(r, i) => r.suggestion_id || `suggestion-${i}`}
      size="small"
      pagination={false}
      scroll={{ x: 520 }}
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function AgentTracePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // List state
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Evaluation state
  const [evaluations, setEvaluations] = useState([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);

  // Action loading states
  const [actionLoading, setActionLoading] = useState({});

  // ── Load traces list ───────────────────────────────────────────────────

  const loadTraces = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get('/agent/traces', { params: { limit: 50 } });
      setTraces(data.traces || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load evaluations ───────────────────────────────────────────────────

  const loadEvaluations = useCallback(async () => {
    try {
      const { data } = await api.get('/agent/evaluations');
      setEvaluations(data.evaluations || []);
    } catch {
      setEvaluations([]);
    }
  }, []);

  useEffect(() => {
    loadTraces();
    loadEvaluations();
  }, [loadTraces, loadEvaluations]);

  // ── Open trace detail drawer ───────────────────────────────────────────

  const openTraceDetail = async (traceId) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setSelectedEvaluation(null);
    try {
      const { data } = await api.get(`/agent/traces/${traceId}`);
      setSelectedTrace(data);

      // Fetch evaluation if this trace has one
      if (data.evaluation_id) {
        try {
          const evalRes = await api.get('/agent/evaluations');
          const found = (evalRes.data.evaluations || []).find(
            (e) => e.evaluation_id === data.evaluation_id
          );
          if (found) setSelectedEvaluation(found);
        } catch { /* ignore */ }
      }
    } catch {
      message.error(t('common.loadFailed'));
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Re-evaluate trace ──────────────────────────────────────────────────

  const handleReEvaluate = async (traceId) => {
    setActionLoading((prev) => ({ ...prev, [traceId]: 'evaluate' }));
    try {
      await api.post(`/agent/traces/${traceId}/evaluate`);
      message.success(t('agentTrace.evaluateSuccess'));
      loadTraces();
      loadEvaluations();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    } finally {
      setActionLoading((prev) => ({ ...prev, [traceId]: null }));
    }
  };

  // ── Refresh review status ──────────────────────────────────────────────

  const handleRefreshReview = async (traceId) => {
    setActionLoading((prev) => ({ ...prev, [traceId]: 'refresh' }));
    try {
      await api.post(`/agent/traces/${traceId}/refresh-review-status`);
      message.success(t('agentTrace.refreshSuccess'));
      loadTraces();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    } finally {
      setActionLoading((prev) => ({ ...prev, [traceId]: null }));
    }
  };

  // ── Loading / Error states ─────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Result
        status="warning"
        title={t('common.loadFailed')}
        extra={
          <Button type="primary" icon={<ReloadOutlined />} onClick={loadTraces}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }

  // ── Table columns ──────────────────────────────────────────────────────

  const columns = [
    {
      title: t('agentTrace.traceId'),
      dataIndex: 'trace_id',
      key: 'trace_id',
      width: 130,
      render: (v) => <Text code style={{ fontSize: 11 }}>{truncate(v, 10)}</Text>,
    },
    {
      title: t('agentTrace.question'),
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{truncate(v, 60)}</Text>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={STATUS_COLORS[status] || 'default'} style={{ fontSize: 11 }}>
          {t(`common.statusLabels.${status}`, status)}
        </Tag>
      ),
    },
    {
      title: t('agentTrace.tools'),
      dataIndex: 'tool_calls',
      key: 'tool_calls',
      width: 80,
      align: 'center',
      render: (v) => (
        <Tag icon={<ToolOutlined />} color="default">
          {Array.isArray(v) ? v.length : (v || 0)}
        </Tag>
      ),
    },
    {
      title: t('agentTrace.objects'),
      dataIndex: 'objects_referenced',
      key: 'objects_referenced',
      width: 80,
      align: 'center',
      render: (v) => (
        <Tag icon={<NodeIndexOutlined />} color="default">
          {Array.isArray(v) ? v.length : (v || 0)}
        </Tag>
      ),
    },
    {
      title: t('agentTrace.rules'),
      dataIndex: 'rules_referenced',
      key: 'rules_referenced',
      width: 80,
      align: 'center',
      render: (v) => (
        <Tag icon={<SafetyCertificateOutlined />} color="default">
          {Array.isArray(v) ? v.length : (v || 0)}
        </Tag>
      ),
    },
    {
      title: t('agentTrace.suggestions'),
      dataIndex: 'suggestions',
      key: 'suggestions',
      width: 90,
      align: 'center',
      render: (v) => (
        <Tag icon={<BulbOutlined />} color={Array.isArray(v) && v.length > 0 ? 'orange' : 'default'}>
          {Array.isArray(v) ? v.length : (v || 0)}
        </Tag>
      ),
    },
    {
      title: t('agentTrace.evaluation'),
      dataIndex: 'evaluation_id',
      key: 'evaluation_id',
      width: 100,
      align: 'center',
      render: (v) => v ? (
        <Tag icon={<ExperimentOutlined />} color="purple" style={{ fontSize: 11 }}>
          {t('agentTrace.evaluated')}
        </Tag>
      ) : (
        <Tag color="default" style={{ fontSize: 11 }}>{t('agentTrace.notEvaluated')}</Tag>
      ),
    },
    {
      title: t('agentTrace.createdAt'),
      dataIndex: 'started_at',
      key: 'started_at',
      width: 160,
      render: (v) => <Text type="secondary" style={{ fontSize: 11 }}>{formatTime(v)}</Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openTraceDetail(record.trace_id)}
            style={{ padding: '0 4px', fontSize: 12 }}
          >
            {t('agentTrace.openTrace')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ExperimentOutlined />}
            loading={actionLoading[record.trace_id] === 'evaluate'}
            onClick={() => handleReEvaluate(record.trace_id)}
            style={{ padding: '0 4px', fontSize: 12 }}
          >
            {t('agentTrace.reEvaluate')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<SyncOutlined />}
            loading={actionLoading[record.trace_id] === 'refresh'}
            onClick={() => handleRefreshReview(record.trace_id)}
            style={{ padding: '0 4px', fontSize: 12 }}
          >
            {t('agentTrace.refreshReview')}
          </Button>
        </Space>
      ),
    },
  ];

  // ── Build tool call timeline items ─────────────────────────────────────

  const buildToolTimeline = (toolCalls) => {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
    return toolCalls.map((call, idx) => {
      const isLast = idx === toolCalls.length - 1;
      const dotColor = call.error ? 'red' : (isLast ? 'blue' : 'green');
      return {
        color: dotColor,
        children: (
          <div>
            <Text strong style={{ fontSize: 12 }}>{call.tool_name || call.name || `Step ${idx + 1}`}</Text>
            {call.status && (
              <Tag
                color={call.status === 'success' ? 'green' : call.status === 'error' ? 'red' : 'blue'}
                style={{ marginLeft: 8, fontSize: 10 }}
              >
                {call.status}
              </Tag>
            )}
            <br />
            {call.input && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {typeof call.input === 'string' ? truncate(call.input, 100) : JSON.stringify(call.input).slice(0, 100)}
              </Text>
            )}
            {call.output && (
              <>
                <br />
                <Text style={{ fontSize: 11 }}>
                  {typeof call.output === 'string' ? truncate(call.output, 120) : JSON.stringify(call.output).slice(0, 120)}
                </Text>
              </>
            )}
            {call.duration_ms != null && (
              <>
                <br />
                <Text type="secondary" style={{ fontSize: 10 }}>{call.duration_ms}ms</Text>
              </>
            )}
            {call.error && (
              <>
                <br />
                <Text type="danger" style={{ fontSize: 11 }}>{call.error}</Text>
              </>
            )}
          </div>
        ),
      };
    });
  };

  // ── Object Referenced columns ──────────────────────────────────────────

  const objectColumns = [
    {
      title: t('common.id'),
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (v) => <Text code style={{ fontSize: 11 }}>{truncate(v, 14)}</Text>,
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (v) => <Tag color="blue" style={{ fontSize: 11 }}>{v || '---'}</Tag>,
    },
    {
      title: t('common.name'),
      dataIndex: 'label',
      key: 'label',
      ellipsis: true,
      render: (v, record) => <Text style={{ fontSize: 12 }}>{v || record.name || '---'}</Text>,
    },
  ];

  // ── Rules Referenced columns ───────────────────────────────────────────

  const ruleColumns = [
    {
      title: t('common.id'),
      dataIndex: 'id',
      key: 'id',
      width: 140,
      render: (v) => <Text code style={{ fontSize: 11 }}>{truncate(v, 14)}</Text>,
    },
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '---'}</Text>,
    },
  ];

  // ── Evidence Edges columns ─────────────────────────────────────────────

  const evidenceColumns = [
    {
      title: t('common.source'),
      dataIndex: 'source',
      key: 'source',
      width: 140,
      render: (v) => <Text code style={{ fontSize: 11 }}>{truncate(v, 14)}</Text>,
    },
    {
      title: t('common.target'),
      dataIndex: 'target',
      key: 'target',
      width: 140,
      render: (v) => <Text code style={{ fontSize: 11 }}>{truncate(v, 14)}</Text>,
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (v) => <Tag color="cyan" style={{ fontSize: 11 }}>{v || '---'}</Tag>,
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {/* Hero */}
      <Card
        size="small"
        style={{ background: 'linear-gradient(135deg, rgba(114,46,209,0.06) 0%, rgba(22,119,255,0.06) 100%)' }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <RobotOutlined /> {t('agentTrace.title')}
            </Title>
            <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
              {t('agentTrace.subtitle')}
            </Paragraph>
          </Col>
          <Col>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { loadTraces(); loadEvaluations(); }}
            >
              {t('common.refresh')}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Section A: Recent Traces Table */}
      <Card
        title={<><EyeOutlined /> {t('agentTrace.recentTraces')} ({traces.length})</>}
        size="small"
      >
        <Table
          dataSource={traces}
          columns={columns}
          rowKey="trace_id"
          size="small"
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} traces` }}
        />
      </Card>

      {/* Section B-D: Trace Detail Drawer */}
      <Drawer
        title={
          <Space>
            <RobotOutlined />
            <span>{t('agentTrace.traceDetail')}</span>
            {selectedTrace?.trace_id && (
              <Text code style={{ fontSize: 12 }}>{truncate(selectedTrace.trace_id, 12)}</Text>
            )}
          </Space>
        }
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedTrace(null); setSelectedEvaluation(null); }}
        width={720}
        destroyOnClose
      >
        {detailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : selectedTrace ? (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {/* Question & Answer */}
            <Card size="small" title={t('agentTrace.questionAnswer')}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div>
                  <Text strong style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                    {t('agentTrace.question')}
                  </Text>
                  <Paragraph style={{ margin: '4px 0 0', fontSize: 13 }}>
                    {selectedTrace.question || '---'}
                  </Paragraph>
                </div>
                <div>
                  <Text strong style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                    {t('agentTrace.answer')}
                  </Text>
                  <Paragraph style={{ margin: '4px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                    {selectedTrace.answer || '---'}
                  </Paragraph>
                </div>
                <div>
                  <Tag
                    color={STATUS_COLORS[selectedTrace.status] || 'default'}
                    style={{ fontSize: 12 }}
                  >
                    {t(`common.statusLabels.${selectedTrace.status}`, selectedTrace.status)}
                  </Tag>
                  {selectedTrace.started_at && (
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                      <ClockCircleOutlined /> {formatTime(selectedTrace.started_at)}
                      {selectedTrace.completed_at && ` -> ${formatTime(selectedTrace.completed_at)}`}
                    </Text>
                  )}
                </div>
              </Space>
            </Card>

            {/* Tool Calls Timeline */}
            {Array.isArray(selectedTrace.tool_calls) && selectedTrace.tool_calls.length > 0 && (
              <Card size="small" title={<><ToolOutlined /> {t('agentTrace.toolCallsTimeline')}</>}>
                <Timeline items={buildToolTimeline(selectedTrace.tool_calls)} />
              </Card>
            )}

            {/* Objects Referenced */}
            {Array.isArray(selectedTrace.objects_referenced) && selectedTrace.objects_referenced.length > 0 && (
              <Card size="small" title={<><NodeIndexOutlined /> {t('agentTrace.objectsReferenced')} ({selectedTrace.objects_referenced.length})</>}>
                <Table
                  dataSource={selectedTrace.objects_referenced}
                  columns={objectColumns}
                  rowKey={(r, i) => r.id || `obj-${i}`}
                  size="small"
                  pagination={false}
                  scroll={{ x: 400 }}
                />
              </Card>
            )}

            {/* Rules Referenced */}
            {Array.isArray(selectedTrace.rules_referenced) && selectedTrace.rules_referenced.length > 0 && (
              <Card size="small" title={<><SafetyCertificateOutlined /> {t('agentTrace.rulesReferenced')} ({selectedTrace.rules_referenced.length})</>}>
                <Table
                  dataSource={selectedTrace.rules_referenced}
                  columns={ruleColumns}
                  rowKey={(r, i) => r.id || `rule-${i}`}
                  size="small"
                  pagination={false}
                />
              </Card>
            )}

            {/* Evidence Edges */}
            {Array.isArray(selectedTrace.evidence_edges_referenced) && selectedTrace.evidence_edges_referenced.length > 0 && (
              <Card size="small" title={<><LinkOutlined /> {t('agentTrace.evidenceEdges')} ({selectedTrace.evidence_edges_referenced.length})</>}>
                <Table
                  dataSource={selectedTrace.evidence_edges_referenced}
                  columns={evidenceColumns}
                  rowKey={(r, i) => `${r.source}-${r.target}-${i}`}
                  size="small"
                  pagination={false}
                  scroll={{ x: 440 }}
                />
              </Card>
            )}

            {/* Section D: Suggestions */}
            <Card size="small" title={<><BulbOutlined /> {t('agentTrace.suggestions')}</>}>
              <SuggestionTable
                suggestions={selectedTrace.suggestions}
                t={t}
                navigate={navigate}
              />
            </Card>

            {/* Section C: Evaluation Scores */}
            {selectedEvaluation && (
              <Card size="small" title={<><ExperimentOutlined /> {t('agentTrace.evaluation')}</>}>
                <EvaluationScores evaluation={selectedEvaluation} />
              </Card>
            )}

            {/* No evaluation yet — show trigger button */}
            {!selectedEvaluation && selectedTrace.evaluation_id && (
              <Card size="small">
                <Space>
                  <Spin size="small" />
                  <Text type="secondary">{t('agentTrace.loadingEvaluation')}</Text>
                </Space>
              </Card>
            )}
            {!selectedEvaluation && !selectedTrace.evaluation_id && (
              <Card size="small">
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text type="secondary">{t('agentTrace.noEvaluation')}</Text>
                  <Button
                    type="primary"
                    size="small"
                    icon={<ExperimentOutlined />}
                    onClick={() => handleReEvaluate(selectedTrace.trace_id)}
                  >
                    {t('agentTrace.runEvaluation')}
                  </Button>
                </Space>
              </Card>
            )}

            {/* Metadata */}
            {selectedTrace.metadata && Object.keys(selectedTrace.metadata).length > 0 && (
              <Card size="small" title={t('agentTrace.metadata')}>
                <Descriptions size="small" column={1} bordered>
                  {Object.entries(selectedTrace.metadata).map(([key, value]) => (
                    <Descriptions.Item key={key} label={key}>
                      <Text style={{ fontSize: 12, wordBreak: 'break-all' }}>
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </Card>
            )}
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
