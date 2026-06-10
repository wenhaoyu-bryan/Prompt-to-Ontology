import { useState } from 'react';
import { Card, Button, Space, Typography, Tag, Steps, Table, Select, Spin, Alert, Descriptions, Row, Col, Statistic, message } from 'antd';
import {
  DatabaseOutlined,
  FileSearchOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  RightOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
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

export default function PipelinePage() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [samples, setSamples] = useState([]);
  const [selectedSample, setSelectedSample] = useState('');
  const [profile, setProfile] = useState(null);
  const [mappings, setMappings] = useState(null);
  const [importPlan, setImportPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadSamples = async () => {
    try {
      const { data } = await api.get('/pipeline/samples');
      setSamples(data.samples || []);
    } catch {
      setSamples([]);
    }
  };

  const handleProfile = async () => {
    if (!selectedSample) { message.warning(t('pipeline.selectSample')); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/pipeline/profile/sample', { sample_name: selectedSample });
      setProfile(data);
      setStep(1);
    } catch (e) {
      message.error(t('pipeline.profileFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestMappings = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data } = await api.post('/pipeline/mappings/suggest', { source_id: profile.source_id, domain: 'pet_food' });
      setMappings(data);
      setStep(2);
    } catch {
      message.error(t('pipeline.mappingFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data } = await api.post('/pipeline/import-plan', { source_id: profile.source_id, domain: 'pet_food' });
      setImportPlan(data);
      setStep(3);
    } catch {
      message.error(t('pipeline.planFailed'));
    } finally {
      setLoading(false);
    }
  };

  const stepItems = [
    { title: t('pipeline.stepSource'), icon: <DatabaseOutlined /> },
    { title: t('pipeline.stepProfile'), icon: <FileSearchOutlined /> },
    { title: t('pipeline.stepMapping'), icon: <SwapOutlined /> },
    { title: t('pipeline.stepPlan'), icon: <ImportOutlined /> },
  ];

  const profileColumns = [
    { title: t('pipeline.columnName'), dataIndex: 'name', key: 'name', render: v => <Text code>{v}</Text> },
    { title: t('pipeline.inferredType'), dataIndex: 'inferred_type', key: 'type', render: v => <Tag>{v}</Tag> },
    { title: t('pipeline.nullRate'), dataIndex: 'null_rate', key: 'null', render: v => `${(v * 100).toFixed(1)}%` },
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

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>{t('pipeline.title')}</Title>
        <Text type="secondary">{t('pipeline.subtitle')}</Text>
      </div>

      <Steps current={step} items={stepItems} size="small" />

      {/* Step 0: Select Data Source */}
      {step === 0 && (
        <Card title={<><DatabaseOutlined /> {t('pipeline.stepSource')}</>}>
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <div>
              <Text>{t('pipeline.selectSampleLabel')}</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                placeholder={t('pipeline.selectSample')}
                value={selectedSample || undefined}
                onChange={v => { setSelectedSample(v); loadSamples(); }}
                onFocus={loadSamples}
                options={samples.map(s => ({ label: s.name, value: s.name }))}
              />
            </div>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleProfile} loading={loading} disabled={!selectedSample}>
              {t('pipeline.profileButton')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Step 1: Data Profile */}
      {step >= 1 && profile && (
        <Card title={<><FileSearchOutlined /> {t('pipeline.stepProfile')} — {profile.source_name}</>}
          extra={<Button size="small" onClick={() => { setStep(0); setProfile(null); setMappings(null); setImportPlan(null); }}>{t('common.back')}</Button>}
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={16}>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.rowCount')} value={profile.row_count} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.columnCount')} value={profile.column_count} /></Card></Col>
            </Row>
            <Table dataSource={profile.columns} columns={profileColumns} rowKey="name" size="small" pagination={false} />
            {step === 1 && (
              <Button type="primary" icon={<SwapOutlined />} onClick={handleSuggestMappings} loading={loading}>
                {t('pipeline.suggestMappings')}
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* Step 2: Mapping Suggestions */}
      {step >= 2 && mappings && (
        <Card title={<><SwapOutlined /> {t('pipeline.stepMapping')}</>}
          extra={<Button size="small" onClick={() => setStep(1)}>{t('common.back')}</Button>}
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {mappings.object_mappings?.length > 0 && (
              <div>
                <Text strong>{t('pipeline.objectMappings')}:</Text>
                <div style={{ marginTop: 8 }}>
                  {mappings.object_mappings.map((m, i) => (
                    <Tag key={i} color="blue" style={{ margin: 2 }}>{m.object_type} ({m.field_mappings?.length} fields)</Tag>
                  ))}
                </div>
              </div>
            )}
            <Table
              dataSource={mappings.field_suggestions}
              columns={mappingColumns}
              rowKey="source_column"
              size="small"
              pagination={false}
            />
            {step === 2 && (
              <Button type="primary" icon={<ImportOutlined />} onClick={handleCreatePlan} loading={loading}>
                {t('pipeline.createPlan')}
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* Step 3: Import Plan */}
      {step >= 3 && importPlan && (
        <Card title={<><ImportOutlined /> {t('pipeline.stepPlan')} — {importPlan.plan_id}</>}
          extra={<Tag color={STATUS_COLORS[importPlan.status]}>{importPlan.status}</Tag>}
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={16}>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.newObjects')} value={importPlan.summary?.new_objects || 0} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.newLinks')} value={importPlan.summary?.new_links || 0} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.valErrors')} value={importPlan.summary?.validation_errors || 0} valueStyle={{ color: importPlan.summary?.validation_errors > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title={t('pipeline.avgConfidence')} value={`${((importPlan.summary?.confidence_avg || 0) * 100).toFixed(1)}%`} /></Card></Col>
            </Row>

            {importPlan.validation_issues?.length > 0 && (
              <Card size="small" title={t('pipeline.validationIssues')}>
                <Table
                  dataSource={importPlan.validation_issues}
                  rowKey={(_, i) => i}
                  size="small"
                  pagination={{ pageSize: 5 }}
                  columns={[
                    { title: t('common.level'), dataIndex: 'level', key: 'level', width: 80, render: v => <Tag color={v === 'error' ? 'red' : v === 'warning' ? 'orange' : 'default'}>{v}</Tag> },
                    { title: 'Code', dataIndex: 'code', key: 'code', width: 200 },
                    { title: t('common.description'), dataIndex: 'message', key: 'msg', ellipsis: true },
                  ]}
                />
              </Card>
            )}

            <Alert
              type="info"
              showIcon
              message={t('pipeline.importNote')}
            />
          </Space>
        </Card>
      )}
    </Space>
  );
}
