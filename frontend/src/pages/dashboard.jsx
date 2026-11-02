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
  const [unavailableDomains, setUnavailableDomains] = useState([]);
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
      setUnavailableDomains([!graphRes && 'graph', !schemaRes && 'schema'].filter(Boolean));
      const nodes = graphRes?.data?.nodes || [];
      const links = graphRes?.data?.links || [];
      const schema = schemaRes?.data || {};
      const objectTypes = Object.keys(schema.objectTypes || {});
      const linkTypes = Object.keys(schema.linkTypes || {});
      const rules = Object.keys(schema.rules || {});
      setStats({
        nodes: graphRes ? nodes.length : null,
        edges: graphRes ? links.length : null,
        objectTypes: schemaRes ? objectTypes.length : null,
        linkTypes: schemaRes ? linkTypes.length : null,
        rules: schemaRes ? rules.length : null,
        evidenceEdges: graphRes ? links.filter(l => l.linkType === 'TRIGGERS_RISK').length : null,
        highRisk: graphRes ? nodes.filter(n =>
          links.some(l => l.source === n.id && l.linkType === 'TRIGGERS_RISK')
        ).length : null,
      });
      setReviewSummary(reviewRes?.data || null);
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
      <div className="page-heading">
        <div><Title level={3} style={{ margin: 0 }}>{t('dashboard.title')}</Title><Text type="secondary">{t('dashboard.heroPipeline')}</Text></div>
        <Space wrap><Button type="primary" onClick={() => navigate('/pipeline')}>{t('dashboard.buildData')}</Button><Button onClick={() => navigate('/demo-center')}>{t('dashboard.startDemo')}</Button></Space>
      </div>
      {unavailableDomains.length > 0 && <Text type="secondary" role="status">{t('dashboard.partialUnavailable', { domains: unavailableDomains.map(domain => t(`dashboard.domain.${domain}`)).join(', ') })}</Text>}
      <div className="stat-strip">
        {[
          [t('dashboard.totalNodes'), stats?.nodes ?? '—', '/objects'],
          [t('dashboard.totalEdges'), stats?.edges ?? '—', '/graph'],
          [t('dashboard.riskRules'), stats?.rules ?? '—', '/schema?tab=rules'],
          [t('dashboard.pendingReviews'), reviewSummary ? pendingCount : '—', '/review'],
        ].map(([label, value, path]) => <button type="button" className="stat-item" key={path} onClick={() => navigate(path)}><Text type="secondary">{label}</Text><Text strong style={{ fontSize: 22 }}>{value}</Text></button>)}
      </div>
      <Collapse ghost activeKey={moreMetricsOpen ? ['more'] : []} onChange={() => setMoreMetricsOpen(!moreMetricsOpen)} items={[{ key: 'more', label: t('dashboard.moreMetrics'), children: <Space wrap size="large"><Text>{t('dashboard.objectTypes')}: {stats?.objectTypes ?? '—'}</Text><Text>{t('schema.linkTypes')}: {stats?.linkTypes ?? '—'}</Text><Text>{t('dashboard.evidenceEdges')}: {stats?.evidenceEdges ?? '—'}</Text><Text>{t('dashboard.snapshots')}: {snapshotCount}</Text><Text>{t('dashboard.diffs')}: {diffCount}</Text></Space> }]} />
      <section className="page-section">
        <Title level={5}>{t('dashboard.runtimeStatus')}</Title>
        <Space wrap size="large">
          <Text>{t('dashboard.demoState')}: {demoState ? t(`dashboard.demoMode.${demoState.mode}`, demoState.mode) : '—'}</Text>
          <Text>{t('dashboard.triggered')}: {ruleCoverage?.triggered ?? '—'}</Text>
          <Text>{t('dashboard.passed')}: {ruleCoverage?.passed ?? '—'}</Text>
          <Text>{t('dashboard.notEvaluable')}: {ruleCoverage?.not_evaluable ?? '—'}</Text>
          <Text>{t('dashboard.notApplicable')}: {ruleCoverage?.not_applicable ?? '—'}</Text>
        </Space>
      </section>
      <div className="dashboard-grid">
        <section className="page-section"><Title level={5}>{t('dashboard.recentAgentRuns')}</Title><Text type="secondary">{demoState?.mode === 'clean' && (demoState?.graph?.node_count || 0) === 0 ? t('dashboard.noAgentRuns') : t('dashboard.agentRunsAvailable')}</Text><div><Button type="link" onClick={() => navigate('/agent')}>{t('dashboard.journeyAgent')} <RightOutlined /></Button></div></section>
        <section className="page-section"><Title level={5}>{t('dashboard.pendingReviews')}</Title>{reviewSummary ? <Space wrap><Text>{t('review.pending')}: {pendingCount}</Text><Text>{t('review.applied')}: {appliedCount}</Text><Text>{t('review.failed')}: {failedCount}</Text></Space> : <Text type="secondary">{t('dashboard.reviewUnavailable')}</Text>}<div><Button type="link" onClick={() => navigate('/review')}>{t('dashboard.viewAll')} <RightOutlined /></Button></div></section>
      </div>
    </Space>
  );
}
