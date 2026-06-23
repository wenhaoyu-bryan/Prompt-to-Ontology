import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Typography, Space, Tag, Spin, Button, Table, Progress, Result, Alert, Collapse, Skeleton, Grid, theme } from 'antd';
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
  RocketOutlined,
  SafetyOutlined,
  DownOutlined,
  TagOutlined,
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

function WorkflowPipeline({ t, token }) {
  return (
    <Card size="small" style={{ background: 'rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', padding: '4px 0' }}>
        {WORKFLOW_STEPS.map((step, i) => (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 6,
              background: `${token.colorPrimary}0a`, border: `1px solid ${token.colorPrimary}26`,
              minWidth: 80,
            }}>
              <span style={{ fontSize: 16, color: token.colorPrimary }}>{step.icon}</span>
              <Text style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.2 }}>
                {t(`dashboard.pipeline.${step.key}`)}
              </Text>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <span style={{ color: token.colorTextTertiary, margin: '0 2px', fontSize: 14 }}>→</span>
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
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const [stats, setStats] = useState(null);
  const [reviewSummary, setReviewSummary] = useState(null);
  const [demoState, setDemoState] = useState(null);
  const [ruleCoverage, setRuleCoverage] = useState(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [diffCount, setDiffCount] = useState(0);
  const [latestSnapshotTime, setLatestSnapshotTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [moreMetricsOpen, setMoreMetricsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [graphRes, schemaRes, reviewRes, demoRes] = await Promise.all([
        api.get('/graph').catch(err => { console.warn('[Dashboard] Failed to fetch graph:', err.message); return null; }),
        api.get('/ontology/pet_food/schema').catch(err => { console.warn('[Dashboard] Failed to fetch schema:', err.message); return null; }),
        api.get('/review/summary').catch(err => { console.warn('[Dashboard] Failed to fetch review summary:', err.message); return null; }),
        api.get('/demo/state').catch(err => { console.warn('[Dashboard] Failed to fetch demo state:', err.message); return null; }),
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

      api.get('/rule-studio/evaluation-summary').then(r => setRuleCoverage(r.data?.summary)).catch(err => console.warn('[Dashboard] Failed to fetch rule coverage:', err.message));
      api.get('/graph/snapshots').then(r => {
        const snaps = r.data?.snapshots || [];
        setSnapshotCount(snaps.length);
        if (snaps.length > 0) setLatestSnapshotTime(new Date(snaps[0].created_at).toLocaleString());
      }).catch(err => console.warn('[Dashboard] Failed to fetch snapshots:', err.message));
      api.get('/graph/diffs').then(r => setDiffCount((r.data?.diffs || []).length)).catch(err => console.warn('[Dashboard] Failed to fetch diffs:', err.message));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Row gutter={[16, 16]}>
          {[...Array(6)].map((_, i) => (
            <Col xs={12} sm={8} lg={4} key={i}>
              <Card size="small"><Skeleton active paragraph={{ rows: 1 }} /></Card>
            </Col>
          ))}
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card size="small"><Skeleton active paragraph={{ rows: 4 }} /></Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small"><Skeleton active paragraph={{ rows: 4 }} /></Card>
          </Col>
        </Row>
      </Space>
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

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {/* Hero — integrated with Guided Demo CTA */}
      <Card size="small" style={{ background: `linear-gradient(135deg, ${token.colorPrimary}0f 0%, ${token.colorLink}0f 100%)` }}>
        <Tag color="processing" icon={<TagOutlined />} style={{ marginBottom: 8 }}>
          {t('dashboard.heroEyebrow', 'Operational Ontology')}
        </Tag>
        <Title level={3} style={{ margin: 0 }}>{t('dashboard.heroTitle', 'Operational Ontology Runtime')}</Title>
        <Paragraph type="secondary" style={{ margin: '8px 0 16px', fontSize: 14, lineHeight: 1.7 }}>
          {t('dashboard.heroPipeline', 'Ingest raw data, build ontology, evaluate rules, and review — all in one pipeline.')}
        </Paragraph>
        <Space wrap size={12} direction={screens.md ? 'horizontal' : 'vertical'} style={{ width: screens.md ? undefined : '100%' }}>
          <Button type="primary" size="large" icon={<RocketOutlined />} onClick={() => navigate('/demo-center')} style={!screens.md ? { width: '100%' } : undefined}>
            {t('dashboard.startDemo', 'Start Golden Demo')}
          </Button>
          <Button size="large" icon={<PlayCircleOutlined />} onClick={() => navigate('/pipeline')} style={!screens.md ? { width: '100%' } : undefined}>
            {t('dashboard.buildData', 'Build from Data')}
          </Button>
          <Button size="large" type="text" icon={<NodeIndexOutlined />} onClick={() => navigate('/graph')} style={!screens.md ? { width: '100%' } : undefined}>
            {t('dashboard.exploreGraph', 'Explore Graph')}
          </Button>
        </Space>
      </Card>

      {/* Workflow Pipeline */}
      <WorkflowPipeline t={t} token={token} />

      {/* Core Metrics — 4 most important cards */}
      <Row gutter={[16, 16]}>
        {[
          { title: t('dashboard.totalNodes'), value: stats?.nodes || 0, icon: <AppstoreOutlined />, color: token.colorPrimary, path: '/objects' },
          { title: t('dashboard.totalEdges'), value: stats?.edges || 0, icon: <NodeIndexOutlined />, color: token.colorSuccess, path: '/graph' },
          { title: t('dashboard.riskRules'), value: stats?.rules || 0, icon: <WarningOutlined />, color: token.colorWarning, path: '/schema?tab=rules' },
          { title: t('dashboard.pendingReviews'), value: pendingCount, icon: <AuditOutlined />, color: pendingCount > 0 ? token.colorError : token.colorSuccess, path: '/review' },
        ].map((m, i) => (
          <Col xs={12} sm={12} lg={6} key={i}>
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
                <RightOutlined style={{ fontSize: 12, opacity: 0.3, marginTop: 4 }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* More Metrics — collapsible */}
      <Collapse
        ghost
        activeKey={moreMetricsOpen ? ['more'] : []}
        onChange={() => setMoreMetricsOpen(!moreMetricsOpen)}
        items={[{
          key: 'more',
          label: (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t('dashboard.moreMetrics')} ({[
                { v: stats?.objectTypes || 0 },
                { v: stats?.linkTypes || 0 },
                { v: stats?.evidenceEdges || 0 },
                { v: snapshotCount },
                { v: diffCount },
              ].filter(m => m.v > 0).length} {t('dashboard.activeCount', 'active')})
            </Text>
          ),
          children: (
            <Row gutter={[16, 16]}>
              {[
                { title: t('dashboard.objectTypes'), value: stats?.objectTypes || 0, icon: <ApartmentOutlined />, color: token.colorPrimary, path: '/schema?tab=objectTypes' },
                { title: t('schema.linkTypes'), value: stats?.linkTypes || 0, icon: <LinkOutlined />, color: token.colorInfo, path: '/schema?tab=linkTypes' },
                { title: t('dashboard.evidenceEdges'), value: stats?.evidenceEdges || 0, icon: <LinkOutlined />, color: token.colorError, path: '/graph' },
                { title: t('dashboard.snapshots'), value: snapshotCount, icon: <SafetyOutlined />, color: token.colorPrimary, path: '/graph-governance' },
                { title: t('dashboard.diffs'), value: diffCount, icon: <EyeOutlined />, color: token.colorPrimary, path: '/graph-governance' },
              ].map((m, i) => (
                <Col xs={12} sm={8} key={i}>
                  <Card
                    size="small"
                    hoverable
                    onClick={() => navigate(m.path)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Statistic
                      title={m.title}
                      value={m.value}
                      prefix={React.cloneElement(m.icon, { style: { color: m.color } })}
                      valueStyle={{ fontSize: 16 }}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          ),
        }]}
      />

      {/* Runtime Status — compact single row */}
      {demoState && (
        <Card size="small">
          <Row gutter={[16, 8]} align="middle">
            {/* Demo State */}
            <Col xs={24} sm={8}>
              <Space size={8} align="center">
                <PlayCircleOutlined style={{ color: token.colorPrimary }} />
                <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.demoState')}</Text>
                <Tag color={
                  demoState.mode === 'seeded' ? 'green' :
                  demoState.mode === 'clean' ? 'blue' :
                  demoState.mode === 'custom_build' ? 'orange' : 'default'
                } style={{ fontSize: 12, padding: '1px 8px' }}>
                  {t(`dashboard.demoMode.${demoState.mode}`, demoState.mode)}
                </Tag>
              </Space>
            </Col>

            {/* Graph Governance */}
            <Col xs={24} sm={8}>
              <Space size={8} align="center">
                <SafetyOutlined style={{ color: token.colorSuccess }} />
                <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.snapshots')}: {snapshotCount}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>| {t('dashboard.diffs')}: {diffCount}</Text>
              </Space>
            </Col>

            {/* Rule Coverage */}
            {ruleCoverage && (
              <Col xs={24} sm={8}>
                <Space size={8} align="center">
                  <SafetyCertificateOutlined style={{ color: token.colorWarning }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('dashboard.triggered')}: <Text style={{ color: token.colorError, fontSize: 12 }}>{ruleCoverage.triggered || 0}</Text>
                    {' / '}
                    {t('dashboard.passed')}: <Text style={{ color: token.colorSuccess, fontSize: 12 }}>{ruleCoverage.passed || 0}</Text>
                  </Text>
                </Space>
              </Col>
            )}
          </Row>
        </Card>
      )}

      {/* Main content: 2x2 CSS Grid for cross-column row alignment */}
      <div className="dashboard-grid">
        {/* System Health — row 1, col 1 */}
          <Card title={<><ThunderboltOutlined /> {t('dashboard.systemHealth')}</>} size="small">
              <Row gutter={[16, 12]}>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.totalNodes')}</Text>
                  </div>
                  <Progress percent={100} size="small" format={() => stats?.nodes || 0} strokeColor={token.colorPrimary} />
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.highRiskProducts')}</Text>
                  </div>
                  <Progress
                    percent={stats?.nodes ? Math.round((stats.highRisk / stats.nodes) * 100) : 0}
                    size="small"
                    format={() => stats?.highRisk || 0}
                    strokeColor={stats?.highRisk > 0 ? token.colorError : token.colorSuccess}
                  />
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('dashboard.graphEdges')}</Text>
                  </div>
                  <Progress percent={100} size="small" format={() => stats?.edges || 0} strokeColor={token.colorInfo} />
                </Col>
              </Row>
            </Card>

        {/* Recent Agent Runs — row 2, col 1 */}
            <Card
              title={<><RobotOutlined /> {t('dashboard.recentAgentRuns')}</>}
              size="small"
            >
              {demoState?.mode === 'clean' && (demoState?.graph?.node_count || 0) === 0 ? (
                <Text type="secondary" style={{ fontSize: 13 }}>{t('dashboard.noAgentRuns')}</Text>
              ) : (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>{t('dashboard.agentRunsAvailable')}</Text>
                  <Button size="small" type="primary" onClick={() => navigate('/agent')}>{t('dashboard.journeyAgent')} <RightOutlined /></Button>
                </Space>
              )}
            </Card>

        {/* Quick Actions — row 1, col 2 */}
          <Card title={<><ThunderboltOutlined /> {t('dashboard.quickActions')}</>} size="small">
              <Row gutter={[8, 8]}>
                {[
                  { icon: <AppstoreOutlined />, label: t('dashboard.journeyObjects'), path: '/objects', color: token.colorPrimary },
                  { icon: <NodeIndexOutlined />, label: t('dashboard.journeyGraph'), path: '/graph', color: token.colorSuccess },
                  { icon: <ApartmentOutlined />, label: t('dashboard.journeySchema'), path: '/schema', color: token.colorPrimary },
                  { icon: <RobotOutlined />, label: t('dashboard.journeyAgent'), path: '/agent', color: token.colorInfo },
                  { icon: <AuditOutlined />, label: t('dashboard.journeyReview'), path: '/review', color: token.colorWarning },
                  { icon: <ApiOutlined />, label: t('pipeline.journeyPipeline'), path: '/pipeline', color: token.colorPrimary },
                ].map(action => (
                  <Col span={8} key={action.path}>
                    <div
                      onClick={() => navigate(action.path)}
                      style={{
                        textAlign: 'center',
                        padding: '12px 4px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: `1px solid ${token.colorBorderSecondary}`,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = `${action.color}10`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = token.colorBorderSecondary; e.currentTarget.style.background = 'transparent'; }}
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
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Row gutter={8}>
                    <Col span={8}><Statistic title={t('review.pending')} value={pendingCount} valueStyle={{ fontSize: 18, color: token.colorWarning }} /></Col>
                    <Col span={8}><Statistic title={t('review.applied')} value={appliedCount} valueStyle={{ fontSize: 18, color: token.colorPrimary }} /></Col>
                    <Col span={8}><Statistic title={t('review.failed')} value={failedCount} valueStyle={{ fontSize: 18, color: failedCount > 0 ? token.colorError : undefined }} /></Col>
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
      </div>
    </Space>
  );
}
