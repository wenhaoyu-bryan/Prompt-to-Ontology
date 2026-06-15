import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Space, Typography, Tag, Steps, Table, Alert, Row, Col, Statistic, message, Progress, Divider, Collapse, Badge, Radio, Upload, Select } from 'antd';
import {
  DatabaseOutlined,
  FileSearchOutlined,
  SwapOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
  TableOutlined,
  LinkOutlined,
  RightOutlined,
  SendOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  RocketOutlined,
  ApartmentOutlined,
  UploadOutlined,
  InboxOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../providers/dataProvider';

const { Title, Text } = Typography;

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

const TARGET_OBJECT_TYPES = ['PetFoodProduct', 'Ingredient', 'Brand', 'RiskRule', 'Species', 'LifeStage'];

const SOURCE_TYPE_LABELS = {
  sample: 'pipeline.sourceTypeSample',
  custom_csv: 'pipeline.sourceTypeCustomCSV',
  build_scenario: 'pipeline.sourceTypeBuildScenario',
};

function formatTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function PipelinePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(-1);
  const [samples, setSamples] = useState([]);
  const [selectedSample, setSelectedSample] = useState('');
  const [profile, setProfile] = useState(null);
  const [mappings, setMappings] = useState(null);
  const [importPlan, setImportPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recentPlans, setRecentPlans] = useState([]);
  const [buildPlan, setBuildPlan] = useState(null);
  const [buildPlanLoading, setBuildPlanLoading] = useState(false);
  const [demoState, setDemoState] = useState(null);
  const [sourceMode, setSourceMode] = useState('sample');
  const [targetObjectType, setTargetObjectType] = useState('PetFoodProduct');
  const [mappingOverrides, setMappingOverrides] = useState({});
  const [csvImportType, setCsvImportType] = useState('object');
  const [linkTypes, setLinkTypes] = useState({});
  const [relLinkType, setRelLinkType] = useState('CONTAINS');
  const [relSourceIdCol, setRelSourceIdCol] = useState('');
  const [relTargetIdCol, setRelTargetIdCol] = useState('');
  const [relPropertyCols, setRelPropertyCols] = useState([]);

  const isZh = i18n.language === 'zh';

  // Auto-load samples, recent plans, and demo state on mount
  useEffect(() => {
    loadSamples();
    loadRecentPlans();
    api.get('/demo/state').then(r => setDemoState(r.data)).catch(() => {});
    api.get('/pipeline/link-types/pet_food').then(r => setLinkTypes(r.data.link_types || {})).catch(() => {});
  }, []);

  const loadSamples = async () => {
    try {
      const { data } = await api.get('/pipeline/samples');
      setSamples(data.samples || []);
    } catch { setSamples([]); }
  };

  const loadRecentPlans = async () => {
    try {
      const { data } = await api.get('/pipeline/import-plans');
      setRecentPlans(data.plans || []);
    } catch { setRecentPlans([]); }
  };

  const handleProfile = async () => {
    if (!selectedSample) { message.warning(t('pipeline.selectSample')); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/pipeline/profile/sample', { sample_name: selectedSample });
      setProfile(data);
      setMappings(null);
      setImportPlan(null);
      setMappingOverrides({});
      setStep(1);
    } catch { message.error(t('pipeline.profileFailed')); }
    finally { setLoading(false); }
  };

  const handleCSVUpload = async (file) => {
    setLoading(true);
    try {
      const content = await file.text();
      const { data } = await api.post('/pipeline/profile/csv', { filename: file.name, content });
      setProfile(data);
      setMappings(null);
      setImportPlan(null);
      setMappingOverrides({});
      setStep(1);
      message.success(`${file.name} — ${data.row_count} rows × ${data.column_count} columns`);
    } catch { message.error(t('pipeline.profileFailed')); }
    finally { setLoading(false); }
    return false; // prevent default upload
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
      const body = { source_id: profile.source_id, domain: 'pet_food' };
      // Apply mapping overrides for custom CSV
      if (sourceMode === 'custom' && mappings && Object.keys(mappingOverrides).length > 0) {
        const ignored = new Set();
        const objMappingGroups = {};
        // Start from auto-suggested mappings
        for (const fs of (mappings.field_suggestions || [])) {
          const override = mappingOverrides[fs.source_column];
          if (override === 'ignore') { ignored.add(fs.source_column); continue; }
          const objType = override?.objectType || fs.suggested_object_type;
          const prop = override?.property || fs.suggested_property;
          if (!objType) continue;
          if (!objMappingGroups[objType]) objMappingGroups[objType] = { object_type: objType, id_column: '', field_mappings: [] };
          const ID_PROPS = { PetFoodProduct: 'product_id', Ingredient: 'ingredient_id', Brand: 'brand_id', RiskRule: 'rule_id', Species: 'species_id', LifeStage: 'stage_id' };
          if (ID_PROPS[objType] === prop) {
            objMappingGroups[objType].id_column = fs.source_column;
          }
          objMappingGroups[objType].field_mappings.push({ source_column: fs.source_column, target_object_type: objType, target_property: prop, confidence: override ? 1.0 : fs.confidence, mapping_type: override ? 'manual' : fs.mapping_type });
        }
        body.object_mappings = Object.values(objMappingGroups);
      }
      const { data } = await api.post('/pipeline/import-plan', body);
      setImportPlan(data);
      setStep(4);
      loadRecentPlans();
    } catch { message.error(t('pipeline.planFailed')); }
    finally { setLoading(false); }
  };

  const handleCreateRelationshipPlan = async () => {
    if (!profile) return;
    if (!relSourceIdCol || !relTargetIdCol) { message.warning('Select source and target ID columns'); return; }
    setLoading(true);
    try {
      const lt = linkTypes[relLinkType] || {};
      const { data } = await api.post('/pipeline/relationship-import-plan', {
        source_id: profile.source_id,
        domain: 'pet_food',
        link_type: relLinkType,
        source_id_column: relSourceIdCol,
        target_id_column: relTargetIdCol,
        source_object_type: lt.source_type || '',
        target_object_type: lt.target_type || '',
        property_columns: relPropertyCols,
      });
      setImportPlan(data);
      setStep(4);
      loadRecentPlans();
    } catch (err) { message.error(err?.response?.data?.detail || t('pipeline.planFailed')); }
    finally { setLoading(false); }
  };

  const handleSubmitToReview = async (planId) => {
    const id = planId || importPlan?.plan_id;
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/review/from-import-plan/${id}`);
      message.success(t('pipeline.submitReviewSuccess'));
      loadRecentPlans();
      // If submitting from the active plan, update local state
      if (!planId && importPlan) {
        setImportPlan(prev => prev ? { ...prev, submitted_to_review: true, review_batch_id: data.batch.id } : prev);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || t('pipeline.submitReviewFailed');
      message.error(detail);
    } finally { setLoading(false); }
  };

  const handleViewPlan = async (planId) => {
    try {
      const { data } = await api.get(`/pipeline/import-plan/${planId}`);
      setImportPlan(data);
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { message.error(t('common.loadFailed')); }
  };

  const handleCreateBuildPlan = async () => {
    setBuildPlanLoading(true);
    try {
      const { data } = await api.post('/pipeline/build-scenario', { scenario_id: 'pet_food_full_build' });
      setBuildPlan(data);
      message.success(t('pipeline.buildPlanCreated'));
    } catch (err) {
      message.error(err?.response?.data?.detail || t('pipeline.buildPlanFailed'));
    } finally { setBuildPlanLoading(false); }
  };

  const handleSubmitBuildPlan = async () => {
    if (!buildPlan) return;
    setBuildPlanLoading(true);
    try {
      const { data } = await api.post(`/review/from-build-plan/${buildPlan.id}`);
      setBuildPlan(prev => prev ? { ...prev, submitted_to_review: true, review_batch_id: data.batch_id } : prev);
      message.success(t('pipeline.buildPlanSubmitted'));
    } catch (err) {
      message.error(err?.response?.data?.detail || t('pipeline.submitReviewFailed'));
    } finally { setBuildPlanLoading(false); }
  };

  // ── Recent Plans columns ────────────────────────────────────────────

  const recentPlanColumns = [
    {
      title: 'Plan ID',
      dataIndex: 'plan_id',
      key: 'plan_id',
      width: 130,
      render: v => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: t('pipeline.source'),
      key: 'source',
      width: 130,
      render: (_, r) => {
        const st = r.metadata?.source_type || r.source_profile?.source_type;
        const importType = r.metadata?.import_type;
        let color = st === 'custom_csv' ? 'orange' : st === 'sample' ? 'blue' : 'default';
        let label;
        if (st === 'custom_csv' && importType === 'relationship') {
          label = t('pipeline.sourceTypeRelCSV');
          color = 'purple';
        } else if (st === 'custom_csv') {
          label = t('pipeline.sourceTypeObjectCSV');
        } else {
          label = SOURCE_TYPE_LABELS[st] ? t(SOURCE_TYPE_LABELS[st]) : (r.source_profile?.source_name || '—');
        }
        return <><Tag color={color} style={{ fontSize: 10 }}>{label}</Tag> {r.source_profile?.source_name || ''}</>;
      },
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: v => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
    },
    {
      title: t('pipeline.newObjects'),
      key: 'objects',
      width: 80,
      render: (_, r) => r.summary?.new_objects || 0,
    },
    {
      title: t('pipeline.newLinks'),
      key: 'links',
      width: 80,
      render: (_, r) => r.summary?.new_links || 0,
    },
    {
      title: t('pipeline.valErrors'),
      key: 'errors',
      width: 70,
      render: (_, r) => {
        const v = r.summary?.validation_errors || 0;
        return <Text type={v > 0 ? 'danger' : undefined}>{v}</Text>;
      },
    },
    {
      title: t('pipeline.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: v => <Text type="secondary" style={{ fontSize: 11 }}>{formatTime(v)}</Text>,
    },
    {
      title: t('pipeline.reviewStatus'),
      key: 'review',
      width: 140,
      render: (_, r) => {
        if (r.submitted_to_review && r.review_batch_id) {
          return (
            <Button type="link" size="small" style={{ padding: 0 }}
              onClick={() => navigate(`/review?batch_id=${r.review_batch_id}`)}>
              <CheckCircleOutlined style={{ color: '#52c41a' }} /> {r.review_batch_id.slice(0, 16)}…
            </Button>
          );
        }
        if (r.summary?.validation_errors > 0) {
          return <Tag>{t('pipeline.hasErrors')}</Tag>;
        }
        return <Tag>{t('pipeline.notSubmitted')}</Tag>;
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => handleViewPlan(r.plan_id)}>
            {t('pipeline.viewPlan')}
          </Button>
          {!r.submitted_to_review && r.summary?.validation_errors === 0 && (
            <Button size="small" type="link" icon={<SendOutlined />}
              onClick={() => handleSubmitToReview(r.plan_id)}>
              {t('pipeline.submitShort')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // ── Step items ──────────────────────────────────────────────────────

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
    { title: t('pipeline.targetType'), dataIndex: 'suggested_object_type', key: 'type', render: (v, record) => {
      const override = mappingOverrides[record.source_column];
      if (override === 'ignore') return <Tag>—</Tag>;
      if (override?.objectType) return <Tag color="blue">{override.objectType}</Tag>;
      return v ? <Tag color="blue">{v}</Tag> : <Tag>—</Tag>;
    }},
    { title: t('pipeline.targetProperty'), dataIndex: 'suggested_property', key: 'prop', render: (v, record) => {
      const override = mappingOverrides[record.source_column];
      if (override === 'ignore') return <Text type="secondary">{t('pipeline.ignoreColumn')}</Text>;
      if (override?.property) return <Text code>{override.property}</Text>;
      return v ? <Text code>{v}</Text> : '—';
    }},
    { title: t('pipeline.confidence'), dataIndex: 'confidence', key: 'conf', render: (v, record) => {
      if (mappingOverrides[record.source_column] && mappingOverrides[record.source_column] !== 'ignore') return <Tag color="green">100%</Tag>;
      return <Tag color={v >= 0.8 ? 'green' : v >= 0.5 ? 'orange' : 'red'}>{(v * 100).toFixed(0)}%</Tag>;
    }},
    { title: t('pipeline.reason'), dataIndex: 'reason', key: 'reason', ellipsis: true },
    ...(sourceMode === 'custom' ? [{
      title: t('pipeline.mappingOverride'),
      key: 'override',
      width: 160,
      render: (_, record) => (
        <Select size="small" style={{ width: '100%' }} placeholder={t('pipeline.overrideMapping')}
          allowClear value={mappingOverrides[record.source_column] === 'ignore' ? 'ignore' : mappingOverrides[record.source_column]?.objectType || undefined}
          onChange={(val) => {
            setMappingOverrides(prev => {
              const next = { ...prev };
              if (val === 'ignore') { next[record.source_column] = 'ignore'; }
              else if (val) { next[record.source_column] = { objectType: val, property: record.suggested_property }; }
              else { delete next[record.source_column]; }
              return next;
            });
          }}>
          {TARGET_OBJECT_TYPES.map(ot => <Select.Option key={ot} value={ot}>{ot}</Select.Option>)}
          <Select.Option value="ignore">{t('pipeline.ignoreColumn')}</Select.Option>
        </Select>
      ),
    }] : []),
  ];

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

      {/* Build Full Scenario */}
      {!buildPlan && (
        <Card
          style={{ background: 'linear-gradient(135deg, rgba(22,119,255,0.04) 0%, rgba(114,46,209,0.04) 100%)', border: '1px solid rgba(22,119,255,0.15)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                <RocketOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                {t('pipeline.buildScenarioTitle')}
              </div>
              <Text type="secondary" style={{ fontSize: 13 }}>{t('pipeline.buildScenarioDesc')}</Text>
              {demoState?.mode === 'clean' && (
                <div style={{ marginTop: 4 }}><Tag color="blue">{t('pipeline.buildScenarioRecommended')}</Tag></div>
              )}
            </div>
            <Button type="primary" icon={<ExperimentOutlined />} loading={buildPlanLoading} onClick={handleCreateBuildPlan}>
              {t('pipeline.buildScenarioCTA')}
            </Button>
          </div>
        </Card>
      )}

      {/* Build Plan Preview */}
      {buildPlan && (
        <Card
          title={<><ApartmentOutlined /> {t('pipeline.buildPlanTitle')}</>}
          extra={
            !buildPlan.submitted_to_review ? (
              <Button type="primary" icon={<SendOutlined />} loading={buildPlanLoading} onClick={handleSubmitBuildPlan}>
                {t('pipeline.submitToReview')}
              </Button>
            ) : (
              <Button type="link" onClick={() => navigate('/review')}>
                {t('pipeline.goToReview')} <RightOutlined />
              </Button>
            )
          }
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {/* Summary */}
            <Row gutter={16}>
              <Col span={4}><Statistic title={t('pipeline.source')} value={buildPlan.summary?.sources || 0} prefix={<DatabaseOutlined />} /></Col>
              <Col span={5}><Statistic title={t('pipeline.candidateObjects')} value={buildPlan.summary?.total_candidate_objects || 0} /></Col>
              <Col span={5}><Statistic title={t('pipeline.candidateLinks')} value={buildPlan.summary?.total_candidate_links || 0} /></Col>
              <Col span={5}><Statistic title={t('pipeline.valErrors')} value={buildPlan.summary?.total_validation_errors || 0} valueStyle={{ color: (buildPlan.summary?.total_validation_errors || 0) > 0 ? '#ff4d4f' : undefined }} /></Col>
              <Col span={5}><Statistic title={t('pipeline.valWarnings')} value={buildPlan.summary?.total_validation_warnings || 0} /></Col>
            </Row>

            {/* Validation */}
            {buildPlan.validation?.cross_source_errors?.length > 0 && (
              <Alert type="error" showIcon message={t('pipeline.crossSourceErrors')} description={buildPlan.validation.cross_source_errors.join('; ')} />
            )}

            {/* Stages */}
            <Collapse
              defaultActiveKey={buildPlan.stages?.map(s => s.stage_id) || []}
              items={(buildPlan.stages || []).map(stage => ({
                key: stage.stage_id,
                label: (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span><Tag color="blue">{stage.order}</Tag> {stage.title}</span>
                    <Space size={8}>
                      <Tag>{stage.candidate_objects?.length || 0} {t('pipeline.candidateObjects').toLowerCase()}</Tag>
                      <Tag>{stage.candidate_links?.length || 0} {t('pipeline.candidateLinks').toLowerCase()}</Tag>
                    </Space>
                  </div>
                ),
                children: (
                  <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                    <Text type="secondary">{stage.description}</Text>
                    {stage.object_types?.length > 0 && (
                      <div>{t('schema.objectTypes')}: {stage.object_types.map(t => <Tag key={t}>{t}</Tag>)}</div>
                    )}
                    {stage.link_types?.length > 0 && (
                      <div>{t('schema.linkTypes')}: {stage.link_types.map(t => <Tag key={t} color="green">{t}</Tag>)}</div>
                    )}
                    {stage.validation_errors?.length > 0 && (
                      <Alert type="error" showIcon message={stage.validation_errors.join('; ')} />
                    )}
                    {stage.validation_warnings?.length > 0 && (
                      <Alert type="warning" showIcon message={stage.validation_warnings.join('; ')} />
                    )}
                  </Space>
                ),
              }))}
            />
          </Space>
        </Card>
      )}

      {/* Steps */}
      <Steps current={step < 0 ? 0 : step} items={stepItems} size="small" onChange={i => { if (i <= step) setStep(i); }} />

      {/* ── Step 0: Select Source ─────────────────────────────────── */}
      <Card title={<><DatabaseOutlined /> {t('pipeline.s1')}</>}>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          {/* Source Mode Switch */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('pipeline.dataSourceMode')}</Text>
            <Radio.Group value={sourceMode} onChange={e => { setSourceMode(e.target.value); setCsvImportType('object'); setStep(-1); setProfile(null); setMappings(null); setImportPlan(null); setMappingOverrides({}); setRelSourceIdCol(''); setRelTargetIdCol(''); setRelPropertyCols([]); }}>
              <Radio.Button value="sample"><DatabaseOutlined /> {t('pipeline.sampleData')}</Radio.Button>
              <Radio.Button value="custom"><UploadOutlined /> {t('pipeline.customCSV')}</Radio.Button>
            </Radio.Group>
          </div>

          {/* Sample Data Mode */}
          {sourceMode === 'sample' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>{t('pipeline.selectSampleLabel')}</Text>
                <Button size="small" icon={<ReloadOutlined />} onClick={loadSamples}>{t('common.refresh')}</Button>
              </div>
              <Row gutter={[12, 12]}>
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
            </>
          )}

          {/* Custom CSV Mode */}
          {sourceMode === 'custom' && (
            <>
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('pipeline.csvImportType')}</Text>
                <Radio.Group value={csvImportType} onChange={e => { setCsvImportType(e.target.value); setProfile(null); setMappings(null); setImportPlan(null); setMappingOverrides({}); setRelSourceIdCol(''); setRelTargetIdCol(''); setRelPropertyCols([]); setStep(-1); }}>
                  <Radio.Button value="object"><TableOutlined /> {t('pipeline.objectCSV')}</Radio.Button>
                  <Radio.Button value="relationship"><LinkOutlined /> {t('pipeline.relationshipCSV')}</Radio.Button>
                </Radio.Group>
              </div>
              <Alert type="info" showIcon icon={<InfoCircleOutlined />} message={csvImportType === 'object' ? t('pipeline.objectCSVDesc') : t('pipeline.relationshipCSVDesc')} style={{ fontSize: 12 }} />
              <Card size="small" style={{ background: 'rgba(22,119,255,0.03)' }}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <Upload.Dragger
                    accept=".csv"
                    showUploadList={false}
                    beforeUpload={handleCSVUpload}
                    style={{ padding: '16px 0' }}
                  >
                    <p className="ant-upload-drag-icon"><CloudUploadOutlined style={{ fontSize: 40, color: '#1677ff' }} /></p>
                    <p className="ant-upload-text" style={{ fontSize: 14 }}>{t('pipeline.dropCSV')}</p>
                    <p className="ant-upload-hint" style={{ fontSize: 12 }}>{t('pipeline.csvUploadHint')}</p>
                  </Upload.Dragger>
                </div>
              </Card>
              {csvImportType === 'object' && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('pipeline.targetObjectType')}</Text>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{t('pipeline.targetObjectTypeDesc')}</Text>
                  <Select style={{ width: 240 }} value={targetObjectType} onChange={setTargetObjectType}>
                    {TARGET_OBJECT_TYPES.map(ot => <Select.Option key={ot} value={ot}>{ot}</Select.Option>)}
                  </Select>
                </div>
              )}
              {csvImportType === 'relationship' && demoState?.mode === 'clean' && (demoState?.graph?.node_count || 0) === 0 && (
                <Alert type="warning" showIcon message={t('pipeline.relationshipRequiresObjects')} />
              )}
              {csvImportType === 'relationship' && (
                <Card size="small" title={t('pipeline.targetLinkType')}>
                  <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{t('pipeline.targetLinkTypeDesc')}</Text>
                      <Select style={{ width: '100%' }} value={relLinkType} onChange={setRelLinkType}>
                        {Object.entries(linkTypes).map(([name, lt]) => (
                          <Select.Option key={name} value={name}>{name} ({lt.source_type} → {lt.target_type})</Select.Option>
                        ))}
                      </Select>
                      {relLinkType && linkTypes[relLinkType] && (
                        <div style={{ marginTop: 8 }}>
                          <Tag color="blue">{linkTypes[relLinkType].source_type}</Tag>
                          <RightOutlined style={{ margin: '0 8px', fontSize: 12 }} />
                          <Tag color="green">{linkTypes[relLinkType].target_type}</Tag>
                        </div>
                      )}
                    </div>
                    {profile && (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Row gutter={16}>
                          <Col span={8}>
                            <Text strong style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t('pipeline.sourceIdColumn')}</Text>
                            <Select style={{ width: '100%' }} placeholder={t('pipeline.sourceIdColumn')} value={relSourceIdCol || undefined} onChange={setRelSourceIdCol}>
                              {profile.columns?.map(c => <Select.Option key={c.name} value={c.name}>{c.name}</Select.Option>)}
                            </Select>
                          </Col>
                          <Col span={8}>
                            <Text strong style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t('pipeline.targetIdColumn')}</Text>
                            <Select style={{ width: '100%' }} placeholder={t('pipeline.targetIdColumn')} value={relTargetIdCol || undefined} onChange={setRelTargetIdCol}>
                              {profile.columns?.map(c => <Select.Option key={c.name} value={c.name}>{c.name}</Select.Option>)}
                            </Select>
                          </Col>
                          <Col span={8}>
                            <Text strong style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t('pipeline.propertyColumns')}</Text>
                            <Select mode="multiple" style={{ width: '100%' }} placeholder={t('pipeline.propertyColumns')} value={relPropertyCols} onChange={setRelPropertyCols}>
                              {profile.columns?.filter(c => c.name !== relSourceIdCol && c.name !== relTargetIdCol).map(c => <Select.Option key={c.name} value={c.name}>{c.name}</Select.Option>)}
                            </Select>
                          </Col>
                        </Row>
                      </>
                    )}
                  </Space>
                </Card>
              )}
            </>
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
              <Button type="primary" icon={<EyeOutlined />} onClick={csvImportType === 'relationship' && sourceMode === 'custom' ? handleCreateRelationshipPlan : handleCreatePlan} loading={loading}>
                {t('pipeline.generatePlan')}
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* ── Step 3: Candidate Preview ─────────────────────────────── */}
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
            {importPlan.submitted_to_review && importPlan.review_batch_id ? (
              <Alert
                type="success"
                showIcon
                message={t('pipeline.alreadySubmitted')}
                description={
                  <span>
                    {t('pipeline.batchId')}: <Text code>{importPlan.review_batch_id}</Text>
                    {' '}
                    <Button type="link" size="small" onClick={() => navigate(`/review?batch_id=${importPlan.review_batch_id}`)}>
                      {t('pipeline.goToReview')} <RightOutlined />
                    </Button>
                  </span>
                }
              />
            ) : importPlan.summary?.validation_errors > 0 ? (
              <Alert type="warning" showIcon message={t('pipeline.cannotSubmit')} />
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleSubmitToReview()}
                loading={loading}
              >
                {t('pipeline.submitToReview')}
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* ── Recent Import Plans ───────────────────────────────────── */}
      <Card
        title={<><HistoryOutlined /> {t('pipeline.recentPlans')}</>}
        size="small"
      >
        {recentPlans.length > 0 ? (
          <Table
            dataSource={recentPlans}
            columns={recentPlanColumns}
            rowKey="plan_id"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        ) : (
          <Text type="secondary">{t('pipeline.noPlans')}</Text>
        )}
      </Card>
    </Space>
  );
}
