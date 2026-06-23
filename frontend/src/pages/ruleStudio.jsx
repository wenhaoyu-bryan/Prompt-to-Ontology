import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Drawer,
  Collapse,
  Row,
  Col,
  Statistic,
  Select,
  InputNumber,
  Space,
  Typography,
  Alert,
  Spin,
  Divider,
  Descriptions,
  Result,
  Tooltip,
} from 'antd';
import {
  ReloadOutlined,
  SafetyCertificateOutlined,
  ExperimentOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../providers/dataProvider';

const { Title, Text, Paragraph } = Typography;

const SEVERITY_COLORS = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'blue',
  info: 'default',
};

const STATUS_COLORS = {
  triggered: 'red',
  passed: 'green',
  not_evaluable: 'orange',
  not_applicable: 'default',
};

const STATUS_ICONS = {
  triggered: <CloseCircleOutlined />,
  passed: <CheckCircleOutlined />,
  not_evaluable: <QuestionCircleOutlined />,
  not_applicable: <MinusCircleOutlined />,
};

export default function RuleStudioPage() {
  const { t } = useTranslation();
  const [rules, setRules] = useState([]);
  const [summary, setSummary] = useState(null);
  const [byRule, setByRule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Detail drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [ruleDetail, setRuleDetail] = useState(null);

  // Simulation state
  const [simRuleId, setSimRuleId] = useState(null);
  const [simFields, setSimFields] = useState({
    species: undefined,
    life_stage: undefined,
    protein_100g: undefined,
    fat_100g: undefined,
    phosphorus_100g: undefined,
    taurine_mg_kg: undefined,
  });
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(false);
    try {
      const [rulesRes, summaryRes] = await Promise.all([
        api.get('/rule-studio/rules').catch(() => null),
        api.get('/rule-studio/evaluation-summary').catch(() => null),
      ]);
      if (!rulesRes) {
        setError(true);
        return;
      }
      setRules(rulesRes.data?.rules || []);
      if (summaryRes?.data?.summary) {
        setSummary(summaryRes.data.summary);
      }
      if (summaryRes?.data?.by_rule) {
        setByRule(summaryRes.data.by_rule);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Build coverage lookup by rule_id
  const coverageByRuleId = {};
  byRule.forEach((r) => {
    coverageByRuleId[r.rule_id] = r;
  });

  // ── Section A: Rule Overview columns ──
  const ruleColumns = [
    {
      title: t('ruleStudio.columns.ruleName'),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      ellipsis: true,
      render: (text) => <Text strong ellipsis style={{ maxWidth: 160 }}>{text}</Text>,
    },
    {
      title: t('ruleStudio.columns.severity'),
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (sev) => (
        <Tag color={SEVERITY_COLORS[sev] || 'default'}>
          {t(`ruleStudio.severity.${sev}`, sev)}
        </Tag>
      ),
    },
    {
      title: t('ruleStudio.columns.targetType'),
      dataIndex: 'target_type',
      key: 'target_type',
      width: 140,
      render: (text) => <Tag>{text}</Tag>,
    },
    {
      title: t('ruleStudio.columns.condition'),
      dataIndex: 'condition_type',
      key: 'condition_type',
      width: 140,
      ellipsis: true,
      render: (text, record) => (
        <Tooltip title={record.condition_desc}>
          <Text style={{ fontSize: 13 }} ellipsis>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: t('ruleStudio.columns.evidence'),
      dataIndex: 'generated_link_type',
      key: 'generated_link_type',
      width: 150,
      render: (text) => <Text code style={{ fontSize: 11 }}>{text || '-'}</Text>,
    },
    {
      title: t('ruleStudio.columns.coverage'),
      key: 'coverage',
      width: 140,
      render: (_, record) => {
        const cov = coverageByRuleId[record.id];
        if (!cov) return <Text type="secondary">-</Text>;
        const total = (cov.triggered || 0) + (cov.passed || 0) + (cov.not_evaluable || 0) + (cov.not_applicable || 0);
        return (
          <Space size={4} wrap>
            {cov.triggered > 0 && <Tag color="red" style={{ fontSize: 10 }}>{cov.triggered}</Tag>}
            {cov.passed > 0 && <Tag color="green" style={{ fontSize: 10 }}>{cov.passed}</Tag>}
            {cov.not_evaluable > 0 && <Tag color="orange" style={{ fontSize: 10 }}>{cov.not_evaluable}</Tag>}
            {cov.not_applicable > 0 && <Tag style={{ fontSize: 10 }}>{cov.not_applicable}</Tag>}
            {total === 0 && <Text type="secondary" style={{ fontSize: 11 }}>-</Text>}
          </Space>
        );
      },
    },
    {
      title: t('ruleStudio.columns.actions'),
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space size={2} wrap={false}>
          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            onClick={() => openDetail(record.id)}
            style={{ padding: '0 2px', fontSize: 11 }}
          >
            {t('ruleStudio.actions.viewDetail')}
          </Button>
          <Button
            size="small"
            type="link"
            icon={<ExperimentOutlined />}
            onClick={() => {
              setSimRuleId(record.id);
              setSimResult(null);
              setTimeout(() => {
                document.getElementById('rule-sim-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            }}
            style={{ padding: '0 2px', fontSize: 11 }}
          >
            {t('ruleStudio.actions.simulate')}
          </Button>
        </Space>
      ),
    },
  ];

  // ── Section C: Rule Detail Drawer ──
  const openDetail = async (ruleId) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setRuleDetail(null);
    try {
      const res = await api.get(`/rule-studio/rules/${ruleId}`);
      setRuleDetail(res.data);
    } catch {
      setRuleDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const renderExampleCollapse = () => {
    if (!ruleDetail?.examples) return null;
    const { examples } = ruleDetail;
    const panels = [];

    if (examples.triggered) {
      panels.push({
        key: 'triggered',
        label: (
          <Space size={6}>
            <Tag color="red">{t('ruleStudio.exampleStatus.triggered')}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('ruleStudio.examples.triggeredDesc')}</Text>
          </Space>
        ),
        children: (
          <Descriptions size="small" column={1} bordered>
            {examples.triggered.product_name && (
              <Descriptions.Item label={t('ruleStudio.detail.product')}>{examples.triggered.product_name}</Descriptions.Item>
            )}
            {examples.triggered.reason && (
              <Descriptions.Item label={t('ruleStudio.detail.reason')}>{examples.triggered.reason}</Descriptions.Item>
            )}
            {examples.triggered.evidence && (
              <Descriptions.Item label={t('ruleStudio.detail.evidence')}>
                <Text code style={{ fontSize: 11 }}>{JSON.stringify(examples.triggered.evidence)}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        ),
      });
    }
    if (examples.passed) {
      panels.push({
        key: 'passed',
        label: (
          <Space size={6}>
            <Tag color="green">{t('ruleStudio.exampleStatus.passed')}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('ruleStudio.examples.passedDesc')}</Text>
          </Space>
        ),
        children: (
          <Descriptions size="small" column={1} bordered>
            {examples.passed.product_name && (
              <Descriptions.Item label={t('ruleStudio.detail.product')}>{examples.passed.product_name}</Descriptions.Item>
            )}
            {examples.passed.reason && (
              <Descriptions.Item label={t('ruleStudio.detail.reason')}>{examples.passed.reason}</Descriptions.Item>
            )}
          </Descriptions>
        ),
      });
    }
    if (examples.not_evaluable) {
      panels.push({
        key: 'not_evaluable',
        label: (
          <Space size={6}>
            <Tag color="orange">{t('ruleStudio.exampleStatus.not_evaluable')}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('ruleStudio.examples.notEvaluableDesc')}</Text>
          </Space>
        ),
        children: (
          <Descriptions size="small" column={1} bordered>
            {examples.not_evaluable.product_name && (
              <Descriptions.Item label={t('ruleStudio.detail.product')}>{examples.not_evaluable.product_name}</Descriptions.Item>
            )}
            {examples.not_evaluable.reason && (
              <Descriptions.Item label={t('ruleStudio.detail.reason')}>{examples.not_evaluable.reason}</Descriptions.Item>
            )}
          </Descriptions>
        ),
      });
    }
    if (examples.not_applicable) {
      panels.push({
        key: 'not_applicable',
        label: (
          <Space size={6}>
            <Tag>{t('ruleStudio.exampleStatus.not_applicable')}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('ruleStudio.examples.notApplicableDesc')}</Text>
          </Space>
        ),
        children: (
          <Descriptions size="small" column={1} bordered>
            {examples.not_applicable.product_name && (
              <Descriptions.Item label={t('ruleStudio.detail.product')}>{examples.not_applicable.product_name}</Descriptions.Item>
            )}
            {examples.not_applicable.reason && (
              <Descriptions.Item label={t('ruleStudio.detail.reason')}>{examples.not_applicable.reason}</Descriptions.Item>
            )}
          </Descriptions>
        ),
      });
    }

    if (panels.length === 0) return null;
    return <Collapse items={panels} defaultActiveKey={['triggered']} />;
  };

  // ── Section D: Simulation ──
  const handleSimulate = async () => {
    if (!simRuleId) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const payload = { rule_id: simRuleId };
      // Only include fields with values
      Object.entries(simFields).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          payload[key] = val;
        }
      });
      const res = await api.post('/rule-studio/simulate', payload);
      setSimResult(res.data);
    } catch {
      setSimResult(null);
    } finally {
      setSimLoading(false);
    }
  };

  const updateSimField = (key, value) => {
    setSimFields((prev) => ({ ...prev, [key]: value }));
  };

  // ── Loading / Error states ──
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
          <Button type="primary" icon={<ReloadOutlined />} onClick={loadAll}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }

  // ── Coverage summary values ──
  const triggeredCount = summary?.triggered || 0;
  const passedCount = summary?.passed || 0;
  const notEvaluableCount = summary?.not_evaluable || 0;
  const notApplicableCount = summary?.not_applicable || 0;

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {/* Page header */}
      <Card
        size="small"
        style={{
          background: 'linear-gradient(135deg, rgba(250,140,22,0.06) 0%, rgba(22,119,255,0.06) 100%)',
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8 }} />
          {t('ruleStudio.title')}
        </Title>
        <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
          {t('ruleStudio.subtitle')}
        </Paragraph>
      </Card>

      {/* Section A: Rule Overview */}
      <Card
        title={
          <>
            <ThunderboltOutlined /> {t('ruleStudio.sectionA.title')}
          </>
        }
        size="small"
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('ruleStudio.sectionA.totalRules', { count: rules.length })}
          </Text>
        }
      >
        <Table
          dataSource={rules}
          columns={ruleColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 1050 }}
        />
      </Card>

      {/* Section B: Rule Coverage */}
      <Card
        title={
          <>
            <CheckCircleOutlined /> {t('ruleStudio.sectionB.title')}
          </>
        }
        size="small"
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* Summary stat cards */}
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderColor: 'rgba(255,77,79,0.3)' }}>
                <Statistic
                  title={t('ruleStudio.coverage.triggered')}
                  value={triggeredCount}
                  prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderColor: 'rgba(82,196,26,0.3)' }}>
                <Statistic
                  title={t('ruleStudio.coverage.passed')}
                  value={passedCount}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderColor: 'rgba(250,140,22,0.3)' }}>
                <Statistic
                  title={t('ruleStudio.coverage.notEvaluable')}
                  value={notEvaluableCount}
                  prefix={<QuestionCircleOutlined style={{ color: '#fa8c16' }} />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <Statistic
                  title={t('ruleStudio.coverage.notApplicable')}
                  value={notApplicableCount}
                  prefix={<MinusCircleOutlined style={{ color: '#8c8c8c' }} />}
                />
              </Card>
            </Col>
          </Row>

          {/* Per-rule coverage table */}
          <Table
            dataSource={byRule}
            rowKey="rule_id"
            size="small"
            pagination={false}
            scroll={{ x: 700 }}
            columns={[
              {
                title: t('ruleStudio.columns.ruleName'),
                dataIndex: 'rule_name',
                key: 'rule_name',
                render: (text) => <Text strong>{text}</Text>,
              },
              {
                title: t('ruleStudio.columns.severity'),
                dataIndex: 'severity',
                key: 'severity',
                width: 100,
                render: (sev) => (
                  <Tag color={SEVERITY_COLORS[sev] || 'default'}>
                    {t(`ruleStudio.severity.${sev}`, sev)}
                  </Tag>
                ),
              },
              {
                title: t('ruleStudio.coverage.triggered'),
                dataIndex: 'triggered',
                key: 'triggered',
                width: 100,
                align: 'center',
                render: (v) => <Text style={{ color: v > 0 ? '#ff4d4f' : undefined }}>{v || 0}</Text>,
              },
              {
                title: t('ruleStudio.coverage.passed'),
                dataIndex: 'passed',
                key: 'passed',
                width: 100,
                align: 'center',
                render: (v) => <Text style={{ color: v > 0 ? '#52c41a' : undefined }}>{v || 0}</Text>,
              },
              {
                title: t('ruleStudio.coverage.notEvaluable'),
                dataIndex: 'not_evaluable',
                key: 'not_evaluable',
                width: 120,
                align: 'center',
                render: (v) => <Text style={{ color: v > 0 ? '#fa8c16' : undefined }}>{v || 0}</Text>,
              },
              {
                title: t('ruleStudio.coverage.notApplicable'),
                dataIndex: 'not_applicable',
                key: 'not_applicable',
                width: 120,
                align: 'center',
                render: (v) => <Text type="secondary">{v || 0}</Text>,
              },
            ]}
          />
        </Space>
      </Card>

      {/* Section C: Rule Detail Drawer */}
      <Drawer
        title={
          ruleDetail?.rule ? (
            <Space>
              <SafetyCertificateOutlined />
              <span>{ruleDetail.rule.name}</span>
              <Tag color={SEVERITY_COLORS[ruleDetail.rule.severity] || 'default'}>
                {t(`ruleStudio.severity.${ruleDetail.rule.severity}`, ruleDetail.rule.severity)}
              </Tag>
            </Space>
          ) : (
            t('ruleStudio.detail.title')
          )
        }
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setRuleDetail(null);
        }}
        width={640}
        destroyOnClose
      >
        {detailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : ruleDetail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Basic info */}
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t('ruleStudio.detail.description')}>
                {ruleDetail.rule?.description || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('ruleStudio.columns.targetType')}>
                <Tag>{ruleDetail.rule?.target_type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('ruleStudio.columns.condition')}>
                {ruleDetail.rule?.condition_type} — {ruleDetail.rule?.condition_desc}
              </Descriptions.Item>
              <Descriptions.Item label={t('ruleStudio.columns.evidence')}>
                <Text code style={{ fontSize: 11 }}>{ruleDetail.rule?.generated_link_type || '-'}</Text>
              </Descriptions.Item>
            </Descriptions>

            {/* Plain-language explanation */}
            {ruleDetail.logic_explanation && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                <Title level={5}>{t('ruleStudio.detail.explanation')}</Title>
                {ruleDetail.logic_explanation.plain_english && (
                  <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message={t('ruleStudio.detail.plainEnglish')}
                    description={ruleDetail.logic_explanation.plain_english}
                    style={{ marginBottom: 8 }}
                  />
                )}
                {ruleDetail.logic_explanation.plain_chinese && (
                  <Alert
                    type="info"
                    showIcon
                    message={t('ruleStudio.detail.plainChinese')}
                    description={ruleDetail.logic_explanation.plain_chinese}
                    style={{ marginBottom: 8 }}
                  />
                )}
                <Descriptions column={1} size="small" bordered>
                  {ruleDetail.logic_explanation.required_fields && (
                    <Descriptions.Item label={t('ruleStudio.detail.requiredFields')}>
                      <Space size={4} wrap>
                        {(Array.isArray(ruleDetail.logic_explanation.required_fields)
                          ? ruleDetail.logic_explanation.required_fields
                          : [ruleDetail.logic_explanation.required_fields]
                        ).map((f) => (
                          <Tag key={f} color="blue">{f}</Tag>
                        ))}
                      </Space>
                    </Descriptions.Item>
                  )}
                  {ruleDetail.logic_explanation.applicability && (
                    <Descriptions.Item label={t('ruleStudio.detail.applicability')}>
                      {ruleDetail.logic_explanation.applicability}
                    </Descriptions.Item>
                  )}
                  {ruleDetail.logic_explanation.trigger_condition && (
                    <Descriptions.Item label={t('ruleStudio.detail.triggerCondition')}>
                      {ruleDetail.logic_explanation.trigger_condition}
                    </Descriptions.Item>
                  )}
                  {ruleDetail.logic_explanation.pass_condition && (
                    <Descriptions.Item label={t('ruleStudio.detail.passCondition')}>
                      {ruleDetail.logic_explanation.pass_condition}
                    </Descriptions.Item>
                  )}
                  {ruleDetail.logic_explanation.not_evaluable_reason && (
                    <Descriptions.Item label={t('ruleStudio.detail.notEvaluableReason')}>
                      {ruleDetail.logic_explanation.not_evaluable_reason}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}

            {/* Examples */}
            {ruleDetail.examples && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                <Title level={5}>{t('ruleStudio.detail.examples')}</Title>
                {renderExampleCollapse()}
              </>
            )}
          </Space>
        ) : (
          <Alert type="error" message={t('common.loadFailed')} />
        )}
      </Drawer>

      {/* Section D: Rule Simulation Panel */}
      <Card
        id="rule-sim-panel"
        title={
          <>
            <ExperimentOutlined /> {t('ruleStudio.sectionD.title')}
          </>
        }
        size="small"
      >
        <Row gutter={[24, 16]}>
          {/* Input form */}
          <Col xs={24} md={10}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  {t('ruleStudio.simulation.selectRule')}
                </Text>
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('ruleStudio.simulation.selectRulePlaceholder')}
                  value={simRuleId}
                  onChange={(val) => {
                    setSimRuleId(val);
                    setSimResult(null);
                  }}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={rules.map((r) => ({
                    value: r.id,
                    label: `${r.name} (${r.severity})`,
                  }))}
                />
              </div>

              <Divider style={{ margin: '4px 0' }} orientation="left">
                <Text type="secondary" style={{ fontSize: 12 }}>{t('ruleStudio.simulation.inputFields')}</Text>
              </Divider>

              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                    {t('ruleStudio.simulation.species')}
                  </Text>
                  <Select
                    style={{ width: '100%' }}
                    placeholder={t('ruleStudio.simulation.selectPlaceholder')}
                    value={simFields.species}
                    onChange={(val) => updateSimField('species', val)}
                    allowClear
                    options={[
                      { value: 'cat', label: 'Cat' },
                      { value: 'dog', label: 'Dog' },
                    ]}
                    size="small"
                  />
                </Col>
                <Col span={12}>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                    {t('ruleStudio.simulation.lifeStage')}
                  </Text>
                  <Select
                    style={{ width: '100%' }}
                    placeholder={t('ruleStudio.simulation.selectPlaceholder')}
                    value={simFields.life_stage}
                    onChange={(val) => updateSimField('life_stage', val)}
                    allowClear
                    options={[
                      { value: 'kitten', label: 'Kitten' },
                      { value: 'adult', label: 'Adult' },
                      { value: 'senior', label: 'Senior' },
                    ]}
                    size="small"
                  />
                </Col>
              </Row>

              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                    {t('ruleStudio.simulation.protein')}
                  </Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="g/100g"
                    value={simFields.protein_100g}
                    onChange={(val) => updateSimField('protein_100g', val)}
                    min={0}
                    max={100}
                    step={0.1}
                    size="small"
                    addonAfter="g/100g"
                  />
                </Col>
                <Col span={12}>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                    {t('ruleStudio.simulation.fat')}
                  </Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="g/100g"
                    value={simFields.fat_100g}
                    onChange={(val) => updateSimField('fat_100g', val)}
                    min={0}
                    max={100}
                    step={0.1}
                    size="small"
                    addonAfter="g/100g"
                  />
                </Col>
              </Row>

              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                    {t('ruleStudio.simulation.phosphorus')}
                  </Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="%"
                    value={simFields.phosphorus_100g}
                    onChange={(val) => updateSimField('phosphorus_100g', val)}
                    min={0}
                    max={100}
                    step={0.01}
                    size="small"
                    addonAfter="%"
                  />
                </Col>
                <Col span={12}>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                    {t('ruleStudio.simulation.taurine')}
                  </Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="mg/kg"
                    value={simFields.taurine_mg_kg}
                    onChange={(val) => updateSimField('taurine_mg_kg', val)}
                    min={0}
                    step={1}
                    size="small"
                    addonAfter="mg/kg"
                  />
                </Col>
              </Row>

              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleSimulate}
                loading={simLoading}
                disabled={!simRuleId}
                block
              >
                {t('ruleStudio.simulation.run')}
              </Button>
            </Space>
          </Col>

          {/* Output section */}
          <Col xs={24} md={14}>
            {simResult ? (
              <Card
                size="small"
                title={
                  <Space>
                    {STATUS_ICONS[simResult.status] || <InfoCircleOutlined />}
                    <span>{t('ruleStudio.simulation.resultTitle')}</span>
                  </Space>
                }
                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Row gutter={[16, 8]}>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        {t('ruleStudio.simulation.outputStatus')}
                      </Text>
                      <Tag
                        color={STATUS_COLORS[simResult.status] || 'default'}
                        style={{ fontSize: 13, padding: '2px 10px' }}
                      >
                        {t(`common.statusLabels.${simResult.status}`, simResult.status)}
                      </Tag>
                    </Col>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        {t('ruleStudio.simulation.outputSeverity')}
                      </Text>
                      <Tag
                        color={SEVERITY_COLORS[simResult.severity] || 'default'}
                        style={{ fontSize: 13, padding: '2px 10px' }}
                      >
                        {simResult.severity || '-'}
                      </Tag>
                    </Col>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        {t('ruleStudio.simulation.outputEvidence')}
                      </Text>
                      <Tag color={simResult.would_generate_evidence ? 'green' : 'default'}>
                        {simResult.would_generate_evidence
                          ? t('ruleStudio.simulation.yes')
                          : t('ruleStudio.simulation.no')}
                      </Tag>
                    </Col>
                  </Row>

                  {simResult.reason && (
                    <Alert
                      type={simResult.status === 'triggered' ? 'error' : simResult.status === 'passed' ? 'success' : 'warning'}
                      message={t('ruleStudio.simulation.outputReason')}
                      description={simResult.reason}
                      showIcon
                    />
                  )}

                  {simResult.generated_link_type && (
                    <Descriptions size="small" column={1} bordered>
                      <Descriptions.Item label={t('ruleStudio.simulation.outputLinkType')}>
                        <Text code>{simResult.generated_link_type}</Text>
                      </Descriptions.Item>
                    </Descriptions>
                  )}

                  <Row gutter={16}>
                    {simResult.input_fields && Object.keys(simResult.input_fields).length > 0 && (
                      <Col span={simResult.missing_fields?.length > 0 ? 12 : 24}>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                          {t('ruleStudio.simulation.inputFieldsUsed')}
                        </Text>
                        <Space size={4} wrap>
                          {Object.entries(simResult.input_fields).map(([key, val]) => (
                            <Tag key={key} color="blue" style={{ fontSize: 11 }}>
                              {key}: {String(val)}
                            </Tag>
                          ))}
                        </Space>
                      </Col>
                    )}
                    {simResult.missing_fields && simResult.missing_fields.length > 0 && (
                      <Col span={simResult.input_fields && Object.keys(simResult.input_fields).length > 0 ? 12 : 24}>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                          {t('ruleStudio.simulation.missingFields')}
                        </Text>
                        <Space size={4} wrap>
                          {simResult.missing_fields.map((f) => (
                            <Tag key={f} color="orange" style={{ fontSize: 11 }}>
                              {f}
                            </Tag>
                          ))}
                        </Space>
                      </Col>
                    )}
                  </Row>
                </Space>
              </Card>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  borderRadius: 8,
                  border: '1px dashed rgba(255,255,255,0.1)',
                  minHeight: 200,
                }}
              >
                <ExperimentOutlined style={{ fontSize: 32, opacity: 0.2, marginBottom: 12 }} />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t('ruleStudio.simulation.placeholder')}
                </Text>
              </div>
            )}
          </Col>
        </Row>
      </Card>
    </Space>
  );
}
