import { useEffect, useState } from 'react';
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
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../providers/dataProvider';
import { MOCK_AGENT_RUNS } from '../mocks/agentRuns';
import { MOCK_REVIEW_ITEMS } from '../mocks/reviewItems';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [graphRes, schemaRes] = await Promise.all([
        api.get('/graph').catch(() => null),
        api.get('/ontology/pet_food/schema').catch(() => null),
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
        evidenceEdges: links.filter(l => l.linkType !== 'TRIGGERS_RISK').length,
        riskEdges: links.filter(l => l.linkType === 'TRIGGERS_RISK').length,
        highRisk: nodes.filter(n =>
          links.some(l => l.source === n.id && l.linkType === 'TRIGGERS_RISK')
        ).length,
      });
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

  const pendingReviews = MOCK_REVIEW_ITEMS.filter(r => r.status === 'pending');
  const recentRuns = MOCK_AGENT_RUNS.slice(0, 4);

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      {/* Hero / Narrative */}
      <Card size="small" style={{ background: 'linear-gradient(135deg, rgba(22,119,255,0.06) 0%, rgba(114,46,209,0.06) 100%)' }}>
        <Row gutter={24} align="middle">
          <Col xs={24} lg={16}>
            <Title level={3} style={{ margin: 0 }}>{t('dashboard.title')}</Title>
            <Paragraph type="secondary" style={{ margin: '8px 0 12px', fontSize: 14, lineHeight: 1.7 }}>
              {t('dashboard.hero')}
            </Paragraph>
            <Space size={8} wrap>
              <Tag color="blue">{t('dashboard.tagRealtime')}</Tag>
              <Tag color="purple">{t('dashboard.tagGraph')}</Tag>
              <Tag color="cyan">{t('dashboard.tagAgent')}</Tag>
              <Tag color="orange">{t('dashboard.tagHITL')}</Tag>
            </Space>
          </Col>
          <Col xs={24} lg={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{t('dashboard.dataSource')}</Text>
              <Space size={4}>
                <Tag color="success" style={{ fontSize: 10 }}>{t('dashboard.realApi')}</Tag>
                <Tag style={{ fontSize: 10 }}>{t('common.prototype')}</Tag>
              </Space>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Workflow Pipeline */}
      <WorkflowPipeline t={t} />

      {/* Primary Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic
              title={t('dashboard.totalNodes')}
              value={stats?.nodes || 0}
              prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic
              title={t('dashboard.totalEdges')}
              value={stats?.edges || 0}
              prefix={<NodeIndexOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic
              title={t('dashboard.objectTypes')}
              value={stats?.objectTypes || 0}
              prefix={<ApartmentOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic
              title={t('schema.linkTypes')}
              value={stats?.linkTypes || 0}
              prefix={<NodeIndexOutlined style={{ color: '#13c2c2' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic
              title={t('schema.rules')}
              value={stats?.rules || 0}
              prefix={<SafetyCertificateOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic
              title={t('dashboard.riskRules')}
              value={stats?.rules || 0}
              prefix={<WarningOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic
              title={t('dashboard.evidenceEdges')}
              value={stats?.evidenceEdges || 0}
              prefix={<LinkOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Main content: 2 columns */}
      <Row gutter={[16, 16]}>
        {/* Left: System Health + Recent Agent Runs */}
        <Col xs={24} lg={14}>
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {/* System Health */}
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

            {/* Recent Agent Runs */}
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
          </Space>
        </Col>

        {/* Right: Quick Actions + Recent Reviews */}
        <Col xs={24} lg={10}>
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {/* Quick Actions */}
            <Card title={<><ThunderboltOutlined /> {t('dashboard.quickActions')}</>} size="small">
              <Row gutter={[8, 8]}>
                {[
                  { icon: <AppstoreOutlined />, label: t('dashboard.journeyObjects'), path: '/objects', color: '#1677ff' },
                  { icon: <NodeIndexOutlined />, label: t('dashboard.journeyGraph'), path: '/graph', color: '#52c41a' },
                  { icon: <ApartmentOutlined />, label: t('dashboard.journeySchema'), path: '/schema', color: '#722ed1' },
                  { icon: <RobotOutlined />, label: t('dashboard.journeyAgent'), path: '/agent', color: '#13c2c2' },
                  { icon: <AuditOutlined />, label: t('dashboard.journeyReview'), path: '/review', color: '#fa8c16' },
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

            {/* Pending Reviews */}
            <Card
              title={<><AuditOutlined /> {t('dashboard.pendingReviews')} ({pendingReviews.length}) <Tag style={{ fontSize: 10, marginLeft: 4 }}>{t('common.prototype')}</Tag></>}
              size="small"
              extra={<Button type="link" size="small" onClick={() => navigate('/review')}>{t('dashboard.viewAll')} <RightOutlined /></Button>}
            >
              {pendingReviews.length > 0 ? (
                <Timeline
                  items={pendingReviews.slice(0, 3).map(item => ({
                    color: item.severity === 'high' ? 'red' : item.severity === 'medium' ? 'orange' : 'blue',
                    content: (
                      <div>
                        <Text style={{ fontSize: 13 }}>{item.title}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 11 }}>{item.source}</Text>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Text type="secondary">{t('review.noViolations')}</Text>
              )}
            </Card>
          </Space>
        </Col>
      </Row>
    </Space>
  );
}
