import {
  Button,
  Checkbox,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";

const TYPES = [
  "string",
  "integer",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
  "list",
  "object",
];
const CARDINALITIES = [
  "ONE_TO_ONE",
  "ONE_TO_MANY",
  "MANY_TO_ONE",
  "MANY_TO_MANY",
];

export default function SchemaDefinitionDrawer({
  entry,
  category,
  sources,
  objects,
  activeSchema,
  issues,
  onChange,
  onClose,
  tr,
}) {
  if (!entry) return null;
  const object = category === "objects";
  const source = sources.find((s) => s.id === entry.source_id);
  const columns = (source?.columns || []).map((c) => ({
    value: c.name,
    label: c.name,
  }));
  const patch = (value) =>
    onChange({ ...entry, ...value, decision: "pending" });
  const props = entry.properties || [];
  const updateProp = (index, value) =>
    patch({
      properties: props.map((p, i) => (i === index ? { ...p, ...value } : p)),
    });
  const active = object
    ? activeSchema.object_types?.[entry.name]
    : activeSchema.link_types?.[entry.name];
  const useActive = () => {
    if (!active) return;
    if (object) {
      patch({
        intent: "reuse",
        label: active.label || active.name,
        description: active.description || "",
        primary_key: active.primary_key,
        display_name: active.display_name || "",
        properties: active.properties.map((p) => ({
          name: p.name,
          type: p.type,
          required: p.required || false,
          description: p.description || "",
          unit: p.unit || "",
          source_id: entry.source_id,
          source_column: columns.some((c) => c.value === p.name) ? p.name : "",
        })),
      });
    } else {
      patch({
        intent: "reuse",
        label: active.label || active.name,
        description: active.description || "",
        from: active.source_type,
        to: active.target_type,
        cardinality: active.cardinality,
      });
    }
  };
  const field = (label, name, control) => (
    <div className="sd-field">
      <label htmlFor={`sd-${name}`}>{label}</label>
      {control || (
        <Input
          id={`sd-${name}`}
          value={entry[name] || ""}
          maxLength={name === "description" ? 1000 : 120}
          onChange={(e) => patch({ [name]: e.target.value })}
        />
      )}
    </div>
  );
  const endpoints = [
    ...new Set([
      ...objects.filter((o) => o.decision !== "excluded").map((o) => o.name),
      ...Object.keys(activeSchema.object_types || {}),
    ]),
  ]
    .filter(Boolean)
    .map((value) => ({ value, label: value }));
  return (
    <Drawer
      open
      width={860}
      onClose={onClose}
      title={tr(
        object ? "Object definition" : "Relationship definition",
        object ? "对象定义" : "关系定义",
      )}
      destroyOnHidden
      footer={
        <div className="sd-drawer-footer">
          <Space>
            <Button
              onClick={() => onChange({ ...entry, decision: "excluded" })}
            >
              {tr("Exclude", "排除")}
            </Button>
            <Button onClick={onClose}>{tr("Close", "关闭")}</Button>
          </Space>
          <Button
            type="primary"
            onClick={() => {
              onChange({ ...entry, decision: "accepted" });
              onClose();
            }}
          >
            {tr("Confirm definition", "确认定义")}
          </Button>
        </div>
      }
    >
      <div className="sd-drawer-intro">
        <Tag color={entry.decision === "accepted" ? "green" : "orange"}>
          {tr(
            entry.decision === "accepted" ? "Confirmed" : "Needs review",
            entry.decision === "accepted" ? "已确认" : "待确认",
          )}
        </Tag>
        <Typography.Text type="secondary">
          {tr(
            "Edits return this definition to pending review. Source bindings are retained in the export.",
            "编辑后需要重新确认，来源绑定会保留在导出文件中。",
          )}
        </Typography.Text>
      </div>
      <div className="sd-form-grid">
        {field(tr("Type name", "类型名称"), "name")}
        {field(tr("Display label", "显示名称"), "label")}
        {field(tr("Description", "说明"), "description")}
        {field(
          tr("Change intent", "变更方式"),
          "intent",
          <Select
            id="sd-intent"
            value={entry.intent}
            onChange={(intent) => patch({ intent })}
            options={[
              {
                value: "new",
                label: tr("Create a new definition", "新增定义"),
              },
              ...(object
                ? [
                    {
                      value: "extend",
                      label: tr("Extend existing properties", "扩展已有属性"),
                    },
                  ]
                : []),
              {
                value: "reuse",
                label: tr("Reuse existing definition", "复用已有定义"),
              },
            ]}
          />,
        )}
      </div>
      {active && (
        <div className="sd-active-notice">
          <Typography.Text>
            {tr(
              "An active definition has this name. Reuse it or review an additive extension.",
              "已有同名生效定义。可复用原定义，或检查属性扩展。",
            )}
          </Typography.Text>
          <Button size="small" onClick={useActive}>
            {tr("Use active definition", "使用当前定义")}
          </Button>
        </div>
      )}
      <h4>{tr("Source binding", "来源绑定")}</h4>
      <div className="sd-form-grid">
        {field(
          tr("Source file", "来源文件"),
          "source_id",
          <Select
            id="sd-source_id"
            value={entry.source_id || undefined}
            allowClear
            onChange={(source_id) => patch({ source_id: source_id || "" })}
            options={sources.map((s) => ({ value: s.id, label: s.name }))}
          />,
        )}
        {object
          ? field(
              tr("Primary key", "主键"),
              "primary_key",
              <Select
                id="sd-primary_key"
                value={entry.primary_key || undefined}
                allowClear
                onChange={(primary_key) =>
                  patch({ primary_key: primary_key || "" })
                }
                options={props
                  .filter((p) => p.name)
                  .map((p) => ({ value: p.name, label: p.name }))}
              />,
            )
          : field(
              tr("Cardinality", "基数"),
              "cardinality",
              <Select
                id="sd-cardinality"
                value={entry.cardinality}
                onChange={(cardinality) => patch({ cardinality })}
                options={CARDINALITIES.map((value) => ({
                  value,
                  label: value,
                }))}
              />,
            )}
        {object &&
          field(
            tr("Display property", "展示属性"),
            "display_name",
            <Select
              id="sd-display_name"
              value={entry.display_name || undefined}
              allowClear
              onChange={(display_name) =>
                patch({ display_name: display_name || "" })
              }
              options={props
                .filter((p) => p.name)
                .map((p) => ({ value: p.name, label: p.name }))}
            />,
          )}
        {!object && (
          <>
            {field(
              tr("From object", "起点对象"),
              "from",
              <Select
                id="sd-from"
                value={entry.from || undefined}
                onChange={(from) => patch({ from })}
                options={endpoints}
                showSearch
              />,
            )}
            {field(
              tr("To object", "终点对象"),
              "to",
              <Select
                id="sd-to"
                value={entry.to || undefined}
                onChange={(to) => patch({ to })}
                options={endpoints}
                showSearch
              />,
            )}
            {field(
              tr("Source identity column", "起点标识列"),
              "source_column",
              <Select
                id="sd-source_column"
                value={entry.source_column || undefined}
                onChange={(source_column) => patch({ source_column })}
                options={columns}
                allowClear
              />,
            )}
            {field(
              tr("Target identity column", "终点标识列"),
              "target_column",
              <Select
                id="sd-target_column"
                value={entry.target_column || undefined}
                onChange={(target_column) => patch({ target_column })}
                options={columns}
                allowClear
              />,
            )}
          </>
        )}
      </div>
      {object && (
        <>
          <div className="ab-section-heading sd-properties-heading">
            <div>
              <h4>{tr("Properties", "属性")}</h4>
              <Typography.Text type="secondary">
                {tr(
                  "Confirm identifiers, data types and units. A numeric sample does not establish a business unit.",
                  "请确认标识、类型和单位，数值样本不能证明业务单位。",
                )}
              </Typography.Text>
            </div>
            <Button
              icon={<PlusOutlined />}
              onClick={() =>
                patch({
                  properties: [
                    ...props,
                    {
                      name: "",
                      type: "string",
                      required: false,
                      description: "",
                      unit: "",
                      source_id: entry.source_id,
                      source_column: "",
                    },
                  ],
                })
              }
            >
              {tr("Add property", "添加属性")}
            </Button>
          </div>
          <Table
            rowKey={(_, i) => i}
            size="small"
            pagination={false}
            scroll={{ x: 760 }}
            dataSource={props}
            columns={[
              {
                title: tr("Property", "属性"),
                width: 145,
                render: (_, p, i) => (
                  <Input
                    aria-label={`Property name ${i + 1}`}
                    value={p.name}
                    onChange={(e) => updateProp(i, { name: e.target.value })}
                  />
                ),
              },
              {
                title: tr("Type", "类型"),
                width: 115,
                render: (_, p, i) => (
                  <Select
                    aria-label={`Property type ${i + 1}`}
                    value={p.type}
                    onChange={(type) => updateProp(i, { type })}
                    options={TYPES.map((value) => ({ value, label: value }))}
                    style={{ width: "100%" }}
                  />
                ),
              },
              {
                title: tr("Source column", "来源列"),
                width: 160,
                render: (_, p, i) => (
                  <Select
                    aria-label={`Source column ${i + 1}`}
                    value={p.source_column || undefined}
                    allowClear
                    onChange={(source_column) =>
                      updateProp(i, {
                        source_id: entry.source_id,
                        source_column: source_column || "",
                      })
                    }
                    options={columns}
                    style={{ width: "100%" }}
                  />
                ),
              },
              {
                title: tr("Unit", "单位"),
                width: 105,
                render: (_, p, i) => (
                  <Input
                    aria-label={`Unit ${i + 1}`}
                    value={p.unit}
                    onChange={(e) => updateProp(i, { unit: e.target.value })}
                    placeholder="—"
                  />
                ),
              },
              {
                title: tr("Required", "必填"),
                width: 80,
                render: (_, p, i) => (
                  <Checkbox
                    aria-label={`Required ${i + 1}`}
                    checked={p.required}
                    onChange={(e) =>
                      updateProp(i, { required: e.target.checked })
                    }
                  />
                ),
              },
              {
                width: 40,
                render: (_, p, i) => (
                  <Button
                    type="text"
                    danger
                    aria-label={`Remove property ${i + 1}`}
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      patch({ properties: props.filter((_, j) => i !== j) })
                    }
                  />
                ),
              },
            ]}
          />
        </>
      )}
      <h4>{tr("Source sample", "来源样本")}</h4>
      {source ? (
        <Table
          size="small"
          pagination={false}
          scroll={{ x: "max-content" }}
          rowKey={(_, i) => i}
          dataSource={source.sample_rows || []}
          columns={(source.columns || []).map((c) => ({
            title: c.name,
            dataIndex: c.name,
            render: (v) =>
              typeof v === "object" ? JSON.stringify(v) : String(v ?? "—"),
          }))}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={tr(
            "Choose a source to inspect its fields.",
            "选择来源以查看字段。",
          )}
        />
      )}
      {(issues || [])
        .filter((i) => i.candidate_id === entry.id)
        .map((i, n) => (
          <p key={n} className="sd-issue">
            <Tag color={i.level === "error" ? "red" : "orange"}>{i.code}</Tag>
            {i.message}
          </p>
        ))}
    </Drawer>
  );
}
