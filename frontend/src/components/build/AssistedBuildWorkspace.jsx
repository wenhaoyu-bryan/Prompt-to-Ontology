import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Input,
  Popconfirm,
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
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../providers/dataProvider";
import MappingEditor from "./MappingEditor";
import "./assistedBuild.css";

const { TextArea } = Input;
const { Text } = Typography;
const busyRun = (r) => ["queued", "analyzing"].includes(r?.status);
const show = (v) =>
  typeof v === "object" ? JSON.stringify(v) : String(v ?? "—");

export default function AssistedBuildWorkspace() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const tr = (en, cn) => (zh ? cn : en);
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const runId = params.get("run");
  const [run, setRun] = useState(null);
  const [files, setFiles] = useState([]);
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState("auto");
  const [catalog, setCatalog] = useState(null);
  const [stage, setStage] = useState(0);
  const [pending, setPending] = useState(false);
  const [pollEpoch, setPollEpoch] = useState(0);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [sourceId, setSourceId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [detail, setDetail] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [verified, setVerified] = useState(null);
  const recoverable = ["interrupted", "failed"].includes(run?.status);
  const locked = busyRun(run) || pending || recoverable;
  const submitted = run?.status === "submitted";
  const immutable = submitted || run?.status === "submitting";
  const dirty =
    !!run && JSON.stringify(drafts) !== JSON.stringify(run.sources || []);
  const schema = catalog?.schema || {};
  const preview = run?.preview;
  const summary = preview?.summary || {};
  const stages = [
    tr("Sources", "来源文件"),
    tr("Mappings", "映射校准"),
    tr("Preview", "构建预览"),
    tr("Review", "提交审核"),
    tr("Verify", "结果验证"),
  ];
  const labels = {
    queued: tr("Queued", "等待执行"),
    interrupted: tr("Analysis interrupted", "分析已中断"),
    analyzing: tr("Analyzing sources", "正在分析来源"),
    needs_confirmation: tr("Review mappings", "待确认映射"),
    ready: tr("Ready for review", "可提交审核"),
    submitting: tr("Submission awaiting confirmation", "提交待确认"),
    submitted: tr("Submitted", "已提交审核"),
    failed: tr("Analysis failed", "分析失败"),
  };
  const report = (e) => {
    const d = e.response?.data?.detail;
    setError(
      typeof d === "string"
        ? d
        : tr(
            "Could not complete this action. Check the inputs and retry.",
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
  const openRun = async (id) => {
    const { data } = await api.get(`/assisted-build/runs/${id}`);
    setRun(data);
    return data;
  };
  useEffect(() => {
    api
      .get("/assisted-build/schema")
      .then((r) => setCatalog(r.data))
      .catch(report);
  }, []);
  useEffect(() => {
    let alive = true;
    let timer;
    if (!runId) {
      setRun(null);
      return;
    }
    const poll = async () => {
      try {
        const { data } = await api.get(`/assisted-build/runs/${runId}`);
        if (!alive) return;
        setRun(data);
        if (busyRun(data)) timer = setTimeout(poll, 1500);
      } catch (e) {
        if (alive) report(e);
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [runId, pollEpoch]);
  useEffect(() => {
    if (!run) return;
    setDrafts(structuredClone(run.sources || []));
    setSourceId((s) =>
      (run.sources || []).some((x) => x.id === s) ? s : run.sources?.[0]?.id,
    );
    setReviewed(false);
    setVerified(null);
  }, [run?.id, run?.revision, run?.status]);
  const chooseRun = (r) => {
    setRun(r);
    setParams({ mode: "assisted", run: r.id });
    setStage(
      ["submitted", "submitting"].includes(r.status) ? 3 : r.preview ? 2 : 1,
    );
    setHistoryOpen(false);
    setError("");
  };
  const newRun = () => {
    setParams({ mode: "assisted" });
    setRun(null);
    setStage(0);
    setVerified(null);
    setError("");
  };
  const loadSamples = () =>
    act(async () => {
      const { data } = await api.get("/assisted-build/sample-files");
      setFiles(data.files);
      setGoal(
        zh
          ? "将这些产品、成分与关系整理为可审核的构建计划，之后查询哪些产品含鸡肉。"
          : data.goal,
      );
    });
  const addFile = async (file) => {
    try {
      if (file.size > 2_000_000)
        throw Error(
          tr("Each file must be under 2 MB.", "单个文件不能超过 2 MB。"),
        );
      if (!/\.(csv|json|ndjson|jsonl)$/i.test(file.name))
        throw Error(
          tr(
            "Choose CSV, JSON or NDJSON files.",
            "请选择 CSV、JSON 或 NDJSON 文件。",
          ),
        );
      const content = await file.text();
      setFiles((prev) => {
        if (prev.length >= 8) {
          message.error(
            tr("Up to 8 files per build.", "每个任务最多 8 个文件。"),
          );
          return prev;
        }
        return [...prev, { name: file.name, content }];
      });
    } catch (e) {
      message.error(e.message);
    }
    return false;
  };
  const start = () =>
    act(async () => {
      const { data } = await api.post("/assisted-build/runs", {
        goal,
        files,
        execution_mode: mode,
      });
      chooseRun(data);
    });
  const editSource = (next) =>
    setDrafts((d) => d.map((s) => (s.id === next.id ? next : s)));
  const validate = () =>
    act(async () => {
      const { data: saved } = await api.put(
        `/assisted-build/runs/${run.id}/mappings`,
        { expected_revision: run.revision, sources: drafts },
      );
      setRun(saved);
      const { data } = await api.post(
        `/assisted-build/runs/${run.id}/preview`,
        { expected_revision: saved.revision },
      );
      setRun(data);
      setStage(2);
    });
  const submit = () =>
    act(async () => {
      const { data } = await api.post(`/assisted-build/runs/${run.id}/submit`, {
        expected_revision: run.revision,
        preview_hash: preview.hash,
      });
      setRun(data);
      message.success(
        tr("Build plan submitted to Review Queue.", "构建计划已提交审核队列。"),
      );
    });
  const verify = () =>
    act(async () => {
      const { data } = await api.get(`/assisted-build/runs/${run.id}/verify`);
      setVerified(data);
    });
  const retry = () =>
    act(async () => {
      const { data } = await api.post(`/assisted-build/runs/${run.id}/retry`, {
        expected_revision: run.revision,
      });
      setRun(data);
      setStage(1);
      setPollEpoch((value) => value + 1);
    });
  const remove = (id) =>
    act(async () => {
      await api.delete(`/assisted-build/runs/${id}`);
      if (run?.id === id) newRun();
      setHistory((h) => h.filter((r) => r.id !== id));
    });
  const issues = preview?.issues || run?.issues || [];
  const counts = [
    tr("Objects", "对象"),
    tr("Relationships", "关系"),
    tr("Existing objects", "已有对象"),
    tr("Blocking issues", "阻塞问题"),
  ];
  const values = [
    summary.objects ?? preview?.objects?.length ?? 0,
    summary.links ?? preview?.links?.length ?? 0,
    summary.existing_objects ?? 0,
    summary.errors ??
      issues.filter((x) => ["error", "critical"].includes(x.level)).length,
  ];
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
      className="assisted-build"
      style={variables}
      data-testid="assisted-build"
    >
      <header className="ab-page-header">
        <div>
          <Typography.Title level={3}>
            {tr("Build with your data", "从你的数据开始构建")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {tr(
              "Describe your goal. Review the decisions that need you.",
              "说明构建目标，只处理需要你判断的决定。",
            )}
          </Typography.Text>
        </div>
        <Space wrap>
          <Button onClick={() => navigate("/pipeline?mode=schema")}>
            {tr("Design new schema", "设计新本体")}
          </Button>
          <Button onClick={() => navigate("/pipeline")}>
            {tr("Manual configuration", "手动配置")}
          </Button>
          <Button
            icon={<HistoryOutlined />}
            onClick={() =>
              act(async () => {
                const { data } = await api.get("/assisted-build/runs");
                setHistory(data.runs || []);
                setHistoryOpen(true);
              })
            }
          >
            {tr("Build history", "构建记录")}
          </Button>
          {run && (
            <Button icon={<PlusOutlined />} onClick={newRun}>
              {tr("New build", "新建构建")}
            </Button>
          )}
        </Space>
      </header>
      <div className="ab-progress">
        <div className="ab-run-caption">
          <span>
            {run?.goal ||
              tr("Pet Food · Assisted build", "Pet Food · 辅助构建")}
          </span>
          {run && (
            <Tag
              color={submitted ? "green" : busyRun(run) ? "processing" : "blue"}
            >
              {labels[run.status] || run.status}
            </Tag>
          )}
        </div>
        <Steps
          size="small"
          responsive={false}
          current={stage}
          items={stages.map((title, i) => ({
            title,
            disabled:
              (i > 0 && !run) ||
              (i >= 2 && (!preview || dirty)) ||
              (i === 4 && !submitted),
          }))}
          onChange={setStage}
        />
      </div>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          onClose={() => setError("")}
        />
      )}
      {recoverable && (
        <Alert
          type="warning"
          showIcon
          message={tr(
            "Analysis was interrupted. Your source files are retained.",
            "分析已中断，来源文件已保留。",
          )}
          description={tr(
            "Retry to continue with the current model configuration.",
            "重试将使用当前模型配置继续分析。",
          )}
        />
      )}
      <main
        className="ab-stage"
        aria-label={tr("Build stage content", "构建阶段内容")}
      >
        {(!run && runId) || busyRun(run) ? (
          <div className="ab-loading">
            <Spin size="large" />
            <h3>{tr("Inspecting your sources", "正在检查你的来源文件")}</h3>
            <p>
              {tr(
                "The task is saved. You can reopen it from build history.",
                "任务已保存，可以从构建记录重新打开。",
              )}
            </p>
            <div>
              {(run?.steps || []).map((s, i) => (
                <div key={i}>
                  {s.tool || s.method || s.name} · {s.status}
                </div>
              ))}
            </div>
          </div>
        ) : stage === 0 ? (
          <div className="ab-source-layout">
            <section className="ab-panel">
              <div className="ab-section-heading">
                <div>
                  <h3>
                    {tr("What would you like to build?", "你想构建什么？")}
                  </h3>
                  <p>
                    {tr(
                      "A concrete question helps guide the mappings.",
                      "用一个具体问题说明数据需要支持什么。",
                    )}
                  </p>
                </div>
                <Tag>Pet Food</Tag>
              </div>
              <label className="ab-label" htmlFor="build-goal">
                {tr("Build goal", "构建目标")}
              </label>
              <TextArea
                id="build-goal"
                value={run?.goal || goal}
                disabled={!!run}
                onChange={(e) => setGoal(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={tr(
                  "Connect products to their ingredients so I can find products containing chicken.",
                  "关联产品与成分，让我能查出哪些产品含鸡肉。",
                )}
              />
              <div className="ab-label">
                {tr("Mapping assistant", "映射助手")}
              </div>
              <Select
                aria-label="Mapping execution mode"
                value={run?.execution_mode || mode}
                disabled={!!run}
                onChange={setMode}
                options={[
                  {
                    value: "auto",
                    label: tr(
                      "Use configured model · deterministic fallback",
                      "使用已配置模型 · 不可用时确定性回退",
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
                style={{ width: "100%" }}
              />
              <p className="ab-muted">
                {catalog?.model?.configured
                  ? `${catalog.model.provider} · ${catalog.model.model}`
                  : tr(
                      "No model configured. You can still map files and complete the build.",
                      "未配置模型，仍可映射文件并完成构建。",
                    )}
              </p>
              <Alert
                type="info"
                showIcon
                message={tr(
                  "Uses the existing Pet Food definitions",
                  "使用现有 Pet Food 定义",
                )}
                description={tr(
                  "The assistant prepares candidates. Changes enter the graph through Review Queue.",
                  "助手整理候选方案，变更通过审核队列应用到图谱。",
                )}
              />
            </section>
            <section className="ab-panel">
              <div className="ab-section-heading">
                <div>
                  <h3>{tr("Source files", "来源文件")}</h3>
                  <p>
                    {tr(
                      "Upload related files together. CSV, flat JSON, NDJSON · up to 8 files, 2 MB each.",
                      "相关文件一起上传。CSV、扁平 JSON、NDJSON；最多 8 个，每个 2 MB。",
                    )}
                  </p>
                </div>
                <Button onClick={loadSamples} disabled={pending || !!run}>
                  {tr("Try sample bundle", "试用样例文件")}
                </Button>
              </div>
              <Upload.Dragger
                multiple
                showUploadList={false}
                beforeUpload={addFile}
                accept=".csv,.json,.ndjson,.jsonl"
                disabled={locked || !!run}
              >
                <p className="ant-upload-drag-icon">
                  <CloudUploadOutlined />
                </p>
                <p className="ant-upload-text">
                  {tr("Drop your source files here", "将来源文件拖到这里")}
                </p>
                <p className="ant-upload-hint">
                  {tr("or click to choose files", "或点击选择文件")}
                </p>
              </Upload.Dragger>
              <div className="ab-files">
                {(run ? run.sources : files).map((f, i) => (
                  <div className="ab-file" key={`${f.name}-${i}`}>
                    <FileTextOutlined />
                    <div>
                      <b>{f.name}</b>
                      <small>
                        {run
                          ? `${f.row_count} ${tr("rows", "行")}`
                          : `${new Blob([f.content]).size.toLocaleString()} B`}
                      </small>
                    </div>
                    <Button
                      disabled={!!run}
                      type="text"
                      icon={<DeleteOutlined />}
                      aria-label={`${tr("Remove", "移除")} ${f.name}`}
                      onClick={() =>
                        setFiles((x) => x.filter((_, j) => j !== i))
                      }
                    />
                  </div>
                ))}
              </div>
              {!files.length && (
                <p className="ab-muted">
                  {tr(
                    "Local build tasks retain uploaded data until you delete the task.",
                    "本地构建任务会保留上传内容，删除任务即可清除。",
                  )}
                </p>
              )}
            </section>
          </div>
        ) : stage === 1 ? (
          <div className="ab-mapping-layout">
            <aside className="ab-source-nav">
              <h4>{tr("Sources", "来源文件")}</h4>
              {drafts.map((s) => (
                <button
                  className={s.id === sourceId ? "selected" : ""}
                  key={s.id}
                  onClick={() => setSourceId(s.id)}
                >
                  <FileTextOutlined />
                  <span>
                    {s.name}
                    <small>
                      {s.row_count} {tr("rows", "行")}
                      {s.excluded ? ` · ${tr("Excluded", "已排除")}` : ""}
                    </small>
                  </span>
                </button>
              ))}
              {(run?.steps || []).length > 0 && (
                <details className="ab-tool-log">
                  <summary>{tr("Assistant activity", "助手执行记录")}</summary>
                  {run.steps.map((s, i) => (
                    <p key={i}>
                      <code>{s.tool || s.method || s.name}</code>
                      <br />
                      {s.status}
                      {s.message ? ` · ${s.message}` : ""}
                    </p>
                  ))}
                </details>
              )}
            </aside>
            <section className="ab-panel">
              {drafts.find((s) => s.id === sourceId) ? (
                <MappingEditor
                  source={drafts.find((s) => s.id === sourceId)}
                  schema={schema}
                  onChange={editSource}
                  zh={zh}
                  disabled={immutable || locked}
                />
              ) : (
                <Empty />
              )}
            </section>
          </div>
        ) : stage === 2 ? (
          <>
            <div className="ab-summary">
              {counts.map((label, i) => (
                <div key={label}>
                  <span>{label}</span>
                  <b>{values[i]}</b>
                </div>
              ))}
            </div>
            {!!issues.length && (
              <section className="ab-panel ab-issues">
                <h3>{tr("Checks to review", "待处理检查")}</h3>
                {issues.map((issue, i) => (
                  <div className={`ab-issue ${issue.level}`} key={i}>
                    <Tag
                      color={
                        ["error", "critical"].includes(issue.level)
                          ? "red"
                          : "orange"
                      }
                    >
                      {issue.code}
                    </Tag>
                    <span>{issue.message}</span>
                    {issue.source_id && (
                      <Button
                        size="small"
                        onClick={() => {
                          setSourceId(issue.source_id);
                          setStage(1);
                        }}
                      >
                        {tr("Edit mapping", "修改映射")}
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            )}
            <section className="ab-panel">
              <h3>{tr("Candidate changes", "候选变更")}</h3>
              <Table
                size="small"
                rowKey={(r) =>
                  `${r.type}-${r.id || `${r.source_id}-${r.target_id}`}`
                }
                dataSource={[
                  ...(preview?.objects || []),
                  ...(preview?.links || []),
                ]}
                pagination={{ pageSize: 8 }}
                scroll={{ x: 650 }}
                columns={[
                  {
                    title: tr("Type", "类型"),
                    dataIndex: "type",
                    width: 170,
                    render: (v) => <Tag>{v}</Tag>,
                  },
                  {
                    title: tr("Identity / relationship", "标识 / 关系"),
                    render: (_, r) => r.id || `${r.source_id} → ${r.target_id}`,
                  },
                  {
                    title: tr("Change", "变更"),
                    render: (_, r) =>
                      r.changes && Object.keys(r.changes).length ? (
                        <Tag color="orange">
                          {tr("Compare properties", "属性变化")}
                        </Tag>
                      ) : (
                        <Text>{tr("Candidate", "候选")}</Text>
                      ),
                  },
                  {
                    title: tr("Details", "详情"),
                    width: 90,
                    render: (_, r) => (
                      <Button type="link" onClick={() => setDetail(r)}>
                        {tr("View", "查看")}
                      </Button>
                    ),
                  },
                ]}
              />
            </section>
          </>
        ) : stage === 3 ? (
          <section className="ab-panel ab-review">
            <CheckCircleOutlined className="ab-review-icon" />
            <h2>
              {submitted
                ? tr("Your build is in Review Queue", "构建计划已进入审核队列")
                : tr("Review this build plan", "检查这份构建计划")}
            </h2>
            <p>{run?.goal}</p>
            <div className="ab-review-totals">
              <b>
                {summary.objects || 0} {tr("objects", "个对象")}
              </b>
              <b>
                {summary.links || 0} {tr("relationships", "条关系")}
              </b>
              <b>
                {drafts.filter((s) => !s.excluded).length}{" "}
                {tr("sources", "个来源")}
              </b>
            </div>
            {submitted ? (
              <>
                <Tag color="green">{run.review_batch_id}</Tag>
                <p>
                  {tr(
                    "Approve and apply the batch in Review Queue, then verify the runtime result here.",
                    "在审核队列批准并应用这批变更后，回到这里验证实际结果。",
                  )}
                </p>
                <Button type="primary" onClick={() => navigate("/review")}>
                  {tr("Open Review Queue", "打开审核队列")}
                </Button>
              </>
            ) : (
              <>
                <Alert
                  showIcon
                  type="info"
                  message={tr(
                    "Submission creates review items; it does not apply graph changes.",
                    "提交会创建审核项，图谱变更仍需在审核队列应用。",
                  )}
                />
                <Checkbox
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                >
                  {tr(
                    "I reviewed the mappings, source evidence and candidate changes for this version.",
                    "我已核对本版本的映射、来源依据和候选变更。",
                  )}
                </Checkbox>
              </>
            )}
          </section>
        ) : (
          <section className="ab-panel">
            <div className="ab-section-heading">
              <div>
                <h3>{tr("Verify the runtime graph", "验证运行时图谱")}</h3>
                <p>
                  {tr(
                    "Checks the expected objects and relationships against Neo4j after review and application.",
                    "审核并应用后，从 Neo4j 核对预期对象和关系。",
                  )}
                </p>
              </div>
              <Button
                icon={<ReloadOutlined />}
                onClick={verify}
                loading={pending}
              >
                {tr("Check runtime graph", "检查运行时图谱")}
              </Button>
            </div>
            {!verified ? (
              <Empty
                description={tr(
                  "Apply the review batch before checking its result.",
                  "请先应用审核批次，再检查结果。",
                )}
              />
            ) : (
              <>
                <Alert
                  type={
                    verified.status === "matched"
                      ? verified.applied === true
                        ? "success"
                        : "info"
                      : verified.status === "unavailable"
                        ? "error"
                        : "warning"
                  }
                  showIcon
                  message={
                    verified.status === "matched"
                      ? tr(
                          "Expected changes matched the runtime graph",
                          "预期变更与运行时图谱匹配",
                        )
                      : tr(
                          "Some expected changes are not confirmed",
                          "部分预期变更尚未确认",
                        )
                  }
                  description={`${verified.objects_found ?? 0}/${verified.objects_expected ?? 0} ${tr("objects", "对象")} · ${verified.links_found ?? 0}/${verified.links_expected ?? 0} ${tr("relationships", "关系")}`}
                />
                <div style={{ marginTop: 16 }}>
                  <Tag
                    color={
                      verified.applied === true
                        ? "green"
                        : verified.applied === false
                          ? "gold"
                          : "default"
                    }
                  >
                    {verified.applied === true
                      ? tr("Review batch applied", "审核批次已应用")
                      : verified.applied === false
                        ? tr("Review batch not applied", "审核批次尚未应用")
                        : tr(
                            "Review application status unavailable",
                            "审核应用状态不可用",
                          )}
                  </Tag>
                </div>
                {(verified.issues || []).map((v, i) => (
                  <p key={i}>{show(v.message || v)}</p>
                ))}
                {["missing_objects", "missing_links", "mismatches"].map(
                  (key) =>
                    !!verified[key]?.length && (
                      <details key={key} open>
                        <summary>{key}</summary>
                        <pre>{JSON.stringify(verified[key], null, 2)}</pre>
                      </details>
                    ),
                )}
                <p className="ab-muted">
                  {tr(
                    "Graph matching verifies this import, not the correctness of every Agent answer.",
                    "图谱核对验证此次导入结果，不代表所有 Agent 回答均正确。",
                  )}
                </p>
                <Button onClick={() => navigate("/agent")}>
                  {tr("Ask the Analyst Agent", "向查询 Agent 提问")}
                </Button>
              </>
            )}
          </section>
        )}
      </main>
      <footer className="ab-footer">
        <Button
          icon={<ArrowLeftOutlined />}
          disabled={stage === 0 || locked}
          onClick={() => setStage((s) => s - 1)}
        >
          {tr("Previous", "上一步")}
        </Button>
        <span>
          {tr("Step", "步骤")} {stage + 1} / 5
          {run && ` · ${tr("Revision", "版本")} ${run.revision}`}
        </span>
        <div>
          {recoverable ? (
            <Button type="primary" loading={pending} onClick={retry}>
              {tr("Retry analysis", "重试分析")}
            </Button>
          ) : stage === 0 && run ? (
            <Button
              type="primary"
              disabled={locked}
              onClick={() => setStage(1)}
            >
              {tr("Review mappings", "查看映射")} <ArrowRightOutlined />
            </Button>
          ) : stage === 0 ? (
            <Button
              type="primary"
              icon={<RocketOutlined />}
              disabled={!files.length || !goal.trim() || locked}
              loading={pending}
              onClick={start}
            >
              {tr("Analyze files", "分析文件")}
            </Button>
          ) : stage === 1 ? (
            <Button
              type="primary"
              disabled={locked || immutable}
              loading={pending}
              onClick={validate}
            >
              {tr("Confirm mappings & preview", "确认映射并预览")}{" "}
              <ArrowRightOutlined />
            </Button>
          ) : stage === 2 ? (
            <Button
              type="primary"
              disabled={locked || values[3] > 0 || (!values[0] && !values[1])}
              onClick={() => setStage(3)}
            >
              {tr("Review build plan", "检查构建计划")} <ArrowRightOutlined />
            </Button>
          ) : stage === 3 ? (
            submitted ? (
              <Button type="primary" onClick={() => setStage(4)}>
                {tr("Verify result", "验证结果")} <ArrowRightOutlined />
              </Button>
            ) : (
              <Button
                type="primary"
                disabled={!reviewed || locked || values[3] > 0}
                loading={pending}
                onClick={submit}
              >
                {tr("Submit to Review Queue", "提交审核队列")}
              </Button>
            )
          ) : (
            <Button onClick={() => navigate("/graph")}>
              {tr("Explore graph", "探索图谱")} <ArrowRightOutlined />
            </Button>
          )}
        </div>
      </footer>
      <Drawer
        width={480}
        title={tr("Build history", "构建记录")}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      >
        {history.length ? (
          history.map((r) => (
            <div className="ab-history-item" key={r.id}>
              <button onClick={() => chooseRun(r)}>
                <b>{r.goal || r.id}</b>
                <small>
                  {labels[r.status] || r.status} · {r.created_at || r.id}
                </small>
              </button>
              <Popconfirm
                title={tr(
                  "Delete this local task and its uploaded files? Review records and graph data remain.",
                  "删除本地任务和上传文件？审核记录与图谱数据会保留。",
                )}
                onConfirm={() => remove(r.id)}
              >
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  aria-label={tr("Delete build", "删除构建")}
                />
              </Popconfirm>
            </div>
          ))
        ) : (
          <Empty />
        )}
      </Drawer>
      <Drawer
        width={600}
        title={tr("Candidate details", "候选详情")}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <h3>{detail.id || `${detail.source_id} → ${detail.target_id}`}</h3>
            <Tag>{detail.type}</Tag>
            <p>{detail.evidence}</p>
            {detail.lineage?.length > 0 && (
              <>
                <h4>{tr("Source records", "来源记录")}</h4>
                {detail.lineage.map((item, i) => (
                  <p key={i}>
                    <Button
                      type="link"
                      onClick={() => {
                        setDetail(null);
                        setSourceId(item.source_id);
                        setStage(1);
                      }}
                    >
                      {run.sources.find((s) => s.id === item.source_id)?.name ||
                        item.source_id}
                    </Button>{" "}
                    · {tr("data row", "数据行")} {item.row + 1}
                  </p>
                ))}
              </>
            )}
            {detail.changes && (
              <>
                <h4>{tr("Property changes", "属性变化")}</h4>
                <pre>{JSON.stringify(detail.changes, null, 2)}</pre>
              </>
            )}
            <h4>{tr("Properties", "属性")}</h4>
            <Table
              size="small"
              pagination={false}
              dataSource={Object.entries(detail.properties || {}).map(
                ([key, value]) => ({ key, value }),
              )}
              columns={[
                { title: tr("Property", "属性"), dataIndex: "key" },
                { title: tr("Value", "值"), dataIndex: "value", render: show },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
}
