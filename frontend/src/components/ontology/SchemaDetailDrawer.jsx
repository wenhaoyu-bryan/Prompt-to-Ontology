import { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Drawer, Form, Input, Popconfirm, Select, Space, Switch, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../../providers/dataProvider';

const { Text } = Typography;

const CATEGORY_LABELS = {
  objectTypes: ['Object type', '对象类型'],
  linkTypes: ['Relationship type', '关系类型'],
  rules: ['Rule', '规则'],
  actionTypes: ['Action', '动作'],
  metrics: ['Metric', '指标'],
};

function jsonValidator(label) {
  return async (_, value) => {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || (label !== 'condition' && !Array.isArray(parsed)) || (label === 'condition' && Array.isArray(parsed))) {
        throw new Error('shape');
      }
    } catch {
      throw new Error(label === 'condition' ? 'Enter a JSON object' : 'Enter a JSON array');
    }
  };
}

function formValues(category, definition) {
  if (category === 'rules') return { ...definition, condition_json: JSON.stringify(definition.condition, null, 2) };
  if (category === 'actionTypes') return {
    ...definition,
    inputs_json: JSON.stringify(definition.inputs, null, 2),
    result_fields_json: JSON.stringify(definition.result_fields, null, 2),
  };
  return { ...definition };
}

function renderValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    if (value.every(item => typeof item === 'string')) return <Space size={[4, 4]} wrap>{value.map(item => <Tag key={item}>{item}</Tag>)}</Space>;
    return <pre className="schema-detail-json">{JSON.stringify(value, null, 2)}</pre>;
  }
  if (value && typeof value === 'object') return <pre className="schema-detail-json">{JSON.stringify(value, null, 2)}</pre>;
  return value || '—';
}

export default function SchemaDetailDrawer({ asset, schema, explanation, onClose, onSaved, onDiscarded }) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.language === 'zh';
  const tr = (en, zh) => isZh ? zh : en;
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const category = asset?.category;
  const name = asset?.name;
  const original = category && name ? schema?.[category]?.[name] : null;
  const draft = category && name ? schema?.drafts?.[category]?.[name] : null;
  const definition = draft || original;
  const objectTypeOptions = Object.keys(schema?.objectTypes || {}).map(value => ({ value, label: value }));

  useEffect(() => {
    setEditing(false);
    form.resetFields();
    if (definition && category) form.setFieldsValue(formValues(category, definition));
  }, [category, name, definition, form]);

  const saveDraft = async () => {
    if (!definition) return;
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    let updated = { ...definition };
    if (category === 'objectTypes') updated = { ...updated, description: values.description, properties: values.properties };
    if (category === 'linkTypes') updated = { ...updated, description: values.description, from: values.from, to: values.to };
    if (category === 'rules') updated = { ...updated, name: values.name, severity: values.severity, explanation: values.explanation, condition: JSON.parse(values.condition_json) };
    if (category === 'actionTypes') updated = {
      ...updated, description: values.description, applicable_object_type: values.applicable_object_type,
      preconditions: values.preconditions, inputs: JSON.parse(values.inputs_json), result_fields: JSON.parse(values.result_fields_json),
      executor: values.executor, side_effect: values.side_effect, approval_required: values.approval_required,
    };
    if (category === 'metrics') updated = {
      ...updated, description: values.description, object_type: values.object_type, aggregation: values.aggregation,
      group_by: values.group_by, source_field: values.source_field, source_asset: values.source_asset,
      grain: values.grain, unit: values.unit, freshness: values.freshness,
    };

    setSaving(true);
    try {
      await api.put(`/ontology/pet_food/drafts/${category}/${encodeURIComponent(name)}`, { definition: updated });
      onSaved(category, name, updated);
      setEditing(false);
      message.success(tr('Draft saved', '草稿已保存'));
    } catch (error) {
      message.error(String(error.response?.data?.detail || tr('Could not save draft', '无法保存草稿')));
    } finally {
      setSaving(false);
    }
  };

  const discardDraft = async () => {
    setSaving(true);
    try {
      await api.delete(`/ontology/pet_food/drafts/${category}/${encodeURIComponent(name)}`);
      onDiscarded(category, name);
      message.success(tr('Draft discarded', '草稿已撤销'));
    } catch {
      message.error(tr('Could not discard draft', '无法撤销草稿'));
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    form.resetFields();
    if (definition && category) form.setFieldsValue(formValues(category, definition));
    setEditing(false);
  };

  const label = (en, zh) => tr(en, zh);
  const required = [{ required: true, message: tr('Required', '必填') }];
  const fields = category === 'objectTypes' ? [
    ['description', label('Description', '说明')], ['properties', label('Properties', '属性')],
  ] : category === 'linkTypes' ? [
    ['description', label('Description', '说明')], ['from', label('Source object', '来源对象')], ['to', label('Target object', '目标对象')],
  ] : category === 'rules' ? [
    ['rule_id', label('Rule ID', '规则 ID')], ['name', label('Name', '名称')], ['severity', label('Severity', '严重程度')],
    ['explanation', label('Explanation', '说明')], ['condition', label('Condition', '条件')],
  ] : category === 'actionTypes' ? [
    ['description', label('Description', '说明')], ['applicable_object_type', label('Object type', '对象类型')],
    ['preconditions', label('Preconditions', '前置条件')], ['inputs', label('Inputs', '输入')],
    ['result_fields', label('Result fields', '结果字段')], ['executor', label('Executor', '执行器')],
    ['side_effect', label('Side effect', '副作用')], ['approval_required', label('Approval required', '需要审批')],
  ] : [
    ['description', label('Description', '说明')], ['object_type', label('Object type', '对象类型')],
    ['aggregation', label('Aggregation', '聚合方式')], ['group_by', label('Dimensions', '维度')],
    ['source_field', label('Source field', '来源字段')], ['source_asset', label('Source asset', '来源资产')],
    ['grain', label('Grain', '粒度')], ['unit', label('Unit', '单位')], ['freshness', label('Freshness', '时效')],
  ];

  const inputFor = (field) => {
    if (field === 'description' || field === 'explanation') return <Input.TextArea rows={3} />;
    if (field === 'properties' || field === 'group_by' || field === 'preconditions') return <Select mode="tags" tokenSeparators={[',']} placeholder={tr('Type and press Enter', '输入后按回车')} />;
    if (['from', 'to', 'applicable_object_type', 'object_type'].includes(field)) return <Select options={objectTypeOptions} />;
    if (field === 'severity') return <Select options={['critical', 'high', 'medium', 'low', 'info'].map(value => ({ value, label: value }))} />;
    if (field === 'aggregation') return <Select options={['count', 'sum', 'avg', 'min', 'max'].map(value => ({ value, label: value }))} />;
    if (field === 'side_effect') return <Select options={['read_only', 'external_write'].map(value => ({ value, label: value }))} />;
    if (field === 'approval_required') return <Switch />;
    return <Input />;
  };

  return <Drawer
    open={!!asset}
    forceRender
    onClose={onClose}
    size="min(720px, 100vw)"
    title={<Space wrap><span>{category === 'rules' ? definition?.name || name : name}</span>{draft && <Tag color="gold">{tr('Local draft', '本地草稿')}</Tag>}</Space>}
    extra={<Text type="secondary">{CATEGORY_LABELS[category]?.[isZh ? 1 : 0]}</Text>}
    footer={<div className="schema-detail-footer">
      <Button onClick={editing ? cancelEditing : onClose}>{editing ? tr('Cancel', '取消') : tr('Close', '关闭')}</Button>
      <Space wrap>
        {!editing && <Button onClick={() => navigate(`/verified-qa?asset=${encodeURIComponent(name || '')}`)}>{tr('Validate related questions', '验证相关问题')}</Button>}
        {draft && !editing && <Popconfirm title={tr('Discard this local draft?', '撤销此本地草稿？')} onConfirm={discardDraft}>
          <Button danger loading={saving}>{tr('Discard draft', '撤销草稿')}</Button>
        </Popconfirm>}
        <Button type="primary" loading={saving} onClick={editing ? saveDraft : () => setEditing(true)}>
          {editing ? tr('Save draft', '保存草稿') : tr('Edit draft', '编辑草稿')}
        </Button>
      </Space>
    </div>}
  >
    <Alert
      type={draft ? 'warning' : 'info'}
      showIcon
      title={draft ? tr('You are viewing a local draft', '当前查看本地草稿') : tr('Checked-in definition', '仓库中的定义')}
      description={tr('Draft edits are stored for review. They do not change ontology YAML, graph data, or the fixed Verified Questions evaluation.', '编辑内容会保存为待审核草稿，不会修改仓库 YAML、图谱数据或固定问题集的评估结果。')}
      style={{ marginBottom: 20 }}
    />
    {!editing && explanation && <Alert type="info" showIcon title={tr('Why this definition exists', '为什么这样定义')} description={explanation[isZh ? 'zh' : 'en']} style={{ marginBottom: 20 }} />}
    <Form form={form} layout="vertical" className="schema-detail-form" style={{ display: editing ? 'block' : 'none' }}>
      {fields.filter(([field]) => field !== 'rule_id').map(([field, title]) => {
        const jsonField = field === 'condition' || field === 'inputs' || field === 'result_fields';
        const formName = jsonField ? `${field}_json` : field;
        return <Form.Item
          key={field}
          name={formName}
          label={title}
          valuePropName={field === 'approval_required' ? 'checked' : 'value'}
          rules={jsonField ? [{ validator: jsonValidator(field) }] : (field === 'approval_required' ? [] : required)}
        >
          {jsonField ? <Input.TextArea rows={field === 'condition' ? 7 : 5} className="schema-detail-json-input" /> : inputFor(field)}
        </Form.Item>;
      })}
    </Form>
    {!editing && <Descriptions bordered column={1} size="small" items={fields.map(([field, title]) => ({
      key: field, label: title, children: renderValue(definition?.[field]),
    }))} />}
  </Drawer>;
}
