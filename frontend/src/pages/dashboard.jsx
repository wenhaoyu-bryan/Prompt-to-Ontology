import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Typography, Space, Tag, Spin, Button, Timeline, Table, Progress, Result, Steps, Alert } from 'antd';
import {
  AppstoreOutlined,
  NodeIndexOutlined,
  AlertOutlined,
  ApartmentOutlined,
  ReloadOutlined,
  RobotOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  RightOutlined,
  FileTextOutlined,
  BranchesOutlined,
  BulbOutlined,
  ExperimentOutlined,
  EyeOutlined,
  ApiOutlined,
  WarningOutlined,
  LinkOutlined,
  StopOutlined,
  SettingOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../providers/dataProvider';
import { MOCK_AGENT_RUNS } from '../mocks/agentRuns';

const { Title, Text, Paragraph } = Typography;

const STATUS_COLORS = {
  completed: 'green',
  running: 'blue',
  failed: 'red',
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
};

const WORKFLOW_STEPS = [
  { key: 'readyData', icon: <FileTextOutlined /> },
  { key: 'extract', icon: <AppstoreOutlined /> },
  { key: 'relate', icon: <BranchesOutlined /> },
  { key: 'constraint', icon: <StopOutlined /> },
  { key: 'ruleEval', icon: <SafetyCertificateOutlined /> },
  { key: 'evidence', icon: <ExperimentOutlined /> },
  { key: 'agent', icon: <RobotOutlined /> },
  { key: 'review', icon: <EyeOutlined /> },
];

function WorkflowPipeline({ t }) {
  return (
    <Card size="small" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', padding: '4px 0' }}>
        {WORKFLOW_STEPS.map((step, i) => (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 6,
              background: 'rgba(22,119,255,0.06)', border: '1px solid rgba(22,119,255,0.15)',
              minWidth: 80,
            }}>
              <span style={{ fontSize: 16, color: '#1677ff' }}>{step.icon}</span>
              <Text style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.2 }}>
                {t(`dashboard.pipeline.${step.key}`)}
              </Text>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 2px', fontSize: 14 }}>→</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [reviewSummary, setReviewSummary] = useState(null);
  const [demoState, setDemoState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [graphRes, schemaRes, reviewRes, demoRes] = await Promise.all([
        api.get('/graph').catch(() => null),
        api.get('/ontology/pet_food/schema').catch(() => null),
        api.get('/review/summary').catch(() => null),
        api.get('/demo/state').catch(() => null),
      ]);
      if (!graphRes && !schemaRes) {
        setError(true);
        return;
      }
      const nodes = graphRes?.data?.nodes || [];
      const links = graphRes?.data?.links || [];
      const schema = schemaRes?.data || {};
      const objectTypes = Object.keys(schema.objectTypes || {});
      const linkTypes = Object.keys(schema.linkTypes || {});
      const rules = Object.keys(schema.rules || {});
      setStats({
        nodes: nodes.length,
        edges: links.length,
        objectTypes: objectTypes.length,
        linkTypes: linkTypes.length,
        rules: rules.length,
        evidenceEdges: links.filter(l => l.linkType === 'TRIGGERS_RISK').length,
        highRisk: nodes.filter(n =>
          links.some(l => l.source === n.id && l.linkType === 'TRIGGERS_RISK')
        ).length,
      });
      if (reviewRes?.data) setReviewSummary(reviewRes.data);
      if (demoRes?.data) setDemoState(demoRes.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
        extra={<Button type="primary" icon={<ReloadOutlined />} onClick={load}>{t('common.retry')}</Button>}
      />
    );
  }

  const pendingCount = reviewSummary?.pending || 0;
  const appliedCount = reviewSummary?.applied || 0;
  const failedCount = reviewSummary?.failed || 0;
  const recentRuns = MOCK_AGENT_RUNS.slice(0, 4);

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      {/* Hero */}
      <Card size="small" style={{ background: 'linear-gradient(135deg, rgba(22,119,255,0.06) 0%, rgba(114,46,209,0.06) 100%)' }}>
        <Title level={3} style={{ margin: 0 }}>{t('dashboard.title')}</Title>
        <Paragraph type="secondary" style={{ margin: '8px 0 16px', fontSize: 14, lineHeight: 1.7 }}>
          {t('dashboard.hero')}
        </Paragraph>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Card size="small" variant="inner" style={{ height: '100%' }}>
              <Title level={5} style={{ margin: 0 }}>{t('dashboard.buildPath')}</Title>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '6px 0' }}>{t('dashboard.buildPathDesc')}</Text>
              <Text code style={{ fontSize: 10, display: 'block', marginBottom: 10 }}>{t('dashboard.buildPathWorkflow')}</Text>
              <Space size={8}>
                <Button size="small" type="primary" onClick={() => navigate('/pipeline')}>{t('dashboard.startPipeline')}</Button>
                <Button size="small" onClick={() => navigate('/schema')}>{t('dashboard.openSchema')}</Button>
              </Space>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card size="small" variant="inner" style={{ height: '100%' }}>
              <Title level={5} style={{ margin: 0 }}>{t('dashboard.explorePath')}</Title>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '6px 0' }}>{t('dashboard.explorePathDesc')}</Text>
              <Text code style={{ fontSize: 10, display: 'block', marginBottom: 10 }}>{t('dashboard.explorePathWorkflow')}</Text>
              <Space size={8}>
                <Button size="small" onClick={() => navigate('/objects')}>{t('dashboard.exploreObjects')}</Button>
                <Button size="small" onClick={() => navigate('/graph')}>{t('dashboard.openGraph')}</Button>
                <Button size="small" onClick={() => navigate('/agent')}>{t('dashboard.askAgent')}</Button>
              </Space>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* Workflow Pipeline */}
      <WorkflowPipeline t={t} />

      {/* Primary Stats */}
      <Row gutter={[16, 16]}>
        {[
          { title: t('dashboard.totalNodes'), value: stats?.nodes || 0, icon: <AppstoreOutlined />, color: '#1677ff', path: '/objects' },
          { title: t('dashboard.totalEdges'), value: stats?.edges || 0, icon: <NodeIndexOutlined />, color: '#52c41a', path: '/graph' },
          { title: t('dashboard.objectTypes'), value: stats?.objectTypes || 0, icon: <ApartmentOutlined />, color: '#722ed1', path: '/schema?tab=objectTypes' },
          { title: t('schema.linkTypes'), value: stats?.linkTypes || 0, icon: <LinkOutlined />, color: '#13c2c2', path: '/schema?tab=linkTypes' },
          { title: t('dashboard.riskRules'), value: stats?.rules || 0, icon: <WarningOutlined />, color: '#fa8c16', path: '/schema?tab=rules' },
          { title: t('dashboard.evidenceEdges'), value: stats?.evidenceEdges || 0, icon: <LinkOutlined />, color: '#ff4d4f', path: '/graph' },
        ].map((m, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <Card
              size="small"
              hoverable
              onClick={() => navigate(m.path)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Statistic
                  title={m.title}
                  value={m.value}
                  prefix={React.cloneElement(m.icon, { style: { color: m.color } })}
                />
                <RightOutlined style={{ fontSize: 10, opacity: 0.3, marginTop: 4 }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Main content: 2x2 CSS Grid for cross-column row alignment */}
      <div className="dashboard-grid">
        {/* System Health — row 1, col 1 */}
          <Card title={<><ThunderboltOutlined /> {t('dashboard.systemHealth')}</>} size="small">
              <Row gutter={[16, 12]}>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.totalNodes')}</Text>
                  </div>
                  <Progress percent={100} size="small" format={() => stats?.nodes || 0} strokeColor="#1677ff" />
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.highRiskProducts')}</Text>
                  </div>
                  <Progress
                    percent={stats?.nodes ? Math.round((stats.highRisk / stats.nodes) * 100) : 0}
                    size="small"
                    format={() => stats?.highRisk || 0}
                    strokeColor={stats?.highRisk > 0 ? '#ff4d4f' : '#52c41a'}
                  />
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.graphEdges')}</Text>
                  </div>
                  <Progress percent={100} size="small" format={() => stats?.edges || 0} strokeColor="#13c2c2" />
                </Col>
              </Row>
            </Card>

        {/* Recent Agent Runs — row 2, col 1 */}
            <Card
              title={<><RobotOutlined /> {t('dashboard.recentAgentRuns')} <Tag style={{ fontSize: 10, marginLeft: 4 }}>{t('common.demoData')}</Tag></>}
              size="small"
              extra={<Button type="link" size="small" onClick={() => navigate('/agent')}>{t('dashboard.viewAll')} <RightOutlined /></Button>}
            >
              <Table
                dataSource={recentRuns}
                rowKey="run_id"
                size="small"
                pagination={false}
                columns={[
                  {
                    title: t('dashboard.prompt'),
                    dataIndex: 'prompt',
                    key: 'prompt',
                    ellipsis: true,
                    render: (text) => <Text style={{ fontSize: 13 }}>{text}</Text>,
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
                    title: t('dashboard.issues'),
                    dataIndex: 'issues_found',
                    key: 'issues',
                    width: 70,
                    render: (v) => v > 0 ? <Tag color="red">{v}</Tag> : <Text type="secondary">0</Text>,
                  },
                ]}
              />
            </Card>

        {/* Quick Actions — row 1, col 2 */}
          <Card title={<><ThunderboltOutlined /> {t('dashboard.quickActions')}</>} size="small">
              <Row gutter={[8, 8]}>
                {[
                  { icon: <AppstoreOutlined />, label: t('dashboard.journeyObjects'), path: '/objects', color: '#1677ff' },
                  { icon: <NodeIndexOutlined />, label: t('dashboard.journeyGraph'), path: '/graph', color: '#52c41a' },
                  { icon: <ApartmentOutlined />, label: t('dashboard.journeySchema'), path: '/schema', color: '#722ed1' },
                  { icon: <RobotOutlined />, label: t('dashboard.journeyAgent'), path: '/agent', color: '#13c2c2' },
                  { icon: <AuditOutlined />, label: t('dashboard.journeyReview'), path: '/review', color: '#fa8c16' },
                  { icon: <ApiOutlined />, label: t('pipeline.journeyPipeline'), path: '/pipeline', color: '#eb2f96' },
                ].map(action => (
                  <Col span={8} key={action.path}>
                    <div
                      onClick={() => navigate(action.path)}
                      style={{
                        textAlign: 'center',
                        padding: '12px 4px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.08)',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = `${action.color}10`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ fontSize: 22, color: action.color, marginBottom: 4 }}>{action.icon}</div>
                      <Text style={{ fontSize: 12 }}>{action.label}</Text>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>

        {/* Review Queue Summary — row 2, col 2 */}
          <Card
            title={<><AuditOutlined /> {t('dashboard.pendingReviews')} ({pendingCount})</>}
            size="small"
            extra={<Button type="link" size="small" onClick={() => navigate('/review')}>{t('dashboard.viewAll')} <RightOutlined /></Button>}
          >
              {reviewSummary ? (
                <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                  <Row gutter={8}>
                    <Col span={8}><Statistic title={t('review.pending')} value={pendingCount} valueStyle={{ fontSize: 18, color: '#fa8c16' }} /></Col>
                    <Col span={8}><Statistic title={t('review.applied') || 'Applied'} value={appliedCount} valueStyle={{ fontSize: 18, color: '#1677ff' }} /></Col>
                    <Col span={8}><Statistic title={t('review.failed') || 'Failed'} value={failedCount} valueStyle={{ fontSize: 18, color: failedCount > 0 ? '#ff4d4f' : undefined }} /></Col>
                  </Row>
                  {pendingCount > 0 && (
                    <Button type="primary" size="small" block onClick={() => navigate('/review')}>
                      {t('dashboard.viewAll')} ({pendingCount} {t('review.pending').toLowerCase()})
                    </Button>
                  )}
                  {pendingCount === 0 && appliedCount === 0 && (
                    <Text type="secondary">{t('review.noViolations')}</Text>
                  )}
                </Space>
              ) : (
                <Text type="secondary">{t('review.noViolations')}</Text>
              )}
          </Card>

        {/* Demo State — row 3, col 1 */}
        {demoState && (
          <Card
            title={<><PlayCircleOutlined /> {t('dashboard.demoState')}</>}
            size="small"
            extra={<Button type="link" size="small" onClick={() => navigate('/settings')}>{t('dashboard.demoSettings')} <RightOutlined /></Button>}
          >
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Tag color={
                  demoState.mode === 'seeded' ? 'green' :
                  demoState.mode === 'clean' ? 'blue' :
                  demoState.mode === 'custom_build' ? 'orange' : 'default'
                } style={{ fontSize: 13, padding: '2px 10px' }}>
                  {t(`dashboard.demoMode.${demoState.mode}`, demoState.mode)}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t({
                    seeded: 'dashboard.demoModeSeededLine',
                    clean: 'dashboard.demoModeCleanLine',
                    custom_build: 'dashboard.demoModeCustomLine',
                  }[demoState.mode] || '', '')}
                </Text>
              </div>
              <Row gutter={8}>
                <Col span={6}><Statistic title={t('dashboard.totalNodes')} value={demoState.graph?.node_count || 0} valueStyle={{ fontSize: 16 }} /></Col>
                <Col span={6}><Statistic title={t('dashboard.graphEdges')} value={demoState.graph?.relationship_count || 0} valueStyle={{ fontSize: 16 }} /></Col>
                <Col span={6}><Statistic title={t('review.pending')} value={demoState.review_queue?.pending_count || 0} valueStyle={{ fontSize: 16, color: (demoState.review_queue?.pending_count || 0) > 0 ? '#fa8c16' : undefined }} /></Col>
                <Col span={6}><Statistic title={t('pipeline.newObjects')} value={demoState.pipeline?.import_plan_count || 0} valueStyle={{ fontSize: 16 }} /></Col>
              </Row>
            </Space>
          </Card>
        )}

        {/* Demo Paths — row 3, col 2 */}
        {demoState && (
          <Card title={<><ExperimentOutlined /> {t('dashboard.demoPaths')}</>} size="small">
            <Row gutter={12}>
              <Col span={12}>
                <div style={{
                  padding: 12, borderRadius: 8, height: '100%',
                  background: demoState.mode === 'seeded' ? 'rgba(82,196,26,0.06)' : 'transparent',
                  border: demoState.mode === 'seeded' ? '1px solid rgba(82,196,26,0.2)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t('dashboard.demoPathSeeded')}</div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>{t('dashboard.demoPathSeededDesc')}</Text>
                  {demoState.mode === 'seeded' && (
                    <Space size={8}>
                      <Button size="small" type="primary" onClick={() => navigate('/objects')}>{t('dashboard.exploreObjects')}</Button>
                      <Button size="small" onClick={() => navigate('/agent')}>{t('dashboard.askAgent')}</Button>
                    </Space>
                  )}
                  {demoState.mode !== 'seeded' && (
                    <Button size="small" type="primary" ghost onClick={() => navigate('/settings')}>{t('settings.demoResetSeeded')}</Button>
                  )}
                </div>
              </Col>
              <Col span={12}>
                <div style={{
                  padding: 12, borderRadius: 8, height: '100%',
                  background: demoState.mode === 'clean' ? 'rgba(22,119,255,0.06)' : 'transparent',
                  border: demoState.mode === 'clean' ? '1px solid rgba(22,119,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t('dashboard.demoPathClean')}</div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>{t('dashboard.demoPathCleanDesc')}</Text>
                  {demoState.mode === 'clean' && (
                    <Button size="small" type="primary" icon={<ApiOutlined />} onClick={() => navigate('/pipeline')}>{t('dashboard.startPipeline')}</Button>
                  )}
                  {demoState.mode !== 'clean' && (
                    <Button size="small" onClick={() => navigate('/settings')}>{t('settings.demoResetClean')}</Button>
                  )}
                </div>
              </Col>
            </Row>
          </Card>
        )}
      </div>
    </Space>
  );
}
