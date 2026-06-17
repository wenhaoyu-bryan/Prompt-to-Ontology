import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Space, Typography, Steps, Tag, Progress, Row, Col,
  Spin, Result, Descriptions, message, Empty, Alert, Divider, Badge,
} from 'antd';
import {
  PlayCircleOutlined, CheckCircleOutlined, RightOutlined,
  ExperimentOutlined, RocketOutlined, ClockCircleOutlined,
  StopOutlined, LinkOutlined, ReloadOutlined, PauseCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../providers/dataProvider';

const { Title, Text, Paragraph } = Typography;

const STEP_STATUS_MAP = {
  pending: { color: 'default', icon: <ClockCircleOutlined /> },
  running: { color: 'processing', icon: <PlayCircleOutlined /> },
  completed: { color: 'success', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', icon: null },
  skipped: { color: 'warning', icon: <StopOutlined /> },
};

export default function DemoCenterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isZh = i18n.language === 'zh';

  const [scenarios, setScenarios] = useState([]);
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const loadScenarios = async () => {
    try {
      const { data } = await api.get('/scenario-runs/scenarios');
      setScenarios(data.scenarios || []);
    } catch { /* ignore */ }
  };

  const loadRuns = async () => {
    try {
      const { data } = await api.get('/scenario-runs');
      const runList = data.runs || [];
      setRuns(runList);
      // Find an active (not completed) run
      const active = runList.find(r => r.status === 'running' || r.status === 'not_started');
      setActiveRun(active || null);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    Promise.all([loadScenarios(), loadRuns()]).finally(() => setLoading(false));
  }, []);

  const handleStart = async (scenarioId) => {
    try {
      const { data } = await api.post('/scenario-runs', { scenario_id: scenarioId });
      setActiveRun(data);
      message.success(isZh ? '演示已启动' : 'Demo started');
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
      message.success(isZh ? '演示已完成' : 'Demo completed');
      // Don't call loadRuns() — it would overwrite activeRun with null
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Spin size="large" /></div>;
  }

  // Calculate progress
  const completedSteps = activeRun?.steps?.filter(s => s.status === 'completed' || s.status === 'skipped').length || 0;
  const totalSteps = activeRun?.steps?.length || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Build Steps items
  const stepItems = activeRun?.steps?.map((step, idx) => {
    const st = STEP_STATUS_MAP[step.status] || STEP_STATUS_MAP.pending;
    return {
      title: (
        <Space>
          <span>{isZh && step.title_zh ? step.title_zh : step.title}</span>
          <Tag color={st.color} style={{ fontSize: 10 }}>{step.status}</Tag>
        </Space>
      ),
      description: (
        <div style={{ maxWidth: 500 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            {isZh && step.description_zh ? step.description_zh : step.description}
          </Text>
          {step.route && (
            <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => navigate(step.route)}>
              {isZh ? '打开页面' : 'Open Page'} <RightOutlined />
            </Button>
          )}
          {step.status === 'pending' && (
            <Space size={4} style={{ marginTop: 4 }}>
              <Button size="small" type="primary" loading={actionLoading[`${step.step_id}-start`]}
                onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'start')}>
                {isZh ? '开始' : 'Start'}
              </Button>
              <Button size="small" loading={actionLoading[`${step.step_id}-complete`]}
                onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'complete')}>
                {isZh ? '完成' : 'Complete'}
              </Button>
              <Button size="small" loading={actionLoading[`${step.step_id}-skip`]}
                onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'skip')}>
                {isZh ? '跳过' : 'Skip'}
              </Button>
            </Space>
          )}
          {step.status === 'running' && (
            <Space size={4} style={{ marginTop: 4 }}>
              <Button size="small" type="primary" loading={actionLoading[`${step.step_id}-complete`]}
                onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'complete')}>
                {isZh ? '标记完成' : 'Mark Complete'}
              </Button>
              <Button size="small" loading={actionLoading[`${step.step_id}-skip`]}
                onClick={() => handleStepAction(activeRun.run_id, step.step_id, 'skip')}>
                {isZh ? '跳过' : 'Skip'}
              </Button>
            </Space>
          )}
          {step.expected_result && step.status === 'pending' && (
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
              {isZh ? '预期结果' : 'Expected'}: {isZh && step.expected_result_zh ? step.expected_result_zh : step.expected_result}
            </Text>
          )}
        </div>
      ),
      status: step.status === 'completed' ? 'finish' : step.status === 'running' ? 'process' : step.status === 'failed' ? 'error' : step.status === 'skipped' ? 'wait' : 'wait',
      icon: step.status === 'completed' ? <CheckCircleOutlined /> : undefined,
    };
  }) || [];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {/* Hero */}
      <Card size="small" style={{ background: 'linear-gradient(135deg, rgba(82,196,26,0.06) 0%, rgba(22,119,255,0.06) 100%)' }}>
        <Row justify="space-between" align="middle">
          <Col>
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

      {/* No active run — show scenario cards */}
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
                      <Space>
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
            <Row justify="space-between" align="middle">
              <Col>
                <Text strong>{isZh && activeRun.title_zh ? activeRun.title_zh : activeRun.title}</Text>
                <Tag color={activeRun.status === 'completed' ? 'green' : 'blue'} style={{ marginLeft: 8 }}>
                  {activeRun.status}
                </Tag>
              </Col>
              <Col>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {completedSteps} / {totalSteps} {t('demoCenter.steps')}
                </Text>
              </Col>
            </Row>
            <Progress percent={progressPercent} status={activeRun.status === 'completed' ? 'success' : 'active'} style={{ marginTop: 8 }} />
          </Card>

          {/* Steps */}
          <Card title={<><CheckCircleOutlined /> {t('demoCenter.stepTimeline')}</>} size="small">
            <Steps direction="vertical" current={activeRun.steps?.findIndex(s => s.step_id === activeRun.current_step_id)} items={stepItems} />
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
