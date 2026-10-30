import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
  Upload,
  message,
  theme,
} from "antd";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ApartmentOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../providers/dataProvider";
import SchemaDefinitionDrawer from "./SchemaDefinitionDrawer";
import SchemaDesignMap from "./SchemaDesignMap";
import "./assistedBuild.css";
import "./schemaDesign.css";

const base = "/assisted-build/schema-designs";
const busy = (run) => ["queued", "analyzing"].includes(run?.status);
const json = (value) => JSON.stringify(value, null, 2);
const download = (name, content) => {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function SchemaDesignWorkspace() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const tr = (en, cn) => (zh ? cn : en);
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get("design");
  const selection = useRef({ id });
  const mounted = useRef(true);
  if (selection.current.id !== id) selection.current = { id };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const scopedRequest = async (method, ...args) => {
    const context = selection.current;
    try {
      const response = await api[method](...args);
      if (!mounted.current || context !== selection.current) {
        throw Object.assign(new Error("Selection changed"), {
          name: "AbortError",
        });
      }
      return response;
    } catch (e) {
      if (!mounted.current || context !== selection.current)
        e.name = "AbortError";
      throw e;
    }
  };
  const scopedApi = Object.fromEntries(
    ["get", "post", "put", "delete"].map((method) => [
      method,
      (...args) => scopedRequest(method, ...args),
    ]),
  );
  const [run, setRun] = useState(null);
  const [files, setFiles] = useState([]);
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState("auto");
  const [activeSchema, setActiveSchema] = useState({});
  const [objects, setObjects] = useState([]);
  const [links, setLinks] = useState([]);
  const [stage, setStage] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0);
  const [detail, setDetail] = useState(null);
  const [category, setCategory] = useState("objects");
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [exported, setExported] = useState(null);
  const dirty =
    !!run &&
    (json(objects) !== json(run.objects || []) ||
      json(links) !== json(run.links || []));
  const preview = run?.preview;
  const issues = preview?.issues || run?.issues || [];
  const states = {
    queued: tr("Queued", "等待执行"),
    analyzing: tr("Analyzing", "正在分析"),
    needs_confirmation: tr("Needs calibration", "待校准"),
    ready: tr("Ready to save", "可保存"),
    saved: tr("Saved draft · not active", "草稿已保存 · 未生效"),
    interrupted: tr("Interrupted", "已中断"),
    failed: tr("Analysis failed", "分析失败"),
  };
  const stages = [
    tr("Sources & goal", "来源与目标"),
    tr("Calibrate definitions", "定义校准"),
    tr("Review changes", "差异预览"),
    tr("Saved draft", "保存草稿"),
  ];
  const report = (e) => {
    if (e.name === "AbortError") return;
    setError(
      typeof e.response?.data?.detail === "string"
        ? e.response.data.detail
        : tr(
            "The action could not be completed. Check your inputs and retry.",
            "操作未完成，请检查输入后重试。",
          ),
    );
  };
  const act = async (fn) => {
    setPending(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      report(e);
    } finally {
      setPending(false);
    }
  };
  useEffect(() => {
    let alive = true;
    api
      .get("/assisted-build/schema")
      .then((r) => {
        if (alive) setActiveSchema(r.data.schema);
      })
      .catch((e) => {
        if (alive) report(e);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true,
      timer;
    let initialized = false;
    setError("");
    setDetail(null);
    setExported(null);
    if (!id) {
      setRun(null);
      setObjects([]);
      setLinks([]);
      setStage(0);
      return;
    }
    setRun(null);
    const poll = async () => {
      try {
        const { data } = await scopedApi.get(`${base}/${id}`);
        if (!alive) return;
        setRun(data);
        if (!initialized && !busy(data)) {
          setStage(data.status === "saved" ? 3 : data.preview ? 2 : 1);
          initialized = true;
        }
        if (busy(data)) timer = setTimeout(poll, 1500);
      } catch (e) {
        if (alive) report(e);
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, epoch]);
  useEffect(() => {
    if (!run) return;
    setObjects(structuredClone(run.objects || []));
    setLinks(structuredClone(run.links || []));
    setReviewed(false);
  }, [run?.id, run?.revision, run?.status]);
  useEffect(() => {
    if (run?.status !== "saved" || dirty) {
      setExported(null);
      return;
    }
    let alive = true;
    scopedApi
      .get(`${base}/${run.id}/export`)
      .then((r) => {
        if (alive) setExported(r.data);
      })
      .catch((e) => {
        if (alive) report(e);
      });
    return () => {
      alive = false;
    };
  }, [run?.id, run?.revision, run?.status, dirty]);
  const choose = (r) => {
    setParams({ mode: "schema", design: r.id });
    setEpoch((value) => value + 1);
    setStage(r.status === "saved" ? 3 : r.preview ? 2 : 1);
    setHistoryOpen(false);
  };
  const fresh = () => {
    setParams({ mode: "schema" });
    setRun(null);
    setFiles([]);
    setGoal("");
    setObjects([]);
    setLinks([]);
    setDetail(null);
    setStage(0);
    setError("");
  };
  const loadExample = () =>
    act(async () => {
      const { data } = await scopedApi.get(
        "/assisted-build/schema-design-sample-files",
      );
      setFiles(data.files);
      setGoal(
        zh
          ? "扩展宠物食品的供应商与生产批次定义，保留供应商和批次标识，明确批次与供应商的关系。"
          : data.goal,
      );
    });
  const upload = async (file) => {
    if (
      file.size > 2_000_000 ||
      !/\.(csv|json|ndjson|jsonl)$/i.test(file.name)
    ) {
      message.error(
        tr(
          "Choose CSV, JSON or NDJSON under 2 MB.",
          "请选择小于 2 MB 的 CSV、JSON 或 NDJSON 文件。",
        ),
      );
      return false;
    }
    try {
      const content = await file.text();
      setFiles((all) => {
        if (all.length >= 8) {
          message.error(tr("Up to 8 files.", "最多 8 个文件。"));
          return all;
        }
        return [...all, { name: file.name, content }];
      });
    } catch {
      message.error(tr("Could not read this file.", "无法读取文件。"));
    }
    return false;
  };
  const start = () =>
    act(async () => {
      const { data } = await scopedApi.post(base, {
        goal,
        files,
        execution_mode: mode,
      });
      choose(data);
    });
  const update = (next) => {
    (detail.category === "objects" ? setObjects : setLinks)((items) =>
      items.map((item) => (item.id === next.id ? next : item)),
    );
    setReviewed(false);
  };
  const changed = () =>
    act(async () => {
      const { data: saved } = await scopedApi.put(
        `${base}/${run.id}/definitions`,
        {
          expected_revision: run.revision,
          objects,
          links,
        },
      );
      setRun(saved);
      const { data } = await scopedApi.post(`${base}/${run.id}/preview`, {
        expected_revision: saved.revision,
      });
      setRun(data);
      setStage(2);
      setReviewed(false);
    });
  const save = () =>
    act(async () => {
      const { data } = await scopedApi.post(`${base}/${run.id}/save`, {
        expected_revision: run.revision,
        preview_hash: preview.hash,
      });
      setRun(data);
      setStage(3);
      message.success(
        tr(
          "Schema draft saved. The active schema is unchanged.",
          "Schema 草稿已保存，当前生效定义未改变。",
        ),
      );
    });
  const retry = () =>
    act(async () => {
      await scopedApi.post(`${base}/${run.id}/retry`, {
        expected_revision: run.revision,
      });
      setEpoch((n) => n + 1);
    });
  const remove = (rid) =>
    act(async () => {
      await scopedApi.delete(`${base}/${rid}`);
      setHistory((items) => items.filter((item) => item.id !== rid));
      if (id === rid) fresh();
    });
  const add = () => {
    const rid =
      (category === "objects" ? "o-" : "l-") +
      crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const sid = run.sources[0]?.id || "";
    const common = {
      id: rid,
      name: "",
      label: "",
      description: "",
      source_id: sid,
      intent: "new",
      decision: "pending",
    };
    if (category === "objects")
      setObjects((items) => [
        ...items,
        { ...common, primary_key: "", display_name: "", properties: [] },
      ]);
    else
      setLinks((items) => [
        ...items,
        {
          ...common,
          from: "",
          to: "",
          cardinality: "MANY_TO_MANY",
          source_column: "",
          target_column: "",
        },
      ]);
    setDetail({ id: rid, category });
  };
  const decisions = {
    pending: tr("Needs review", "待确认"),
    accepted: tr("Confirmed", "已确认"),
    excluded: tr("Excluded", "已排除"),
  };
  const definitionRows = category === "objects" ? objects : links;
  const selected = (detail?.category === "objects" ? objects : links).find(
    (item) => item.id === detail?.id,
  );
  const remaining = [...objects, ...links].filter(
    (item) => item.decision === "pending",
  ).length;
  const locked =
    pending || busy(run) || ["interrupted", "failed"].includes(run?.status);
  const variables = {
    "--ab-bg": token.colorBgContainer,
    "--ab-page": token.colorBgLayout,
    "--ab-border": token.colorBorderSecondary,
    "--ab-text": token.colorText,
    "--ab-muted": token.colorTextSecondary,
    "--ab-accent": token.colorPrimary,
    "--ab-tint": token.colorPrimaryBg,
  };
  return (
    <div
      className="assisted-build schema-design"
      style={variables}
      data-testid="schema-design"
    >
      <header className="ab-page-header">
        <div>
          <Typography.Title level={3}>
            {tr("Design your ontology", "辅助设计本体")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {tr(
              "Turn source fields into definitions you can inspect, refine and keep.",
              "从来源字段提出定义，校准语义，再保存可追溯的草稿。",
            )}
          </Typography.Text>
        </div>
        <Space wrap>
          <Button
            disabled={pending}
            onClick={() => navigate("/pipeline?mode=assisted")}
          >
            {tr("Map to existing schema", "映射到已有本体")}
          </Button>
          <Button
            icon={<HistoryOutlined />}
            disabled={pending}
            onClick={() =>
              act(async () => {
                const { data } = await scopedApi.get(base);
                setHistory(data.runs || []);
                setHistoryOpen(true);
              })
            }
          >
            {tr("Design history", "设计记录")}
          </Button>
          {run && (
            <Button disabled={pending} icon={<PlusOutlined />} onClick={fresh}>
              {tr("New design", "新建设计")}
            </Button>
          )}
        </Space>
      </header>
      <section className="ab-progress">
        <div className="ab-run-caption">
          <span>
            {run?.goal ||
              tr(
                "Schema design · Objects, properties and relationships",
                "Schema 设计 · 对象、属性与关系",
              )}
          </span>
          <Tag color={run?.status === "saved" ? "blue" : "orange"}>
            {states[run?.status] || tr("Definition draft", "定义草稿")}
          </Tag>
        </div>
        <Steps
          size="small"
          responsive={false}
          current={stage}
          onChange={setStage}
          items={stages.map((title, i) => ({
            title,
            disabled:
              pending ||
              busy(run) ||
              (i > 0 && !run) ||
              (i === 2 && (!preview || dirty)) ||
              (i === 3 && (run?.status !== "saved" || dirty)),
          }))}
        />
      </section>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          closable
          onClose={() => setError("")}
        />
      )}
      <main
        className="ab-stage"
        aria-label={tr("Schema design content", "Schema 设计内容")}
        key={stage}
      >
        {(!run && id) || busy(run) ? (
          <div className="ab-loading">
            <Spin size="large" />
            <h3>
              {tr(
                "Proposing definitions from your sources",
                "正在从来源提出定义",
              )}
            </h3>
            <p>
              {tr(
                "The task is retained. You can reopen it from design history.",
                "任务已保留，可以从设计记录重新打开。",
              )}
            </p>
            {(run?.steps || []).map((s, i) => (
              <small key={i}>
                {s.method} · {s.status}
              </small>
            ))}
          </div>
        ) : ["interrupted", "failed"].includes(run?.status) ? (
          <section className="ab-panel">
            <Alert
              type="warning"
              showIcon
              title={tr(
                "Analysis did not finish. Uploaded files are retained.",
                "分析未完成，上传文件已保留。",
              )}
            />
            <Button icon={<ReloadOutlined />} onClick={retry} loading={pending}>
              {tr("Retry analysis", "重试分析")}
            </Button>
          </section>
        ) : stage === 0 ? (
          <div className="ab-source-layout">
            <section className="ab-panel">
              <div className="ab-section-heading">
                <div>
                  <h3>
                    {tr(
                      "What should the ontology describe?",
                      "本体需要表达什么？",
                    )}
                  </h3>
                  <p>
                    {tr(
                      "Describe the concepts and questions your sources should support.",
                      "说明数据中的概念，以及你希望它支持的问题。",
                    )}
                  </p>
                </div>
                <Tag>Pet Food</Tag>
              </div>
              <label className="ab-label" htmlFor="schema-goal">
                {tr("Design goal", "设计目标")}
              </label>
              <Input.TextArea
                id="schema-goal"
                rows={4}
                value={run?.goal || goal}
                disabled={!!run || pending}
                maxLength={2000}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={tr(
                  "Describe suppliers and production batches, including who supplied each batch.",
                  "定义供应商与生产批次，表达每个批次由谁供应。",
                )}
              />
              <label className="ab-label" htmlFor="schema-mode">
                {tr("Design assistant", "设计助手")}
              </label>
              <Select
                id="schema-mode"
                aria-label="Schema execution mode"
                value={run?.execution_mode || mode}
                disabled={!!run || pending}
                onChange={setMode}
                style={{ width: "100%" }}
                options={[
                  {
                    value: "auto",
                    label: tr(
                      "Configured model · deterministic fallback",
                      "已配置模型 · 不可用时确定性回退",
                    ),
                  },
                  {
                    value: "deterministic",
                    label: tr(
                      "Deterministic baseline · no model call",
                      "确定性基线 · 不调用模型",
                    ),
                  },
                ]}
              />
              <p className="ab-muted sd-explanation">
                {tr(
                  "The baseline proposes structure from actual fields. It cannot determine your business meaning or units. Every definition needs your confirmation.",
                  "基线仅从真实字段提出结构，不能确定业务语义和单位。每项定义都需要你确认。",
                )}
              </p>
              <div className="sd-boundary">
                <ApartmentOutlined />
                <div>
                  <b>
                    {tr(
                      "Design first, activate separately",
                      "先设计，再决定生效",
                    )}
                  </b>
                  <p>
                    {tr(
                      "Save and export a definition draft. Existing runtime definitions and graph data stay unchanged.",
                      "保存并导出定义草稿。当前生效定义和图谱数据保持不变。",
                    )}
                  </p>
                </div>
              </div>
            </section>
            <section className="ab-panel">
              <div className="ab-section-heading">
                <div>
                  <h3>{tr("Source files", "来源文件")}</h3>
                  <p>CSV · JSON · NDJSON</p>
                </div>
                {!run && (
                  <Button size="small" disabled={pending} onClick={loadExample}>
                    {tr("Try supplier example", "使用供应商示例")}
                  </Button>
                )}
              </div>
              {!run && (
                <Upload.Dragger
                  multiple
                  disabled={pending}
                  accept=".csv,.json,.ndjson,.jsonl"
                  beforeUpload={upload}
                  showUploadList={false}
                >
                  <CloudUploadOutlined style={{ fontSize: 28 }} />
                  <p>{tr("Drop related files here", "拖入相关文件")}</p>
                  <small>
                    {tr(
                      "Up to 8 files · 2 MB each · 8 MiB total",
                      "最多 8 个文件 · 单个 2 MB · 总计 8 MiB",
                    )}
                  </small>
                </Upload.Dragger>
              )}
              <div className="ab-files">
                {(run?.sources || files).map((f, i) => (
                  <div className="ab-file" key={f.id || i}>
                    <FileTextOutlined />
                    <div>
                      <b>{f.name}</b>
                      <small>
                        {f.row_count
                          ? `${f.row_count} ${tr("rows", "行")}`
                          : `${new Blob([f.content]).size.toLocaleString()} bytes`}
                      </small>
                    </div>
                    {!run && (
                      <Button
                        aria-label={`Remove ${f.name}`}
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() =>
                          setFiles((items) => items.filter((_, n) => n !== i))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : stage === 1 ? (
          <>
            <section className="ab-panel sd-calibration-heading">
              <div>
                <h3>
                  {tr(
                    "Confirm meaning, not just field names",
                    "确认业务含义，而不只是字段名",
                  )}
                </h3>
                <p className="ab-muted">
                  {tr(
                    "Inspect each definition in the drawer. Resolve identity, source bindings and relationship direction before saving.",
                    "在右侧抽屉逐项确认标识、来源绑定与关系方向，再查看整体差异。",
                  )}
                </p>
              </div>
              <Tag color={remaining ? "orange" : "green"}>
                {remaining} {tr("to review", "项待确认")}
              </Tag>
            </section>
            <SchemaDesignMap
              objects={objects}
              links={links}
              activeSchema={activeSchema}
              onSelect={(category, id) => {
                if (!pending) setDetail({ category, id });
              }}
              tr={tr}
            />
            <section className="ab-panel">
              <div className="ab-section-heading">
                <Segmented
                  aria-label="Definition category"
                  value={category}
                  onChange={setCategory}
                  disabled={pending}
                  options={[
                    {
                      value: "objects",
                      label: `${tr("Objects", "对象")} (${objects.length})`,
                    },
                    {
                      value: "links",
                      label: `${tr("Relationships", "关系")} (${links.length})`,
                    },
                  ]}
                />
                <Button
                  disabled={pending}
                  icon={<PlusOutlined />}
                  onClick={add}
                >
                  {tr(
                    category === "objects" ? "Add object" : "Add relationship",
                    category === "objects" ? "添加对象" : "添加关系",
                  )}
                </Button>
              </div>
              <Table
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 660 }}
                dataSource={definitionRows}
                locale={{
                  emptyText: tr(
                    "No definitions yet. Add one or revise your source files.",
                    "暂无定义，可手动添加或修改来源文件。",
                  ),
                }}
                columns={[
                  {
                    title: tr("Definition", "定义"),
                    render: (_, item) => (
                      <div>
                        <b>{item.name || tr("Unnamed", "未命名")}</b>
                        <div className="ab-muted">
                          {category === "objects"
                            ? `${item.properties?.length || 0} ${tr("properties", "个属性")}`
                            : `${item.from || "?"} → ${item.to || "?"}`}
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: tr("Source", "来源"),
                    render: (_, item) =>
                      run.sources.find((s) => s.id === item.source_id)?.name ||
                      "—",
                  },
                  {
                    title: tr("Intent", "变更"),
                    dataIndex: "intent",
                    render: (intent) =>
                      ({
                        new: tr("New", "新增"),
                        extend: tr("Extend", "扩展"),
                        reuse: tr("Reuse", "复用"),
                      })[intent],
                  },
                  {
                    title: tr("Decision", "确认状态"),
                    dataIndex: "decision",
                    render: (decision) => (
                      <Tag
                        color={
                          decision === "accepted"
                            ? "green"
                            : decision === "excluded"
                              ? "default"
                              : "orange"
                        }
                      >
                        {decisions[decision]}
                      </Tag>
                    ),
                  },
                  {
                    title: tr("Action", "操作"),
                    render: (_, item) => (
                      <Button
                        type="link"
                        disabled={pending}
                        onClick={() => setDetail({ id: item.id, category })}
                      >
                        {tr("View & edit", "查看并编辑")}
                      </Button>
                    ),
                  },
                ]}
              />
            </section>
            {(run.steps || []).length > 0 && (
              <details className="ab-panel sd-analysis">
                <summary>
                  {tr("How these proposals were made", "查看提案生成过程")}
                </summary>
                {run.steps.map((s, i) => (
                  <p key={i}>
                    <Tag>{s.method}</Tag>
                    {s.message}
                  </p>
                ))}
              </details>
            )}
          </>
        ) : stage === 2 ? (
          <>
            <section className="ab-panel">
              <div className="ab-section-heading">
                <div>
                  <h3>{tr("Definition changes", "定义差异")}</h3>
                  <p>
                    {tr(
                      "Review proposed changes against the active ontology. Reused definitions remain intact.",
                      "对照当前生效本体检查变更，复用项保留原定义。",
                    )}
                  </p>
                </div>
                <Tag>
                  {preview?.summary?.errors || 0}{" "}
                  {tr("blocking issues", "项阻塞")}
                </Tag>
              </div>
              {(preview?.definitions || []).map((d, i) => (
                <details className="sd-diff" key={i} open={i === 0}>
                  <summary>
                    <Tag
                      color={
                        d.change === "add"
                          ? "green"
                          : d.change === "extend"
                            ? "blue"
                            : "default"
                      }
                    >
                      {{
                        add: tr("Add", "新增"),
                        extend: tr("Extend", "扩展"),
                        reuse: tr("Reuse", "复用"),
                      }[d.change] || d.change}
                    </Tag>
                    <b>{d.name}</b>
                    <span className="ab-muted">{d.category}</span>
                  </summary>
                  <div className="sd-diff-columns">
                    <div>
                      <h4>{tr("Active definition", "当前定义")}</h4>
                      <pre>
                        {d.before
                          ? json(d.before)
                          : tr("No existing definition", "当前无此定义")}
                      </pre>
                    </div>
                    <div>
                      <h4>{tr("Proposed definition", "提议定义")}</h4>
                      <pre>{json(d.after)}</pre>
                    </div>
                  </div>
                </details>
              ))}
            </section>
            {issues.length > 0 && (
              <section className="ab-panel">
                <h3>{tr("Checks & decisions", "校验与待决策项")}</h3>
                {issues.map((issue, i) => (
                  <div className="sd-issue" key={i}>
                    <Tag color={issue.level === "error" ? "red" : "orange"}>
                      {issue.code}
                    </Tag>
                    <span>{issue.message}</span>
                    {issue.candidate_id && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          const c = objects.some(
                            (o) => o.id === issue.candidate_id,
                          )
                            ? "objects"
                            : "links";
                          setStage(1);
                          setDetail({ category: c, id: issue.candidate_id });
                        }}
                      >
                        {tr("Resolve", "处理")}
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            )}
            <section className="ab-panel">
              <Checkbox
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
                disabled={
                  dirty ||
                  !!preview?.summary?.errors ||
                  !!preview?.summary?.pending
                }
              >
                {tr(
                  "I reviewed the definitions and source bindings. Save as a draft without activating it.",
                  "我已检查定义与来源绑定，保存为草稿，暂不生效。",
                )}
              </Checkbox>
            </section>
          </>
        ) : (
          <>
            <section className="ab-panel sd-saved">
              <div className="sd-saved-icon">
                <ApartmentOutlined />
              </div>
              <div>
                <Tag color="blue">
                  {tr("Draft · not active", "草稿 · 未生效")}
                </Tag>
                <h3>
                  {tr("Your schema design is saved", "本体设计草稿已保存")}
                </h3>
                <p className="ab-muted">
                  {tr(
                    "Export the reviewed definitions and source bindings for implementation. They are not available to the import pipeline or graph query until runtime integration is completed.",
                    "可导出已确认的定义和来源绑定用于后续接入。完成运行时集成之前，导入流程和图谱查询仍使用原有本体。",
                  )}
                </p>
                <p className="ab-muted">{run?.saved_at}</p>
              </div>
            </section>
            <section className="ab-panel">
              <div className="ab-section-heading">
                <div>
                  <h3>{tr("Definition package", "定义文件包")}</h3>
                  <p>
                    {tr(
                      "Complete object and relationship definitions, source mappings and handoff notes.",
                      "包含完整对象与关系定义、来源映射及接入说明。",
                    )}
                  </p>
                </div>
              </div>
              {exported ? (
                <>
                  {exported.files.map((file) => (
                    <div className="ab-file" key={file.name}>
                      <FileTextOutlined />
                      <div>
                        <b>{file.name}</b>
                        <small>
                          {new Blob([file.content]).size.toLocaleString()} bytes
                        </small>
                      </div>
                      <Button
                        aria-label={tr("Download", "下载")}
                        icon={<DownloadOutlined />}
                        onClick={() => download(file.name, file.content)}
                      >
                        {tr("Download", "下载")}
                      </Button>
                    </div>
                  ))}
                  <Button
                    className="sd-package-download"
                    icon={<DownloadOutlined />}
                    onClick={() =>
                      download(`schema-design-${run.id}.json`, json(exported))
                    }
                  >
                    {tr(
                      "Download complete package (JSON)",
                      "下载完整文件包（JSON）",
                    )}
                  </Button>
                </>
              ) : (
                <Spin />
              )}
            </section>
            <section className="ab-panel">
              <h3>{tr("What happens next?", "接下来如何使用？")}</h3>
              <p className="ab-muted">
                {tr(
                  "Review the exported YAML in a feature branch, integrate schema consumers and source bindings, and run import/query regression before activation. This draft does not add rules, actions or metrics.",
                  "在功能分支检查导出的 YAML，接入定义读取与来源映射，并通过导入、查询回归后再启用。这份草稿不生成规则、动作或指标。",
                )}
              </p>
              <Button onClick={() => navigate("/pipeline?mode=assisted")}>
                {tr("Open existing-schema importer", "打开已有本体导入")}
              </Button>
            </section>
          </>
        )}
      </main>
      <footer className="ab-footer">
        <Button
          aria-label={tr("Previous", "上一步")}
          icon={<ArrowLeftOutlined />}
          disabled={stage === 0 || locked}
          onClick={() => setStage((s) => s - 1)}
        >
          {tr("Previous", "上一步")}
        </Button>
        <span>{stage + 1} / 4</span>
        <div>
          {stage === 0 ? (
            <Button
              type="primary"
              icon={<ApartmentOutlined />}
              loading={pending}
              disabled={!goal.trim() || !files.length || !!run}
              onClick={start}
            >
              {tr("Propose schema", "生成定义草稿")}
            </Button>
          ) : stage === 1 ? (
            <Button
              type="primary"
              loading={pending}
              disabled={locked}
              onClick={changed}
            >
              {tr("Validate & preview changes", "校验并预览差异")}
              <ArrowRightOutlined />
            </Button>
          ) : stage === 2 ? (
            <Button
              type="primary"
              loading={pending}
              disabled={
                !reviewed ||
                dirty ||
                !preview ||
                !!preview.summary?.errors ||
                locked
              }
              onClick={save}
            >
              {tr("Save schema draft", "保存 Schema 草稿")}
            </Button>
          ) : (
            <Button onClick={() => setStage(1)}>
              {tr("Continue refining", "继续完善")}
            </Button>
          )}
        </div>
      </footer>
      {selected && (
        <SchemaDefinitionDrawer
          entry={selected}
          category={detail.category}
          sources={run?.sources || []}
          objects={objects}
          activeSchema={activeSchema}
          issues={issues}
          onChange={update}
          onClose={() => setDetail(null)}
          tr={tr}
        />
      )}
      <Drawer
        title={tr("Schema design history", "Schema 设计记录")}
        width={560}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      >
        {!history.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        {history.map((item) => (
          <div className="sd-history" key={item.id}>
            <div>
              <b>{item.goal}</b>
              <p>
                <Tag>{states[item.status] || item.status}</Tag>
                <small>{item.id}</small>
              </p>
            </div>
            <Space>
              <Button
                disabled={pending}
                size="small"
                onClick={() => choose(item)}
              >
                {tr("Open", "打开")}
              </Button>
              <Popconfirm
                title={tr(
                  "Delete this local draft and its uploads?",
                  "删除本地草稿及其上传文件？",
                )}
                onConfirm={() => remove(item.id)}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${item.id}`}
                />
              </Popconfirm>
            </Space>
          </div>
        ))}
      </Drawer>
    </div>
  );
}
