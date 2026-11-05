import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "../../providers/dataProvider";
import "./ontologyDesign.css";

const { Text } = Typography;
const TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "enum",
  "list",
  "object",
  "date",
  "datetime",
];
const CARDINALITIES = [
  "ONE_TO_ONE",
  "ONE_TO_MANY",
  "MANY_TO_ONE",
  "MANY_TO_MANY",
];
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

const emptyProperty = () => ({
  name: "",
  type: "string",
  required: false,
  description: "",
  enum_values: [],
  default: null,
  unit: "",
  source_field: "",
  source_bindings: [],
});

function initialDefinition(asset, catalog) {
  if (asset?.definition) return structuredClone(asset.definition);
  const definition =
    catalog?.[
      asset?.category === "objectTypes" ? "object_types" : "link_types"
    ]?.[asset?.name];
  if (definition) return structuredClone(definition);
  const common = {
    name: "",
    label: "",
    description: "",
    source_bindings: [],
    metadata: {},
  };
  return asset?.category === "objectTypes"
    ? {
        ...common,
        primary_key: "id",
        display_name: "id",
        required_properties: ["id"],
        properties: [{ ...emptyProperty(), name: "id", required: true }],
      }
    : {
        ...common,
        source_type: "",
        target_type: "",
        cardinality: "MANY_TO_MANY",
        direction: "outgoing",
        required: false,
        properties: [],
      };
}

function SourceBindings({ bindings, field, tr }) {
  if (!bindings?.length)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={tr("No source binding recorded", "尚未记录来源映射")}
      />
    );
  return (
    <div className="od-source-list">
      {bindings.map((binding, index) => (
        <section className="od-source-entry" key={binding.id || index}>
          <Space wrap>
            <strong>
              {binding.source_name || tr("Manual definition", "手动定义")}
            </strong>
            <Tag>{binding.kind || "manual"}</Tag>
            <Text type="secondary">
              {binding.status === "imported"
                ? tr("Imported mapping", "导入映射")
                : tr("Manual reference", "手动参考")}
            </Text>
          </Space>
          {(binding.source_field || field) && (
            <p>
              <code>
                {[binding.table, binding.source_field || field]
                  .filter(Boolean)
                  .join(".")}
              </code>
            </p>
          )}
          {binding.start_line && (
            <p>
              {tr("Lines", "行")} {binding.start_line}
              {binding.end_line !== binding.start_line
                ? `–${binding.end_line}`
                : ""}
            </p>
          )}
          {binding.quote && <blockquote>{binding.quote}</blockquote>}
          {binding.details?.sql_type && (
            <Descriptions
              column={1}
              size="small"
              items={[
                {
                  key: "sql_type",
                  label: tr("Declared type", "来源类型"),
                  children: <code>{binding.details.sql_type}</code>,
                },
                {
                  key: "required",
                  label: tr("Required at source", "来源必填"),
                  children: binding.details.required
                    ? tr("Yes", "是")
                    : tr("No", "否"),
                },
                ...(binding.details.comment
                  ? [
                      {
                        key: "comment",
                        label: tr("Source comment", "来源注释"),
                        children: binding.details.comment,
                      },
                    ]
                  : []),
              ]}
            />
          )}
          {binding.content_hash && (
            <details>
              <summary>{tr("Source fingerprint", "来源指纹")}</summary>
              <code>{binding.content_hash}</code>
            </details>
          )}
          {binding.design_id && (
            <a
              href={`/pipeline?mode=schema&design=${encodeURIComponent(binding.design_id)}`}
            >
              {tr("Open build source", "打开构建来源")}
            </a>
          )}
        </section>
      ))}
    </div>
  );
}

export default function DesignDefinitionDrawer({
  asset,
  catalog,
  onClose,
  onSaved,
  onReload,
  tr,
}) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [tab, setTab] = useState("definition");
  const [sourceProperty, setSourceProperty] = useState(null);
  const properties = Form.useWatch("properties", form) || [];
  const object = asset?.category === "objectTypes";
  const definition = initialDefinition(asset, catalog);
  const isNew = !asset?.name;
  const title = isNew
    ? object
      ? tr("New object", "新建对象")
      : tr("New relationship", "新建关系")
    : definition.label || asset.name;

  useEffect(() => {
    if (!asset) return;
    form.resetFields();
    form.setFieldsValue(initialDefinition(asset, catalog));
    setEditing(!asset.name || !!asset.definition);
    setError("");
    setStale(false);
    setTab("definition");
    setSourceProperty(null);
  }, [
    asset?.category,
    asset?.name,
    asset?.definition,
    catalog?.revision,
    form,
  ]);

  const propertyOptions = properties
    .filter((prop) => prop?.name)
    .map((prop) => ({ value: prop.name, label: prop.name }));
  const objectOptions = Object.keys(catalog?.object_types || {}).map(
    (name) => ({ value: name, label: name }),
  );
  const identifierRules = [
    { required: true, message: tr("Enter a name", "请输入名称") },
    {
      pattern: IDENTIFIER,
      message: tr(
        "Start with a letter; use letters, numbers or underscores (up to 64 characters).",
        "以字母开头，使用字母、数字或下划线，最多 64 个字符。",
      ),
    },
  ];
  const required = [{ required: true, message: tr("Required", "必填") }];

  const save = async () => {
    let values;
    try {
      await form.validateFields();
      values = form.getFieldsValue(true);
    } catch {
      return;
    }
    if (
      isNew &&
      catalog[object ? "object_types" : "link_types"]?.[values.name]
    ) {
      setError(
        tr(
          "A definition with this technical name already exists. Open it from the list to edit.",
          "该技术名称已存在，请从列表打开已有定义进行编辑。",
        ),
      );
      return;
    }
    const names = values.properties.map((prop) => prop.name);
    if (new Set(names).size !== names.length) {
      setError(
        tr("Each property needs a different name.", "属性名称不能重复。"),
      );
      return;
    }
    if (object) {
      const key = values.properties.find(
        (prop) => prop.name === values.primary_key,
      );
      if (!key || key.type !== "string" || !key.required) {
        setError(
          tr(
            "The primary key must be a required string property.",
            "主键必须是必填的字符串属性。",
          ),
        );
        return;
      }
    }
    const updated = {
      ...definition,
      ...values,
      properties: values.properties.map((prop) => ({
        ...prop,
        enum_values: prop.type === "enum" ? prop.enum_values || [] : [],
      })),
    };
    if (object)
      updated.required_properties = updated.properties
        .filter((prop) => prop.required)
        .map((prop) => prop.name);
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/ontology/pet_food/design/definitions", {
        expected_revision: catalog.revision,
        create_only: isNew,
        object_types: object ? [updated] : [],
        link_types: object ? [] : [updated],
      });
      onSaved(data, asset.category, updated.name);
      setEditing(false);
      message.success(tr("Definition saved", "定义已保存"));
    } catch (cause) {
      const conflict = cause.response?.status === 409;
      setStale(conflict);
      const detail = cause.response?.data?.detail;
      setError(
        conflict
          ? tr(
              "The design changed. Reload the design before saving.",
              "设计已被更新，请重新加载后再保存。",
            )
          : typeof detail === "string"
            ? detail
            : tr("Check the definition and try again.", "请检查定义后重试。"),
      );
    } finally {
      setSaving(false);
    }
  };

  const viewSource = (index) => {
    setSourceProperty(index);
    setTab("sources");
  };
  const sourceDefinition =
    sourceProperty == null
      ? definition
      : (editing ? properties : definition.properties)?.[sourceProperty];
  const sourceCount =
    (definition.source_bindings?.length || 0) +
    (definition.properties || []).reduce(
      (n, prop) => n + (prop.source_bindings?.length || 0),
      0,
    );

  const renderPropertyEditor = () => (
    <Form.List name="properties">
      {(fields, { add, remove }) => (
        <div>
          <div className="od-section-heading">
            <h4>{tr("Properties", "属性")}</h4>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => add(emptyProperty())}
            >
              {tr("Add property", "添加属性")}
            </Button>
          </div>
          {fields.map(({ key, name, ...rest }, index) => {
            const prop = properties[name] || {};
            return (
              <section className="od-property-editor" key={key}>
                <div className="od-property-main">
                  <Form.Item
                    {...rest}
                    name={[name, "name"]}
                    label={tr("Name", "名称")}
                    rules={identifierRules}
                  >
                    <Input
                      aria-label={`${tr("Property", "属性")} ${index + 1} ${tr("name", "名称")}`}
                    />
                  </Form.Item>
                  <Form.Item
                    {...rest}
                    name={[name, "type"]}
                    label={tr("Type", "类型")}
                    rules={required}
                  >
                    <Select
                      aria-label={`${tr("Property", "属性")} ${index + 1} ${tr("type", "类型")}`}
                      options={TYPES.map((type) => ({
                        value: type,
                        label: type,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    {...rest}
                    name={[name, "required"]}
                    valuePropName="checked"
                    className="od-required"
                  >
                    <Checkbox
                      aria-label={`${tr("Property", "属性")} ${index + 1} ${tr("required", "必填")}`}
                    >
                      {tr("Required", "必填")}
                    </Checkbox>
                  </Form.Item>
                  <Button
                    type="text"
                    icon={<DeleteOutlined />}
                    aria-label={`${tr("Remove property", "移除属性")} ${index + 1}`}
                    onClick={() => remove(name)}
                  />
                </div>
                <div className="od-property-extra">
                  <Form.Item
                    {...rest}
                    name={[name, "description"]}
                    label={tr("Description", "说明")}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    {...rest}
                    name={[name, "unit"]}
                    label={tr("Unit", "单位")}
                  >
                    <Input />
                  </Form.Item>
                </div>
                {prop.type === "enum" && (
                  <Form.Item
                    {...rest}
                    name={[name, "enum_values"]}
                    label={tr("Allowed values", "枚举值")}
                    rules={[
                      {
                        type: "array",
                        required: true,
                        min: 1,
                        message: tr(
                          "Add at least one value",
                          "请至少添加一个值",
                        ),
                      },
                    ]}
                  >
                    <Select mode="tags" tokenSeparators={[","]} />
                  </Form.Item>
                )}
                <Form.Item
                  {...rest}
                  name={[name, "source_field"]}
                  label={tr("Source field reference", "来源字段参考")}
                >
                  <Input
                    placeholder={tr(
                      "Optional manual reference",
                      "可填写手动参考",
                    )}
                  />
                </Form.Item>
                {prop.source_bindings?.length > 0 && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => viewSource(name)}
                  >
                    {tr("View recorded source", "查看已记录来源")}
                  </Button>
                )}
              </section>
            );
          })}
          {!fields.length && (
            <p className="od-muted">
              {tr(
                "Add properties when the relationship carries its own facts.",
                "关系具有自己的字段时，可添加属性。",
              )}
            </p>
          )}
        </div>
      )}
    </Form.List>
  );

  const formContent = (
    <Form
      name="ontology-definition"
      form={form}
      layout="vertical"
      preserve
      className="od-definition-form"
      style={{ display: editing ? "block" : "none" }}
    >
      <div className="od-two-columns">
        <Form.Item
          name="name"
          label={tr("Technical name", "技术名称")}
          rules={identifierRules}
        >
          <Input
            aria-label={tr("Technical name", "技术名称")}
            disabled={!isNew}
          />
        </Form.Item>
        <Form.Item name="label" label={tr("Display label", "显示名称")}>
          <Input aria-label={tr("Display label", "显示名称")} />
        </Form.Item>
      </div>
      <Form.Item name="description" label={tr("Description", "说明")}>
        <Input.TextArea aria-label={tr("Description", "说明")} rows={3} />
      </Form.Item>
      {object ? (
        <div className="od-two-columns">
          <Form.Item
            name="primary_key"
            label={tr("Primary key", "主键")}
            rules={required}
          >
            <Select
              aria-label={tr("Primary key", "主键")}
              options={propertyOptions}
            />
          </Form.Item>
          <Form.Item
            name="display_name"
            label={tr("Display field", "展示字段")}
          >
            <Select
              aria-label={tr("Display field", "展示字段")}
              options={propertyOptions}
            />
          </Form.Item>
        </div>
      ) : (
        <>
          <div className="od-two-columns">
            <Form.Item
              name="source_type"
              label={tr("Source object", "来源对象")}
              rules={required}
            >
              <Select
                aria-label={tr("Source object", "来源对象")}
                options={objectOptions}
              />
            </Form.Item>
            <Form.Item
              name="target_type"
              label={tr("Target object", "目标对象")}
              rules={required}
            >
              <Select
                aria-label={tr("Target object", "目标对象")}
                options={objectOptions}
              />
            </Form.Item>
            <Form.Item
              name="cardinality"
              label={tr("Cardinality", "基数")}
              rules={required}
            >
              <Select
                aria-label={tr("Cardinality", "基数")}
                options={CARDINALITIES.map((value) => ({
                  value,
                  label: value.replaceAll("_", " "),
                }))}
              />
            </Form.Item>
            <Form.Item
              name="direction"
              label={tr("Direction", "方向")}
              rules={required}
            >
              <Select
                aria-label={tr("Direction", "方向")}
                options={["outgoing", "incoming", "bidirectional"].map(
                  (value) => ({ value, label: value }),
                )}
              />
            </Form.Item>
          </div>
          <Form.Item name="required" valuePropName="checked">
            <Checkbox>{tr("Relationship required", "必需关系")}</Checkbox>
          </Form.Item>
        </>
      )}
      {renderPropertyEditor()}
    </Form>
  );

  return (
    <Drawer
      open={!!asset}
      title={title}
      size="min(900px, 100vw)"
      onClose={onClose}
      className="ontology-design-drawer"
      footer={
        <div className="od-drawer-footer">
          <Button
            disabled={saving}
            onClick={
              editing && !isNew
                ? () => {
                    form.setFieldsValue(definition);
                    setEditing(false);
                    setError("");
                  }
                : onClose
            }
          >
            {editing ? tr("Cancel", "取消") : tr("Close", "关闭")}
          </Button>
          <Button
            type="primary"
            loading={saving}
            disabled={stale}
            onClick={editing ? save : () => setEditing(true)}
          >
            {editing
              ? tr("Save definition", "保存定义")
              : tr("Edit definition", "编辑定义")}
          </Button>
        </div>
      }
    >
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            stale && (
              <Button size="small" onClick={onReload}>
                {tr("Reload design", "重新加载设计")}
              </Button>
            )
          }
          className="od-error"
        />
      )}
      {asset?.definition && (
        <Alert
          type="info"
          showIcon
          title={tr("Review existing local draft", "检查已有本地草稿")}
          description={tr(
            "Check the typed fields before saving this definition.",
            "保存前请检查属性类型与结构。 ",
          )}
          className="od-error"
        />
      )}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "definition",
            label: tr("Definition", "定义"),
            children: (
              <>
                {formContent}
                {!editing && (
                  <>
                    <Descriptions
                      column={1}
                      bordered
                      size="small"
                      items={[
                        {
                          key: "name",
                          label: tr("Technical name", "技术名称"),
                          children: <code>{definition.name}</code>,
                        },
                        {
                          key: "description",
                          label: tr("Description", "说明"),
                          children: definition.description || "—",
                        },
                        ...(object
                          ? [
                              {
                                key: "primary_key",
                                label: tr("Primary key", "主键"),
                                children: definition.primary_key,
                              },
                              {
                                key: "display_name",
                                label: tr("Display field", "展示字段"),
                                children: definition.display_name,
                              },
                            ]
                          : [
                              {
                                key: "source",
                                label: tr("Source object", "来源对象"),
                                children: definition.source_type,
                              },
                              {
                                key: "target",
                                label: tr("Target object", "目标对象"),
                                children: definition.target_type,
                              },
                              {
                                key: "cardinality",
                                label: tr("Cardinality", "基数"),
                                children: definition.cardinality,
                              },
                              {
                                key: "direction",
                                label: tr("Direction", "方向"),
                                children: definition.direction,
                              },
                            ]),
                      ]}
                    />
                    <h4 className="od-properties-title">
                      {tr("Properties", "属性")}
                    </h4>
                    <Table
                      size="small"
                      rowKey="name"
                      pagination={false}
                      scroll={{ x: "max-content" }}
                      dataSource={definition.properties || []}
                      columns={[
                        {
                          title: tr("Property", "属性"),
                          dataIndex: "name",
                          render: (name) => <code>{name}</code>,
                        },
                        { title: tr("Type", "类型"), dataIndex: "type" },
                        {
                          title: tr("Required", "必填"),
                          dataIndex: "required",
                          render: (value) => (value ? tr("Yes", "是") : "—"),
                        },
                        {
                          title: tr("Unit", "单位"),
                          dataIndex: "unit",
                          render: (value) => value || "—",
                        },
                        {
                          title: tr("Allowed values", "枚举值"),
                          dataIndex: "enum_values",
                          render: (values) =>
                            values?.length ? values.join(", ") : "—",
                        },
                        {
                          title: tr("Description", "说明"),
                          dataIndex: "description",
                        },
                        {
                          title: tr("Source", "来源"),
                          key: "source",
                          render: (_, prop, index) => (
                            <Button
                              type="link"
                              size="small"
                              aria-label={`${tr("View source for", "查看来源")} ${prop.name}`}
                              onClick={() => viewSource(index)}
                            >
                              {tr("View source", "查看来源")}
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </>
                )}
              </>
            ),
          },
          {
            key: "sources",
            label: `${tr("Sources", "来源")} (${sourceCount})`,
            children: (
              <>
                <Select
                  aria-label={tr("Source scope", "来源范围")}
                  value={sourceProperty == null ? "definition" : sourceProperty}
                  onChange={(value) =>
                    setSourceProperty(value === "definition" ? null : value)
                  }
                  style={{ width: "100%", marginBottom: 20 }}
                  options={[
                    {
                      value: "definition",
                      label: tr("Definition sources", "定义来源"),
                    },
                    ...(definition.properties || []).map((prop, index) => ({
                      value: index,
                      label: prop.name,
                    })),
                  ]}
                />
                {sourceDefinition?.source_field && (
                  <p>
                    <Text type="secondary">
                      {tr("Field reference", "字段参考")}
                    </Text>{" "}
                    <code>{sourceDefinition.source_field}</code>
                  </p>
                )}
                <SourceBindings
                  bindings={sourceDefinition?.source_bindings}
                  field={sourceDefinition?.source_field}
                  tr={tr}
                />
              </>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
