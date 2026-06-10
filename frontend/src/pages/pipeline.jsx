import { useState } from 'react';
import { Card, Button, Space, Typography, Tag, Steps, Table, Select, Spin, Alert, Row, Col, Statistic, message, Empty, Progress, Divider } from 'antd';
import {
  DatabaseOutlined,
  FileSearchOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  TableOutlined,
  LinkOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../providers/dataProvider';

const { Title, Text, Paragraph } = Typography;

const STATUS_COLORS = {
  draft: 'default',
  validated: 'green',
  has_errors: 'red',
  ready_for_review: 'orange',
};

const SAMPLE_INFO = {
  pet_food_products: { icon: '📦', objectType: 'PetFoodProduct', linkType: '', desc_en: 'Product catalog with nutrition values', desc_zh: '包含营养成分的产品目录' },
  pet_food_ingredients: { icon: '🧪', objectType: 'Ingredient', linkType: '', desc_en: 'Ingredient definitions with allergen flags', desc_zh: '含过敏原标记的成分定义' },
  product_ingredients: { icon: '🔗', objectType: '', linkType: 'CONTAINS', desc_en: 'Product-to-ingredient relationships', desc_zh: '产品与成分的关联关系' },
  risk_rules: { icon: '⚠️', objectType: 'RiskRule', linkType: '', desc_en: 'Domain risk rules with conditions', desc_zh: '含条件的领域风险规则' },
};

export default function PipelinePage() {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(-1);
  const [samples, setSamples] = useState([]);
  const [selectedSample, setSelectedSample] = useState('');
  const [profile, setProfile] = useState(null);
  const [mappings, setMappings] = useState(null);
  const [importPlan, setImportPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  const isZh = i18n.language === 'zh';

  const loadSamples = async () => {
    try {
      const { data } = await api.get('/pipeline/samples');
      setSamples(data.samples || []);
    } catch { setSamples([]); }
  };

  const handleProfile = async () => {
    if (!selectedSample) { message.warning(t('pipeline.selectSample')); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/pipeline/profile/sample', { sample_name: selectedSample });
      setProfile(data);
      setMappings(null);
      setImportPlan(null);
      setStep(1);
    } catch { message.error(t('pipeline.profileFailed')); }
    finally { setLoading(false); }
  };

  const handleSuggestMappings = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data } = await api.post('/pipeline/mappings/suggest', { source_id: profile.source_id, domain: 'pet_food' });
      setMappings(data);
      setImportPlan(null);
      setStep(2);
    } catch { message.error(t('pipeline.mappingFailed')); }
    finally { setLoading(false); }
  };

  const handleCreatePlan = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data } = await api.post('/pipeline/import-plan', { source_id: profile.source_id, domain: 'pet_food' });
      setImportPlan(data);
      setStep(4);
    } catch { message.error(t('pipeline.planFailed')); }
    finally { setLoading(false); }
  };

  const stepItems = [
    { title: t('pipeline.s1'), icon: <DatabaseOutlined /> },
    { title: t('pipeline.s2'), icon: <FileSearchOutlined /> },
    { title: t('pipeline.s3'), icon: <SwapOutlined /> },
    { title: t('pipeline.s4'), icon: <EyeOutlined /> },
    { title: t('pipeline.s5'), icon: <SafetyCertificateOutlined /> },
    { title: t('pipeline.s6'), icon: <ImportOutlined /> },
  ];

  const profileColumns = [
    { title: t('pipeline.columnName'), dataIndex: 'name', key: 'name', render: v => <Text code>{v}</Text> },
    { title: t('pipeline.inferredType'), dataIndex: 'inferred_type', key: 'type', render: v => <Tag>{v}</Tag> },
    { title: t('pipeline.nullRate'), dataIndex: 'null_rate', key: 'null', render: v => <Progress percent={Math.round(v * 100)} size="small" status={v > 0.5 ? 'exception' : 'active'} /> },
    { title: t('pipeline.uniqueCount'), dataIndex: 'unique_count', key: 'unique' },
    { title: t('pipeline.samples'), dataIndex: 'sample_values', key: 'samples', ellipsis: true, render: v => v?.slice(0, 3).join(', ') },
  ];

  const mappingColumns = [
    { title: t('pipeline.sourceColumn'), dataIndex: 'source_column', key: 'src', render: v => <Text code>{v}</Text> },
    { title: t('pipeline.targetType'), dataIndex: 'suggested_object_type', key: 'type', render: v => v ? <Tag color="blue">{v}</Tag> : <Tag>—</Tag> },
    { title: t('pipeline.targetProperty'), dataIndex: 'suggested_property', key: 'prop', render: v => v ? <Text code>{v}</Text> : '—' },
    { title: t('pipeline.confidence'), dataIndex: 'confidence', key: 'conf', render: v => <Tag color={v >= 0.8 ? 'green' : v >= 0.5 ? 'orange' : 'red'}>{(v * 100).toFixed(0)}%</Tag> },
    { title: t('pipeline.reason'), dataIndex: 'reason', key: 'reason', ellipsis: true },
  ];

  // Candidate preview tables
  const candidateObjColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: t('common.type'), dataIndex: 'type', key: 'type', render: v => <Tag color="blue">{v}</Tag> },
    { title: t('pipeline.confidence'), dataIndex: 'confidence', key: 'conf', render: v => `${(v * 100).toFixed(0)}%` },
    { title: t('common.properties'), dataIndex: 'properties', key: 'props', ellipsis: true, render: v => Object.keys(v || {}).length + ' fields' },
  ];
  const candidateLinkColumns = [
    { title: t('pipeline.sourceId'), dataIndex: 'source_id', key: 'src', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: t('common.type'), dataIndex: 'type', key: 'type', render: v => <Tag color="green">{v}</Tag> },
    { title: t('pipeline.targetId'), dataIndex: 'target_id', key: 'tgt', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {/* Header */}
      <div>
        <Title level={3} style={{ margin: 0 }}>{t('pipeline.title')}</Title>
        <Text type="secondary">{t('pipeline.subtitle')}</Text>
      </div>

      {/* Intro card */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={t('pipeline.intro')}
        style={{ fontSize: 12 }}
      />

      {/* Steps */}
      <Steps current={step < 0 ? 0 : step} items={stepItems} size="small" onChange={i => { if (i <= step) setStep(i); }} />

      {/* ── Step 0: Select Source ─────────────────────────────────── */}
      <Card title={<><DatabaseOutlined /> {t('pipeline.s1')}</>}>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Text>{t('pipeline.selectSampleLabel')}</Text>
          <Row gutter={[12, 12]}>
            {samples.length === 0 && (
              <Col span={24}>
                <Button icon={<DatabaseOutlined />} onClick={loadSamples} block>{t('pipeline.loadSamples')}</Button>
              </Col>
            )}
            {samples.map(s => {
              const info = SAMPLE_INFO[s.name] || {};
              const selected = selectedSample === s.name;
              return (
                <Col xs={24} sm={12} md={6} key={s.name}>
                  <Card
                    size="small"
                    hoverable
                    onClick={() => setSelectedSample(s.name)}
                    style={{ borderColor: selected ? '#1677ff' : undefined, cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{info.icon || '📋'}</div>
                    <Text strong style={{ display: 'block', fontSize: 13 }}>{s.name}</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                      {isZh ? info.desc_zh : info.desc_en}
                    </Text>
                    <div style={{ marginTop: 8 }}>
                      {info.objectType && <Tag color="blue" style={{ fontSize: 10 }}>{info.objectType}</Tag>}
                      {info.linkType && <Tag color="green" style={{ fontSize: 10 }}>{info.linkType}</Tag>}
                      <Tag style={{ fontSize: 9 }}>{t('common.demoData')}</Tag>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
          {selectedSample && (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleProfile} loading={loading}>
              {t('pipeline.profileButton')}
            </Button>
          )}
        </Space>
      </Card>

      {/* ── Step 1: Profile Data ──────────────────────────────────── */}
      {step >= 1 && profile && (
        <Card
          title={<><FileSearchOutlined /> {t('pipeline.s2')} — {profile.source_name}</>}
          extra={<Tag>{profile.row_count} {t('pipeline.rows').toLowerCase()} × {profile.column_count} {t('pipeline.cols').toLowerCase()}</Tag>}
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={16}>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.rowCount')} value={profile.row_count} prefix={<TableOutlined />} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.columnCount')} value={profile.column_count} prefix={<TableOutlined />} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.sampleRows')} value={profile.sample_rows?.length || 0} /></Card></Col>
            </Row>
            <Divider style={{ margin: '8px 0' }} />
            <Text strong>{t('pipeline.columnProfiles')}</Text>
            <Table dataSource={profile.columns} columns={profileColumns} rowKey="name" size="small" pagination={false} />
            {profile.sample_rows?.length > 0 && (
              <>
                <Text strong>{t('pipeline.sampleRows')}</Text>
                <Table
                  dataSource={profile.sample_rows}
                  columns={Object.keys(profile.sample_rows[0] || {}).map(k => ({ title: k, dataIndex: k, key: k, ellipsis: true }))}
                  rowKey={(_, i) => i}
                  size="small"
                  pagination={false}
                  scroll={{ x: true }}
                />
              </>
            )}
            {step === 1 && (
              <Button type="primary" icon={<SwapOutlined />} onClick={handleSuggestMappings} loading={loading}>
                {t('pipeline.suggestMappings')}
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* ── Step 2: Map to Ontology ──────────────────────────────── */}
      {step >= 2 && mappings && (
        <Card title={<><SwapOutlined /> {t('pipeline.s3')}</>}>
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {mappings.object_mappings?.length > 0 && (
              <div>
                <Text strong>{t('pipeline.objectMappings')}:</Text>
                <div style={{ marginTop: 8 }}>
                  {mappings.object_mappings.map((m, i) => (
                    <Tag key={i} color="blue" style={{ margin: 2 }}>
                      {m.object_type} ({m.field_mappings?.length} {t('pipeline.fields')})
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            <Table dataSource={mappings.field_suggestions} columns={mappingColumns} rowKey="source_column" size="small" pagination={false} />
            {step === 2 && (
              <Button type="primary" icon={<EyeOutlined />} onClick={handleCreatePlan} loading={loading}>
                {t('pipeline.generatePlan')}
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* ── Step 3: Candidate Preview (auto-generated with plan) ─── */}
      {importPlan && (
        <Card title={<><EyeOutlined /> {t('pipeline.s4')}</>}>
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small">
                  <Statistic title={t('pipeline.candidateObjects')} value={importPlan.candidate_objects?.length || 0} prefix={<TableOutlined style={{ color: '#1677ff' }} />} />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic title={t('pipeline.candidateLinks')} value={importPlan.candidate_links?.length || 0} prefix={<LinkOutlined style={{ color: '#52c41a' }} />} />
                </Card>
              </Col>
            </Row>
            {importPlan.candidate_objects?.length > 0 && (
              <>
                <Text strong>{t('pipeline.candidateObjects')}:</Text>
                <Table dataSource={importPlan.candidate_objects.slice(0, 10)} columns={candidateObjColumns} rowKey="id" size="small" pagination={false} />
              </>
            )}
            {importPlan.candidate_links?.length > 0 && (
              <>
                <Text strong>{t('pipeline.candidateLinks')}:</Text>
                <Table dataSource={importPlan.candidate_links.slice(0, 10)} columns={candidateLinkColumns} rowKey={(_, i) => i} size="small" pagination={false} />
              </>
            )}
            {(!importPlan.candidate_objects?.length && !importPlan.candidate_links?.length) && (
              <Empty description={t('pipeline.noCandidates')} />
            )}
          </Space>
        </Card>
      )}

      {/* ── Step 4: Validation ────────────────────────────────────── */}
      {importPlan && (
        <Card title={<><SafetyCertificateOutlined /> {t('pipeline.s5')}</>}>
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {(() => {
              const issues = importPlan.validation_issues || [];
              const critical = issues.filter(i => i.level === 'critical');
              const errors = issues.filter(i => i.level === 'error');
              const warnings = issues.filter(i => i.level === 'warning');
              const infos = issues.filter(i => i.level === 'info');
              return (
                <>
                  <Row gutter={16}>
                    <Col span={6}><Card size="small"><Statistic title="Critical" value={critical.length} valueStyle={{ color: critical.length > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title={t('pipeline.valErrors')} value={errors.length} valueStyle={{ color: errors.length > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title={t('pipeline.valWarnings')} value={warnings.length} valueStyle={{ color: warnings.length > 0 ? '#fa8c16' : undefined }} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title="Info" value={infos.length} /></Card></Col>
                  </Row>
                  {issues.length === 0 ? (
                    <Alert type="success" showIcon message={t('pipeline.noCriticalIssues')} />
                  ) : (
                    <Table
                      dataSource={issues}
                      rowKey={(_, i) => i}
                      size="small"
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: t('common.level'), dataIndex: 'level', key: 'level', width: 80, render: v => <Tag color={v === 'critical' ? 'red' : v === 'error' ? 'red' : v === 'warning' ? 'orange' : 'default'}>{v}</Tag> },
                        { title: 'Code', dataIndex: 'code', key: 'code', width: 200 },
                        { title: t('common.description'), dataIndex: 'message', key: 'msg', ellipsis: true },
                      ]}
                    />
                  )}
                </>
              );
            })()}
          </Space>
        </Card>
      )}

      {/* ── Step 5: Import Plan ──────────────────────────────────── */}
      {importPlan && (
        <Card
          title={<><ImportOutlined /> {t('pipeline.s6')} — {importPlan.plan_id}</>}
          extra={<Tag color={STATUS_COLORS[importPlan.status]}>{importPlan.status}</Tag>}
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.newObjects')} value={importPlan.summary?.new_objects || 0} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.newLinks')} value={importPlan.summary?.new_links || 0} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.valErrors')} value={importPlan.summary?.validation_errors || 0} valueStyle={{ color: importPlan.summary?.validation_errors > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.avgConfidence')} value={`${((importPlan.summary?.confidence_avg || 0) * 100).toFixed(1)}%`} /></Card></Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}><Card size="small"><Statistic title={t('pipeline.valWarnings')} value={importPlan.summary?.validation_warnings || 0} /></Card></Col>
              <Col span={8}><Card size="small"><Statistic title={t('pipeline.reviewRequired')} value={importPlan.summary?.review_required || 0} /></Card></Col>
              <Col span={8}><Card size="small"><Statistic title={t('common.status')} value={importPlan.status} /></Card></Col>
            </Row>
            <Alert type="info" showIcon message={t('pipeline.importNote')} />
          </Space>
        </Card>
      )}
    </Space>
  );
}
