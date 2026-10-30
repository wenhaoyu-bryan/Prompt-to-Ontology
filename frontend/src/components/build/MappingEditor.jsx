import {
  Button,
  Checkbox,
  Divider,
  Empty,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
const { Text } = Typography;
const names = (source) =>
  (source.columns || []).map((c) => (typeof c === "string" ? c : c.name));

export default function MappingEditor({
  source,
  schema,
  onChange,
  zh,
  disabled,
}) {
  const tr = (en, cn) => (zh ? cn : en);
  const columns = names(source);
  const objects = schema.object_types || {};
  const links = schema.link_types || {};
  const options = columns.map((value) => ({ value, label: value }));
  const change = (patch) => onChange({ ...source, ...patch });
  const objectMaps = source.object_mappings || [];
  const linkMaps = source.link_mappings || [];
  const updateObject = (index, next) =>
    change({
      object_mappings: objectMaps.map((m, i) => (i === index ? next : m)),
    });
  const updateLink = (index, next) =>
    change({ link_mappings: linkMaps.map((m, i) => (i === index ? next : m)) });
  const updateProperty = (index, column, target) => {
    const m = objectMaps[index];
    updateObject(index, {
      ...m,
      field_mappings: [
        ...(m.field_mappings || []).filter((f) => f.source_column !== column),
        ...(target
          ? [
              {
                source_column: column,
                target_object_type: m.object_type,
                target_property: target,
                mapping_type: "manual",
                confidence: 1,
                reason: "User selected mapping",
              },
            ]
          : []),
      ],
    });
  };
  const addObject = () =>
    change({
      object_mappings: [
        ...objectMaps,
        {
          object_type: "PetFoodProduct",
          id_column: "",
          display_name_column: "",
          field_mappings: [],
          confidence: 1,
        },
      ],
    });
  const addLink = () =>
    change({
      link_mappings: [
        ...linkMaps,
        {
          link_type: "CONTAINS",
          source_object_type: links.CONTAINS?.source_type || "PetFoodProduct",
          target_object_type: links.CONTAINS?.target_type || "Ingredient",
          source_id_column: "",
          target_id_column: "",
          field_mappings: [],
          confidence: 1,
        },
      ],
    });
  return (
    <div className="ab-mapping-editor">
      <div className="ab-section-heading">
        <div>
          <h3>{source.name}</h3>
          <p>
            {source.row_count} {tr("rows", "行")} · {columns.length}{" "}
            {tr("columns", "列")} · {source.format}
          </p>
        </div>
        <Checkbox
          disabled={disabled}
          checked={!!source.excluded}
          onChange={(e) => change({ excluded: e.target.checked })}
        >
          {tr("Exclude this file", "排除此文件")}
        </Checkbox>
      </div>
      <details className="ab-profile">
        <summary>
          {tr(
            "Inspect source columns and sample values",
            "查看来源字段与样例值",
          )}
        </summary>
        <Table
          size="small"
          pagination={false}
          scroll={{ x: 500 }}
          rowKey="name"
          dataSource={(source.columns || []).map((c) =>
            typeof c === "string" ? { name: c } : c,
          )}
          columns={[
            {
              title: tr("Column", "字段"),
              dataIndex: "name",
              render: (v) => <code>{v}</code>,
            },
            {
              title: tr("Detected type", "识别类型"),
              dataIndex: "inferred_type",
              width: 100,
            },
            {
              title: tr("Sample values", "样例值"),
              dataIndex: "sample_values",
              render: (v) => (
                <span className="ab-samples">
                  {(v || [])
                    .slice(0, 3)
                    .map((x) =>
                      typeof x === "object" ? JSON.stringify(x) : String(x),
                    )
                    .join(" · ")}
                </span>
              ),
            },
          ]}
        />
      </details>
      {!source.excluded && (
        <>
          <div className="ab-section-heading ab-subheading">
            <div>
              <h3>{tr("Objects from this file", "此文件生成的对象")}</h3>
              <p>
                {tr(
                  "Keep identity and business meaning explicit. Unmapped columns are excluded.",
                  "明确标识与业务含义，未映射字段不会进入候选。",
                )}
              </p>
            </div>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={addObject}
              disabled={disabled}
            >
              {tr("Add object mapping", "添加对象映射")}
            </Button>
          </div>
          {objectMaps.map((mapping, index) => {
            const definition = objects[mapping.object_type] || {};
            const properties = definition.properties || [];
            return (
              <section className="ab-mapping-card" key={index}>
                <div className="ab-mapping-controls">
                  <label>
                    {tr("Object type", "对象类型")}
                    <Select
                      aria-label={`Object type ${index + 1}`}
                      disabled={disabled}
                      value={mapping.object_type}
                      onChange={(value) =>
                        updateObject(index, {
                          ...mapping,
                          object_type: value,
                          id_column: "",
                          field_mappings: [],
                        })
                      }
                      options={Object.keys(objects).map((value) => ({
                        value,
                        label: value,
                      }))}
                    />
                  </label>
                  <label>
                    {tr("Identity column", "标识字段")}
                    <Select
                      aria-label={`Identity column ${index + 1}`}
                      disabled={disabled}
                      value={mapping.id_column || undefined}
                      placeholder={tr("Select source field", "选择来源字段")}
                      onChange={(value) => {
                        const fields = (mapping.field_mappings || []).filter(
                          (f) =>
                            f.target_property !== definition.primary_key &&
                            f.source_column !== value,
                        );
                        updateObject(index, {
                          ...mapping,
                          id_column: value,
                          field_mappings: [
                            ...fields,
                            {
                              source_column: value,
                              target_object_type: mapping.object_type,
                              target_property: definition.primary_key,
                              confidence: 1,
                              mapping_type: "manual",
                              reason: "User selected identity column",
                            },
                          ],
                        });
                      }}
                      options={options}
                    />
                  </label>
                  <Button
                    type="text"
                    disabled={disabled}
                    icon={<DeleteOutlined />}
                    aria-label={tr("Remove object mapping", "移除对象映射")}
                    onClick={() =>
                      change({
                        object_mappings: objectMaps.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  />
                </div>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="column"
                  scroll={{ x: 600 }}
                  dataSource={columns.map((column) => ({
                    column,
                    mapping: (mapping.field_mappings || []).find(
                      (f) => f.source_column === column,
                    ),
                  }))}
                  columns={[
                    {
                      title: tr("Source field", "来源字段"),
                      dataIndex: "column",
                      width: 170,
                      render: (v) => <code>{v}</code>,
                    },
                    {
                      title: tr("Ontology property", "本体属性"),
                      render: (_, row) => (
                        <Select
                          aria-label={`Map ${mapping.object_type}.${row.column}`}
                          disabled={disabled}
                          allowClear
                          showSearch
                          style={{ width: "100%" }}
                          value={row.mapping?.target_property || undefined}
                          placeholder={tr("Leave unmapped", "不映射")}
                          onChange={(value) =>
                            updateProperty(index, row.column, value)
                          }
                          options={properties.map((p) => ({
                            value: p.name,
                            label: `${p.name}${p.required ? " *" : ""}`,
                          }))}
                        />
                      ),
                    },
                    {
                      title: tr("Mapping basis", "映射依据"),
                      width: 230,
                      render: (_, row) =>
                        row.mapping ? (
                          <>
                            <Text type="secondary">
                              {row.mapping.reason ||
                                tr("Proposed mapping", "建议映射")}
                            </Text>
                            {row.mapping.target_property?.endsWith("_100g") &&
                              row.column !== row.mapping.target_property && (
                                <label className="ab-unit">
                                  {tr(
                                    "Source amount is measured per 100 g",
                                    "确认来源数值按每 100 g 计",
                                  )}
                                  <Checkbox
                                    aria-label={`Confirm unit ${row.column}`}
                                    disabled={disabled}
                                    checked={
                                      source.unit_confirmations?.[
                                        row.column
                                      ] === "per_100g"
                                    }
                                    onChange={(e) => {
                                      const units = {
                                        ...(source.unit_confirmations || {}),
                                      };
                                      if (e.target.checked)
                                        units[row.column] = "per_100g";
                                      else delete units[row.column];
                                      change({ unit_confirmations: units });
                                    }}
                                  />
                                </label>
                              )}
                          </>
                        ) : (
                          <Text type="secondary">
                            {tr("Excluded from candidate", "不进入候选")}
                          </Text>
                        ),
                    },
                  ]}
                />
              </section>
            );
          })}
          {!objectMaps.length && (
            <p className="ab-muted">
              {tr(
                "No objects selected. This file may describe relationships only.",
                "未选择对象映射，此文件可以仅包含关系。",
              )}
            </p>
          )}
          <div className="ab-section-heading ab-subheading">
            <div>
              <h3>{tr("Relationships from this file", "此文件生成的关系")}</h3>
              <p>
                {tr(
                  "Map both endpoints to explicit identity columns.",
                  "为关系两端选择明确的标识字段。",
                )}
              </p>
            </div>
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={disabled}
              onClick={addLink}
            >
              {tr("Add relationship", "添加关系映射")}
            </Button>
          </div>
          {linkMaps.map((mapping, index) => (
            <section className="ab-mapping-card" key={index}>
              <div className="ab-mapping-controls">
                <label>
                  {tr("Relationship type", "关系类型")}
                  <Select
                    aria-label={`Relationship type ${index + 1}`}
                    disabled={disabled}
                    value={mapping.link_type}
                    options={Object.keys(links).map((value) => ({
                      value,
                      label: value,
                    }))}
                    onChange={(value) =>
                      updateLink(index, {
                        ...mapping,
                        link_type: value,
                        source_object_type: links[value].source_type,
                        target_object_type: links[value].target_type,
                      })
                    }
                  />
                </label>
                <Tag>
                  {mapping.source_object_type} → {mapping.target_object_type}
                </Tag>
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  disabled={disabled}
                  aria-label={tr("Remove relationship mapping", "移除关系映射")}
                  onClick={() =>
                    change({
                      link_mappings: linkMaps.filter((_, i) => i !== index),
                    })
                  }
                />
              </div>
              <div className="ab-endpoints">
                <label>
                  {tr("Source identity field", "起点标识字段")}
                  <Select
                    aria-label={`Relationship source ${index + 1}`}
                    disabled={disabled}
                    value={mapping.source_id_column || undefined}
                    options={options}
                    onChange={(value) =>
                      updateLink(index, { ...mapping, source_id_column: value })
                    }
                  />
                </label>
                <span>→</span>
                <label>
                  {tr("Target identity field", "终点标识字段")}
                  <Select
                    aria-label={`Relationship target ${index + 1}`}
                    disabled={disabled}
                    value={mapping.target_id_column || undefined}
                    options={options}
                    onChange={(value) =>
                      updateLink(index, { ...mapping, target_id_column: value })
                    }
                  />
                </label>
              </div>
              <label className="ab-label">
                {tr("Relationship properties", "关系属性")}
              </label>
              <Table
                size="small"
                pagination={false}
                rowKey="column"
                scroll={{ x: 450 }}
                dataSource={columns
                  .filter(
                    (column) =>
                      column !== mapping.source_id_column &&
                      column !== mapping.target_id_column,
                  )
                  .map((column) => ({
                    column,
                    mapping: (mapping.field_mappings || []).find(
                      (f) => f.source_column === column,
                    ),
                  }))}
                columns={[
                  {
                    title: tr("Source field", "来源字段"),
                    dataIndex: "column",
                    render: (value) => <code>{value}</code>,
                  },
                  {
                    title: tr("Relationship property", "关系属性"),
                    render: (_, row) => (
                      <Select
                        aria-label={`Map ${mapping.link_type}.${row.column}`}
                        disabled={disabled}
                        allowClear
                        style={{ width: "100%" }}
                        value={row.mapping?.target_property || undefined}
                        placeholder={tr("Leave unmapped", "不映射")}
                        options={(mapping.link_type === "CONTAINS"
                          ? ["ingredient_order", "proportion_percent"]
                          : []
                        ).map((value) => ({ value, label: value }))}
                        onChange={(value) =>
                          updateLink(index, {
                            ...mapping,
                            field_mappings: [
                              ...(mapping.field_mappings || []).filter(
                                (f) => f.source_column !== row.column,
                              ),
                              ...(value
                                ? [
                                    {
                                      source_column: row.column,
                                      target_object_type:
                                        mapping.target_object_type,
                                      target_property: value,
                                      mapping_type: "manual",
                                      confidence: 1,
                                    },
                                  ]
                                : []),
                            ],
                          })
                        }
                      />
                    ),
                  },
                ]}
              />
            </section>
          ))}
          {!objectMaps.length && !linkMaps.length && (
            <Empty
              description={tr(
                "Choose an object or relationship mapping, or exclude this file.",
                "选择对象或关系映射，或排除此文件。",
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
