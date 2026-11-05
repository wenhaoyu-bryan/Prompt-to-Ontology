import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  ApartmentOutlined,
  LinkOutlined,
  AlertOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { api } from "../providers/dataProvider";
import SchemaDetailDrawer from "../components/ontology/SchemaDetailDrawer";
import DesignDefinitionDrawer from "../components/ontology/DesignDefinitionDrawer";
import DesignTypeMap from "../components/ontology/DesignTypeMap";
import "../components/ontology/ontologyDesign.css";

const { Title, Text } = Typography;
const TAB_KEYS = [
  "objectTypes",
  "linkTypes",
  "typeMap",
  "rules",
  "actions",
  "metrics",
];
const SEVERITY_COLORS = {
  critical: "red",
  high: "orange",
  medium: "gold",
  low: "blue",
  info: "default",
};

function legacyDefinition(category, name, draft, catalog) {
  const original =
    catalog[category === "objectTypes" ? "object_types" : "link_types"][name];
  if (category === "linkTypes")
    return {
      ...structuredClone(original),
      description: draft.description ?? original.description,
      source_type: draft.from || original.source_type,
      target_type: draft.to || original.target_type,
    };
  const known = new Map(original.properties.map((prop) => [prop.name, prop]));
  const properties = (draft.properties || []).map((prop) => {
    const field = typeof prop === "string" ? prop : prop.name;
    return known.has(field)
      ? structuredClone(known.get(field))
      : {
          name: field,
          type: "string",
          required: false,
          description: "",
          enum_values: [],
          default: null,
          unit: "",
          source_field: "",
          source_bindings: [],
        };
  });
  return {
    ...structuredClone(original),
    description: draft.description ?? original.description,
    properties,
  };
}

export default function SchemaPage() {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const tr = (en, cn) => (zh ? cn : en);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(
    TAB_KEYS.includes(params.get("tab")) ? params.get("tab") : "objectTypes",
  );
  const [schema, setSchema] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeAsset, setActiveAsset] = useState(null);
  const request = useRef(0);

  const loadSchema = async () => {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const [reference, design] = await Promise.all([
        api.get("/ontology/pet_food/schema"),
        api.get("/ontology/pet_food/design"),
      ]);
      if (current !== request.current) return;
      setSchema(reference.data);
      setCatalog(design.data);
      setActiveAsset(null);
    } catch {
      if (current === request.current)
        setError(
          tr("Could not load the ontology design.", "无法加载本体设计。"),
        );
    } finally {
      if (current === request.current) setLoading(false);
    }
  };
  useEffect(() => {
    loadSchema();
    return () => {
      request.current++;
    };
  }, []);
  useEffect(() => {
    const requestedTab = params.get("tab");
    if (TAB_KEYS.includes(requestedTab)) setTab(requestedTab);
    const name = params.get("asset");
    const category =
      params.get("assetType") ||
      (requestedTab === "linkTypes" ? "linkTypes" : "objectTypes");
    const collection =
      category === "objectTypes" ? catalog?.object_types : catalog?.link_types;
    if (name && collection?.[name]) {
      setActiveAsset((current) =>
        current?.category === category && current.name === name
          ? current
          : { category, name },
      );
    }
  }, [params, catalog]);

  const closeAsset = () => {
    setActiveAsset(null);
    const next = new URLSearchParams(params);
    next.delete("asset");
    next.delete("assetType");
    setParams(next, { replace: true });
  };
  const openAsset = (category, name, definition) => {
    setActiveAsset({ category, name, ...(definition ? { definition } : {}) });
    if (["objectTypes", "linkTypes"].includes(category) && name) {
      const next = new URLSearchParams(params);
      next.set("asset", name);
      next.set("assetType", category);
      setParams(next, { replace: true });
    }
  };
  const setActiveTab = (key) => {
    setTab(key);
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };
  const onSaved = (category, name, definition) =>
    setSchema((current) => ({
      ...current,
      drafts: {
        ...current.drafts,
        [category]: { ...current.drafts?.[category], [name]: definition },
      },
    }));
  const onDiscarded = (category, name) =>
    setSchema((current) => {
      const drafts = { ...current.drafts?.[category] };
      delete drafts[name];
      return { ...current, drafts: { ...current.drafts, [category]: drafts } };
    });

  if (loading)
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  if (error || !schema || !catalog)
    return (
      <Alert
        type="error"
        showIcon
        title={error || t("common.loadFailed")}
        action={<Button onClick={loadSchema}>{t("common.retry")}</Button>}
      />
    );

  const legacyDrafts = { ...schema.drafts, ...catalog.legacy_drafts };
  const objects = Object.values(catalog.object_types || {});
  const links = Object.values(catalog.link_types || {});
  const legacyValue = (category, name, definition) => ({
    name,
    ...definition,
    ...schema.drafts?.[category]?.[name],
    isDraft: !!schema.drafts?.[category]?.[name],
  });
  const rules = Object.entries(schema.rules || {}).map(([name, value]) => ({
    ...legacyValue("rules", name, value),
    assetKey: name,
  }));
  const actions = Object.entries(schema.actionTypes || {}).map(
    ([name, value]) => legacyValue("actionTypes", name, value),
  );
  const metrics = Object.entries(schema.metrics || {}).map(([name, value]) =>
    legacyValue("metrics", name, value),
  );
  const legacyCount = ["objectTypes", "linkTypes"].reduce(
    (count, category) =>
      count + Object.keys(legacyDrafts?.[category] || {}).length,
    0,
  );

  const rowProps =
    (category, key = "name") =>
    (item) => ({
      className: "schema-asset-row",
      onClick: () => openAsset(category, item[key]),
    });
  const details = (category, key = "name") => ({
    title: "",
    key: "details",
    width: 140,
    render: (_, item) => (
      <Space wrap size={4}>
        <Button
          type="link"
          onClick={(event) => {
            event.stopPropagation();
            openAsset(category, item[key]);
          }}
        >
          {tr("View details", "查看详情")}
        </Button>
        {legacyDrafts?.[category]?.[item[key]] &&
          ["objectTypes", "linkTypes"].includes(category) && (
            <Button
              type="link"
              onClick={(event) => {
                event.stopPropagation();
                openAsset(
                  category,
                  item[key],
                  legacyDefinition(
                    category,
                    item[key],
                    legacyDrafts[category][item[key]],
                    catalog,
                  ),
                );
              }}
            >
              {tr("Review draft", "检查草稿")}
            </Button>
          )}
      </Space>
    ),
  });
  const nameColumn = (category) => ({
    title: tr("Name", "名称"),
    key: "name",
    render: (_, item) => (
      <Space orientation="vertical" size={0}>
        <Text strong>{item.label || item.name}</Text>
        {item.label && item.label !== item.name && (
          <Text type="secondary" code>
            {item.name}
          </Text>
        )}
        {legacyDrafts?.[category]?.[item.name] && (
          <Tag>{tr("Existing local draft", "已有本地草稿")}</Tag>
        )}
      </Space>
    ),
  });
  const tools = (category) => (
    <div className="od-manager-actions od-manager-tools">
      <Text type="secondary">
        {category === "objectTypes"
          ? tr(
              "Define identities and typed properties.",
              "定义对象标识与属性结构。",
            )
          : tr("Describe how object types relate.", "定义对象类型之间的关系。")}
      </Text>
      <Button type="primary" onClick={() => openAsset(category)}>
        {category === "objectTypes"
          ? tr("New object", "新建对象")
          : tr("New relationship", "新建关系")}
      </Button>
    </div>
  );
  const tableProps = {
    size: "small",
    pagination: false,
    scroll: { x: "max-content" },
    rowKey: "name",
  };
  const items = [
    {
      key: "objectTypes",
      label: (
        <span>
          <ApartmentOutlined /> {t("schema.objectTypes")} ({objects.length})
        </span>
      ),
      children: (
        <>
          {tools("objectTypes")}
          <Table
            {...tableProps}
            dataSource={objects}
            onRow={rowProps("objectTypes")}
            columns={[
              nameColumn("objectTypes"),
              { title: t("common.description"), dataIndex: "description" },
              {
                title: tr("Primary key", "主键"),
                dataIndex: "primary_key",
                render: (value) => <code>{value}</code>,
              },
              {
                title: tr("Properties", "属性数"),
                dataIndex: "properties",
                render: (value) => value?.length || 0,
              },
              details("objectTypes"),
            ]}
          />
        </>
      ),
    },
    {
      key: "linkTypes",
      label: (
        <span>
          <LinkOutlined /> {t("schema.linkTypes")} ({links.length})
        </span>
      ),
      children: (
        <>
          {tools("linkTypes")}
          <Table
            {...tableProps}
            dataSource={links}
            onRow={rowProps("linkTypes")}
            columns={[
              nameColumn("linkTypes"),
              {
                title: tr("Source object", "来源对象"),
                dataIndex: "source_type",
              },
              {
                title: tr("Target object", "目标对象"),
                dataIndex: "target_type",
              },
              { title: tr("Cardinality", "基数"), dataIndex: "cardinality" },
              { title: t("common.description"), dataIndex: "description" },
              details("linkTypes"),
            ]}
          />
        </>
      ),
    },
    {
      key: "typeMap",
      label: tr("Type map", "类型图"),
      children: (
        <>
          <p className="od-design-scope">
            {tr(
              "Object and relationship definitions. Select a type or relationship to inspect it.",
              "对象与关系的定义结构。选择对象或关系可查看详情。",
            )}
          </p>
          <DesignTypeMap catalog={catalog} onSelect={openAsset} tr={tr} />
        </>
      ),
    },
    {
      key: "rules",
      label: (
        <span>
          <AlertOutlined /> {t("schema.rules")} ({rules.length})
        </span>
      ),
      children: (
        <Table
          {...tableProps}
          rowKey="assetKey"
          dataSource={rules}
          onRow={rowProps("rules", "assetKey")}
          columns={[
            {
              title: t("common.id"),
              dataIndex: "rule_id",
              render: (value) => <code>{value}</code>,
            },
            { title: t("common.name"), dataIndex: "name" },
            {
              title: t("common.severity"),
              dataIndex: "severity",
              render: (value) => (
                <Tag color={SEVERITY_COLORS[value]}>
                  {t(`common.statusLabels.${value}`, value)}
                </Tag>
              ),
            },
            { title: t("common.description"), dataIndex: "explanation" },
            details("rules", "assetKey"),
          ]}
        />
      ),
    },
    {
      key: "actions",
      label: (
        <span>
          <ThunderboltOutlined /> {t("schema.actions")} ({actions.length})
        </span>
      ),
      children: (
        <Table
          {...tableProps}
          dataSource={actions}
          onRow={rowProps("actionTypes")}
          columns={[
            { title: t("common.name"), dataIndex: "name" },
            { title: t("common.description"), dataIndex: "description" },
            { title: tr("Executor", "执行方"), dataIndex: "executor" },
            details("actionTypes"),
          ]}
        />
      ),
    },
    {
      key: "metrics",
      label: `${tr("Metric definitions", "指标定义")} (${metrics.length})`,
      children: (
        <Table
          {...tableProps}
          dataSource={metrics}
          onRow={rowProps("metrics")}
          columns={[
            { title: tr("Metric", "指标"), dataIndex: "name" },
            { title: tr("Object", "对象"), dataIndex: "object_type" },
            { title: tr("Aggregation", "聚合方式"), dataIndex: "aggregation" },
            { title: tr("Unit", "单位"), dataIndex: "unit" },
            { title: tr("Source", "来源"), dataIndex: "source_asset" },
            details("metrics"),
          ]}
        />
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={20} style={{ width: "100%" }}>
      <div className="page-heading">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {t("schema.title")}
          </Title>
          <Text type="secondary">
            {tr(
              "Design object types, properties and relationships in one place.",
              "在此维护对象类型、属性和关系定义。",
            )}
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadSchema}>
          {t("common.refresh")}
        </Button>
      </div>
      {legacyCount > 0 && (
        <Alert
          type="info"
          showIcon
          title={tr(
            "Existing local drafts are available",
            "已有本地草稿可继续处理",
          )}
          description={tr(
            "Use Review draft on an object or relationship to inspect its earlier edits before saving.",
            "在对象或关系行中选择“检查草稿”，检查旧编辑内容后保存。 ",
          )}
        />
      )}
      <Card styles={{ body: { padding: "0 16px 16px" } }}>
        <Tabs
          activeKey={tab}
          onChange={setActiveTab}
          items={items}
          style={{ marginTop: 8 }}
        />
      </Card>
      {["objectTypes", "linkTypes"].includes(activeAsset?.category) && (
        <DesignDefinitionDrawer
          asset={activeAsset}
          catalog={catalog}
          tr={tr}
          onClose={closeAsset}
          onReload={loadSchema}
          onSaved={(next, category, name) => {
            setCatalog(next);
            setActiveAsset({ category, name });
            const query = new URLSearchParams(params);
            query.set("asset", name);
            query.set("assetType", category);
            setParams(query, { replace: true });
          }}
        />
      )}
      {!["objectTypes", "linkTypes"].includes(activeAsset?.category) && (
        <SchemaDetailDrawer
          asset={activeAsset}
          schema={schema}
          onClose={closeAsset}
          onSaved={onSaved}
          onDiscarded={onDiscarded}
        />
      )}
    </Space>
  );
}
