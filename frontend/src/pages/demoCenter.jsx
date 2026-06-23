import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Space, Typography, Steps, Tag, Progress, Row, Col,
  Spin, Result, Descriptions, message, Empty, Alert, Divider, Badge, theme,
} from 'antd';
import {
  PlayCircleOutlined, CheckCircleOutlined, RightOutlined,
  ExperimentOutlined, RocketOutlined, ClockCircleOutlined,
  StopOutlined, LinkOutlined, ReloadOutlined, PauseCircleOutlined,
  ExclamationCircleOutlined, CloseCircleOutlined, StepForwardOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../providers/dataProvider';

const { Title, Text, Paragraph } = Typography;

const STATUS_MAP = {
  not_started: { en: 'Not Started', zh: '未开始', color: 'default' },
  pending: { en: 'Pending', zh: '待开始', color: 'default' },
  running: { en: 'In Progress', zh: '进行中', color: 'processing' },
  completed: { en: 'Completed', zh: '已完成', color: 'success' },
  failed: { en: 'Failed', zh: '失败', color: 'error' },
  skipped: { en: 'Skipped', zh: '已跳过', color: 'warning' },
};

const STATUS_I18N_KEY = {
  not_started: 'status.notStarted',
  pending: 'status.pending',
  running: 'status.running',
  completed: 'status.completed',
  failed: 'status.failed',
  skipped: 'status.skipped',
};

const STEP_STATUS_MAP = {
  pending: { color: 'default', icon: <ClockCircleOutlined /> },
  running: { color: 'processing', icon: <PlayCircleOutlined /> },
  completed: { color: 'success', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', icon: <CloseCircleOutlined /> },
  skipped: { color: 'warning', icon: <ExclamationCircleOutlined /> },
};

function getStatusDisplay(t, status) {
  const mapped = STATUS_MAP[status] || STATUS_MAP.pending;
  const i18nKey = STATUS_I18N_KEY[status] || 'status.pending';
  return {
    label: t(i18nKey, mapped.en),
    color: mapped.color,
  };
}

export default function DemoCenterPage() {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const isZh = i18n.language === 'zh';

  const [scenarios, setScenarios] = useState([]);
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState(null);

  const loadScenarios = async () => {
    try {
      const { data } = await api.get('/scenario-runs/scenarios');
      setScenarios(data.scenarios || []);
    } catch (err) {
      console.warn('[DemoCenter] Failed to load scenarios:', err.message);
    }
  };

  const loadRuns = async () => {
    try {
      const { data } = await api.get('/scenario-runs');
      const runList = data.runs || [];
      setRuns(runList);
      // Find an active (not completed) run
      const active = runList.find(r => r.status === 'running' || r.status === 'not_started');
      setActiveRun(active || null);
    } catch (err) {
      console.warn('[DemoCenter] Failed to load runs:', err.message);
    }
  };

  useEffect(() => {
    Promise.all([loadScenarios(), loadRuns()])
      .catch(err => {
        console.warn('[DemoCenter] Failed to initialize:', err.message);
        setError(t('common.error'));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleStart = async (scenarioId) => {
    try {
      const { data } = await api.post('/scenario-runs', { scenario_id: scenarioId });
      setActiveRun(data);
      message.success(t('demoCenter.demoStarted'));
      loadRuns();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    }
  };

  const handleStepAction = async (runId, stepId, action) => {
    setActionLoading(prev => ({ ...prev, [`${stepId}-${action}`]: true }));
    try {
      let res;
      if (action === 'start') res = await api.post(`/scenario-runs/${runId}/steps/${stepId}/start`);
      else if (action === 'complete') res = await api.post(`/scenario-runs/${runId}/steps/${stepId}/complete`);
      else if (action === 'skip') res = await api.post(`/scenario-runs/${runId}/steps/${stepId}/skip`);
      setActiveRun(res.data);
      loadRuns();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    } finally {
      setActionLoading(prev => ({ ...prev, [`${stepId}-${action}`]: false }));
    }
  };

  const handleCompleteRun = async () => {
    if (!activeRun) return;
    try {
      const { data } = await api.post(`/scenario-runs/${activeRun.run_id}/complete`);
      setActiveRun(data);
      message.success(t('demoCenter.demoCompleted'));
      // Don't call loadRuns() — it would overwrite activeRun with null
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    }
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    Promise.all([loadScenarios(), loadRuns()])
      .catch(err => {
        console.warn('[DemoCenter] Retry failed:', err.message);
        setError(t('common.error'));
      })
      .finally(() => setLoading(false));
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Spin size="large" /></div>;
  }

  // Calculate progress
  const completedSteps = activeRun?.steps?.filter(s => s.status === 'completed' || s.status === 'skipped').length || 0;
  const totalSteps = activeRun?.steps?.length || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Build Steps items with visual hierarchy
  const stepItems = activeRun?.steps?.map((step, idx) => {
    const st = STEP_STATUS_MAP[step.status] || STEP_STATUS_MAP.pending;
    const statusDisplay = getStatusDisplay(t, step.status);
    const isRunning = step.status === 'running';
    const isCompleted = step.status === 'completed';
    const isPending = step.status === 'pending';
    const isSkipped = step.status === 'skipped';
    const isFailed = step.status === 'failed';

    return {
      title: (
        <Space wrap style={{ maxWidth: '100%' }}>
          <span style={{
            fontWeight: isRunning ? 600 : 500,
            color: isRunning
              ? token.colorPrimary
              : isPending
                ? token.colorTextSecondary
                : undefined,
          }}>
            {isZh && step.title_zh ? step.title_zh : step.title}
          </span>
          <Tag color={statusDisplay.color} style={{ fontSize: 12 }}>
            {statusDisplay.label}
          </Tag>
        </Space>
      ),
      description: (
        <div style={{ maxWidth: 500 }}>
          {/* Description shown for running/current step always; for others only if present */}
          {(isRunning || step.description) && (
            <Text type="secondary" style={{
              fontSize: 12,
              display: 'block',
              color: isPending ? token.colorTextQuaternary : undefined,
            }}>
              {isZh && step.description_zh ? step.description_zh : step.description}
            </Text>
          )}

          {/* Expected result for pending steps */}
          {step.expected_result && isPending && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              {t('demoCenter.expected')}: {isZh && step.expected_result_zh ? step.expected_result_zh : step.expected_result}
            </Text>
          )}

          {/* Result summary for completed steps */}
          {isCompleted && step.result_summary && (
            <Text style={{ fontSize: 12, display: 'block', marginTop: 4, color: token.colorSuccess }}>
              {t('demoCenter.viewResult')}: {isZh && step.result_summary_zh ? step.result_summary_zh : step.result_summary}
            </Text>
          )}

          {/* Route / View Page link */}
          {step.route && (
            <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => navigate(step.route)}>
              {t('demoCenter.openPage')} <RightOutlined />
            </Button>
          )}

          {/* Buttons by status */}
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {isPending && (
              <>
                <Button size="small" type="primary" loading={actionLoading[`${step.step_id}-start`]}
                  onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'start')}>
                  {t('demoCenter.start')}
                </Button>
                <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}
                  loading={actionLoading[`${step.step_id}-skip`]}
                  onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'skip')}>
                  {t('demoCenter.skip')}
                </Button>
              </>
            )}
            {isRunning && (
              <>
                <Button size="small" type="primary" loading={actionLoading[`${step.step_id}-complete`]}
                  onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'complete')}>
                  {t('demoCenter.markComplete')}
                </Button>
                <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}
                  loading={actionLoading[`${step.step_id}-skip`]}
                  onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'skip')}>
                  {t('demoCenter.skip')}
                </Button>
              </>
            )}
            {isCompleted && step.route && (
              <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}
                onClick={() => navigate(step.route)}>
                {t('demoCenter.openPage')} <RightOutlined />
              </Button>
            )}
          </div>
        </div>
      ),
      status: isCompleted ? 'finish' : isRunning ? 'process' : isFailed ? 'error' : isSkipped ? 'wait' : 'wait',
      icon: isCompleted ? <CheckCircleOutlined style={{ color: token.colorSuccess }} /> : undefined,
    };
  }) || [];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      {/* Page-level error */}
      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={handleRetry}>
              {t('common.retry', 'Retry')}
            </Button>
          }
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* Hero */}
      <Card size="small" style={{
        background: `linear-gradient(135deg, ${token.colorSuccessBg} 0%, ${token.colorPrimaryBg} 100%)`,
      }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col flex="auto">
            <Title level={3} style={{ margin: 0 }}>
              <RocketOutlined /> {t('demoCenter.title')}
            </Title>
            <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
              {t('demoCenter.subtitle')}
            </Paragraph>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => { loadScenarios(); loadRuns(); }}>
              {t('common.refresh')}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* No active run -- show scenario cards */}
      {!activeRun && (
        <Card title={<><ExperimentOutlined /> {t('demoCenter.availableScenarios')}</>} size="small">
          {scenarios.length === 0 ? (
            <Empty description={t('demoCenter.noScenarios')} />
          ) : (
            <Row gutter={[16, 16]}>
              {scenarios.map(s => (
                <Col xs={24} md={12} key={s.scenario_id}>
                  <Card size="small" hoverable>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Text strong>{isZh && s.title_zh ? s.title_zh : s.title}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {isZh && s.description_zh ? s.description_zh : s.description}
                      </Text>
                      <Space wrap>
                        <Tag icon={<ClockCircleOutlined />}>{s.estimated_minutes} min</Tag>
                        <Tag>{s.step_count} {t('demoCenter.steps')}</Tag>
                      </Space>
                      <Button type="primary" icon={<PlayCircleOutlined />} block
                        onClick={() => handleStart(s.scenario_id)}>
                        {t('demoCenter.startDemo')}
                      </Button>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Card>
      )}

      {/* Active run */}
      {activeRun && (
        <>
          {/* Progress */}
          <Card size="small">
            <Row justify="space-between" align="middle" gutter={[16, 8]}>
              <Col xs={24} sm="auto">
                <Text strong>{isZh && activeRun.title_zh ? activeRun.title_zh : activeRun.title}</Text>
                <Tag color={getStatusDisplay(t, activeRun.status).color} style={{ marginLeft: 8 }}>
                  {getStatusDisplay(t, activeRun.status).label}
                </Tag>
              </Col>
              <Col xs={24} sm="auto">
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {completedSteps} / {totalSteps} {t('demoCenter.steps')}
                </Text>
              </Col>
            </Row>
            <Progress percent={progressPercent} status={activeRun.status === 'completed' ? 'success' : 'active'} style={{ marginTop: 8 }} />
          </Card>

          {/* Steps */}
          <Card title={<><CheckCircleOutlined /> {t('demoCenter.stepTimeline')}</>} size="small"
            styles={{ body: { overflowX: 'auto', maxWidth: '100%' } }}>
            <div style={{ minWidth: 0, overflowX: 'auto' }}>
              <Steps direction="vertical" current={activeRun.steps?.findIndex(s => s.step_id === activeRun.current_step_id)} items={stepItems} />
            </div>
          </Card>

          {/* Artifacts */}
          {activeRun.artifacts && Object.values(activeRun.artifacts).some(v => v) && (
            <Card title={<><LinkOutlined /> {t('demoCenter.artifacts')}</>} size="small">
              <Space wrap>
                {activeRun.artifacts.agent_trace_id && (
                  <Button size="small" onClick={() => navigate(`/agent-traces`)}>
                    {t('demoCenter.agentTrace')} <RightOutlined />
                  </Button>
                )}
                {activeRun.artifacts.review_batch_id && (
                  <Button size="small" onClick={() => navigate(`/review`)}>
                    {t('demoCenter.reviewQueue')} <RightOutlined />
                  </Button>
                )}
                {activeRun.artifacts.snapshot_id && (
                  <Button size="small" onClick={() => navigate(`/graph-governance`)}>
                    {t('demoCenter.graphGovernance')} <RightOutlined />
                  </Button>
                )}
              </Space>
            </Card>
          )}

          {/* Complete run button */}
          {activeRun.status !== 'completed' && completedSteps >= totalSteps - 1 && (
            <Button type="primary" size="large" icon={<CheckCircleOutlined />} block
              onClick={handleCompleteRun}>
              {t('demoCenter.completeDemo')}
            </Button>
          )}
        </>
      )}
    </Space>
  );
}
