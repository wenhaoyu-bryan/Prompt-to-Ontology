import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Collapse,
  Drawer,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
  theme,
} from "antd";
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { api } from "../../providers/dataProvider";
import AnswerEvidence from "../query/AnswerEvidence";
import LlmConfigDialog from "../query/LlmConfigDialog";
import "./queryEvaluation.css";

const API = "/agent/question-evaluations";
const time = (value) => (value ? new Date(value).toLocaleString() : "—");
const errorText = (error) =>
  typeof error.response?.data?.detail === "string"
    ? error.response.data.detail
    : "The request did not complete.";

export default function QueryEvaluationPage() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const tr = (en, cn) => (zh ? cn : en);
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [cases, setCases] = useState([]);
  const [latest, setLatest] = useState({});
  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [selectedId, setSelectedId] = useState(params.get("case") || "");
  const [panel, setPanel] = useState(
    params.get("panel") === "feedback" ? "feedback" : "cases",
  );
  const [feedback, setFeedback] = useState([]);
  const [feedbackId, setFeedbackId] = useState(params.get("feedback") || "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [asset, setAsset] = useState(params.get("asset") || "");
  const [model, setModel] = useState(null);
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [compareId, setCompareId] = useState("");
  const [form] = Form.useForm();
  const selected = cases.find((item) => item.id === selectedId);
  const result = run?.results?.[selectedId];
  const snapshot = run?.case_snapshots?.find((item) => item.id === selectedId);
  const selectedFeedback = feedback.find((item) => item.id === feedbackId);
  const running =
    run?.status === "running" || runs.some((item) => item.status === "running");
  const assets = [...new Set(cases.flatMap((item) => item.assets))].sort();
  const resultFor = (item) =>
    run?.case_snapshots?.find((row) => row.id === item.id)?.criteria_hash ===
    item.criteria_hash
      ? run?.results?.[item.id] || latest[item.id]
      : latest[item.id];
  const caseStatus = (item) => resultFor(item)?.status || "not_run";
  const visible = cases
    .filter((item) => !asset || item.assets.includes(asset))
    .filter((item) =>
      `${item.question} ${item.expected} ${item.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter((item) => filter === "all" || caseStatus(item) === filter);
  const visibleFeedback = feedback
    .filter((item) =>
      `${item.question} ${item.category} ${item.comment} ${item.agent_run_id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter(
      (item) =>
        filter === "all" || (item.review_status || "pending") === filter,
    );
  const priorRuns = runs.filter(
    (item) =>
      item.id !== run?.id &&
      item.completed_case_ids?.includes(selectedId) &&
      item.status !== "running" &&
      item.started_at < run?.started_at,
  );
  const labels = {
    passed: tr("Checks passed", "检查通过"),
    needs_review: tr("Needs review", "需复核"),
    failed: tr("Failed", "运行失败"),
    not_run: tr("Not run", "未运行"),
    pending: tr("Pending", "待复核"),
    processed: tr("Processed", "已处理"),
    running: tr("Running", "运行中"),
    completed: tr("Completed", "已完成"),
    interrupted: tr("Interrupted", "已中断"),
    reviewed: tr("Manually reviewed", "已人工复核"),
  };
  const colors = {
    passed: "success",
    needs_review: "warning",
    failed: "error",
    running: "processing",
    pending: "warning",
    processed: "success",
  };
  const tag = (status) => (
    <Tag color={colors[status]}>{labels[status] || status}</Tag>
  );
  const variables = {
    "--eval-bg": token.colorBgContainer,
    "--eval-page": token.colorBgLayout,
    "--eval-border": token.colorBorderSecondary,
    "--eval-text": token.colorText,
    "--eval-muted": token.colorTextSecondary,
    "--eval-accent": token.colorPrimary,
    "--query-bg": token.colorBgContainer,
    "--query-page": token.colorBgLayout,
    "--query-border": token.colorBorderSecondary,
    "--query-text": token.colorText,
    "--query-muted": token.colorTextSecondary,
    "--query-accent": token.colorPrimary,
  };

  async function load() {
    const [catalog, history, reviews] = await Promise.all([
      api.get(`${API}/cases`),
      api.get(`${API}/runs`),
      api.get("/agent/feedback"),
    ]);
    setCases(catalog.data.cases);
    setLatest(catalog.data.latest_results || {});
    setModel(catalog.data.model);
    setMode(
      (current) =>
        current || (catalog.data.model.configured ? "model" : "deterministic"),
    );
    setRuns(history.data.runs);
    setFeedback(reviews.data.feedback);
    return {
      catalog: catalog.data,
      history: history.data.runs,
      reviews: reviews.data.feedback,
    };
  }
  useEffect(() => {
    let active = true;
    load()
      .then(async (data) => {
        if (!active) return;
        const initialRun = params.get("run") || data.history[0]?.id;
        const current = initialRun
          ? (await api.get(`${API}/runs/${initialRun}`)).data
          : null;
        if (!active) return;
        setRun(current);
        setSelectedId(
          (id) =>
            id || current?.case_ids?.[0] || data.catalog.cases[0]?.id || "",
        );
        setFeedbackId((id) => id || data.reviews[0]?.id || "");
      })
      .catch((err) => {
        if (active) setError(errorText(err));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (run?.status !== "running") return;
    let active = true;
    const timer = setInterval(() => {
      api
        .get(`${API}/runs/${run.id}`)
        .then(({ data }) => {
          if (!active) return;
          setRun(data);
          setError("");
          if (data.status !== "running")
            load().catch((err) => setError(errorText(err)));
        })
        .catch((err) => {
          if (active) setError(errorText(err));
        });
    }, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [run?.id, run?.status]);
  useEffect(() => {
    setComparison(null);
    setCompareId("");
    setReviewNote("");
  }, [selectedId, run?.id]);

  const selectCase = async (item) => {
    setSelectedId(item.id);
    let activeRun = run;
    if (!run?.case_ids?.includes(item.id) && latest[item.id]) {
      try {
        activeRun = (await api.get(`${API}/runs/${latest[item.id].run_id}`))
          .data;
        setRun(activeRun);
      } catch (err) {
        setError(errorText(err));
      }
    }
    setParams(
      {
        case: item.id,
        ...(activeRun ? { run: activeRun.id } : {}),
        ...(asset ? { asset } : {}),
      },
      { replace: true },
    );
  };
  const runCases = async (ids) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`${API}/runs`, {
        case_ids: ids,
        execution_mode: mode,
      });
      setRun(data);
      setSelectedId(ids[0]);
      setComparison(null);
      setParams(
        { run: data.id, case: ids[0], ...(asset ? { asset } : {}) },
        { replace: true },
      );
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const openEdit = (value) => {
    const item = value || {
      question: "",
      expected: "",
      assets: [],
      required_ids: [],
      product_ids: null,
      required_paths: [],
      answer_terms: [],
      forbidden_terms: [],
      evidence_terms: [],
    };
    setEdit(item);
    form.resetFields();
    form.setFieldsValue({
      ...item,
      match_products: item.product_ids != null,
      product_ids: item.product_ids || [],
    });
  };
  const saveCase = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...values,
        product_ids: values.match_products ? values.product_ids || [] : null,
        source_feedback_id: edit.source_feedback_id || null,
      };
      delete payload.match_products;
      const response = edit.id
        ? await api.put(`${API}/cases/${edit.id}`, payload)
        : await api.post(`${API}/cases`, payload);
      await load();
      setSelectedId(response.data.id);
      setPanel("cases");
      setFilter("all");
      setSearch("");
      setAsset("");
      setRun(null);
      setParams({ case: response.data.id }, { replace: true });
      setEdit(null);
      message.success(tr("Evaluation case saved", "评测用例已保存"));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    try {
      await api.patch(`/agent/feedback/${selectedFeedback.id}/review`, {
        review_status: "processed",
      });
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };
  const compare = async (value) => {
    setCompareId(value);
    try {
      const { data } = await api.get(`${API}/compare`, {
        params: { before: value, after: run.id, case_id: selectedId },
      });
      setComparison(data);
    } catch (err) {
      setError(errorText(err));
    }
  };
  const reviewAnswer = async (decision) => {
    setBusy(true);
    try {
      const { data } = await api.patch(
        `${API}/runs/${run.id}/cases/${selectedId}/review`,
        { decision, note: reviewNote },
      );
      setRun(data);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const graph = (step) =>
    navigate(
      `/graph?${new URLSearchParams({ node: step.source_id, ...(step.target_id ? { target: step.target_id, relation: step.relation } : {}), evaluation: run.id, case: selectedId })}`,
    );
  const replay = () =>
    navigate(
      `/agent?${new URLSearchParams({ question: snapshot?.question || selected.question, from: "evaluation", case: selected.id, ...(run ? { evaluation_run: run.id } : {}) })}`,
    );
  const scoreText = (value) => (value?.score == null ? "—" : `${value.score}%`);
  const checkNames = {
    facts: tr("Returned objects", "返回对象"),
    path: tr("Relationship path", "关系路径"),
    answer: tr("Answer terms and exclusions", "回答关键词与禁止内容"),
    evidence: tr("Evidence references", "证据引用"),
    abstention: tr("Missing-data tool response", "缺失数据工具状态"),
  };
  const issueLabel = (issue) => {
    if (!zh) return issue;
    const code = issue.split(":")[0];
    if (checkNames[code]) return `${checkNames[code]}：未满足配置的检查标准`;
    if (issue.startsWith("No automatic"))
      return "未设置自动检查标准，需要人工复核。";
    if (issue.startsWith("Generated missing-data"))
      return "需人工核对实际回答，确认没有编造缺失的数据。";
    if (issue.startsWith("Reviewer did not"))
      return "复核未接受该回答，请继续修正。";
    if (issue.startsWith("The configured model"))
      return "模型未生成该回答；降级回答不计为模型评测通过。";
    if (issue.startsWith("A query tool"))
      return "查询工具执行失败，请检查实际回答与运行记录。";
    if (issue.startsWith("No answer")) return "本轮未返回回答。";
    return "查询执行失败，请检查运行记录。";
  };

  return (
    <div className="eval-workspace" style={variables}>
      <header className="eval-heading">
        <div>
          <Typography.Title level={4}>
            {tr("Evaluation & feedback", "评测与反馈")}
          </Typography.Title>
          <p>
            {tr(
              "Run real queries, check defined expectations, and review what changed.",
              "用实际查询检查预期结果，集中复核问题与证据变化。",
            )}
          </p>
        </div>
        <Space wrap>
          <Button onClick={() => navigate("/verified-qa?view=reference")}>
            {tr("Reference tests · 22", "参考样例 · 22 题")}
          </Button>
          <Button onClick={() => setConfigOpen(true)}>
            {tr("Model settings", "模型设置")}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openEdit()}
            disabled={running}
          >
            {tr("Add question", "添加问题")}
          </Button>
        </Space>
      </header>
      {error && (
        <Alert
          type="error"
          closable
          title={error}
          onClose={() => setError("")}
        />
      )}
      <div className="eval-summary">
        <div>
          <span>{tr("Questions", "当前问题")}</span>
          <b>{cases.length}</b>
        </div>
        <div>
          <span>{tr("Checks passed", "检查通过")}</span>
          <b>{cases.filter((c) => caseStatus(c) === "passed").length}</b>
        </div>
        <div>
          <span>{tr("Need review", "待复核")}</span>
          <b>
            {
              cases.filter((c) =>
                ["needs_review", "failed"].includes(caseStatus(c)),
              ).length
            }
          </b>
        </div>
        <span className="eval-model">
          {model?.configured
            ? `${model.provider} · ${model.model}`
            : tr("No model configured", "未配置模型")}
          <small>
            {tr(
              "Scores reflect configured checks; semantic correctness still needs review.",
              "得分为配置检查项的通过率，语义正确性仍需业务复核。",
            )}
          </small>
        </span>
      </div>
      <div
        className="eval-tabs"
        role="tablist"
        aria-label={tr("Evaluation sections", "评测栏目")}
      >
        {[
          ["cases", tr("Evaluation questions", "评测问题")],
          ["feedback", tr("User feedback", "用户反馈")],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={panel === key}
            className={panel === key ? "active" : ""}
            key={key}
            onClick={() => {
              setPanel(key);
              setFilter("all");
              setSearch("");
            }}
          >
            {label}
            <span>
              {key === "cases"
                ? cases.length
                : feedback.filter(
                    (f) => (f.review_status || "pending") === "pending",
                  ).length}
            </span>
          </button>
        ))}
      </div>
      <div className="eval-toolbar">
        <Input
          aria-label={tr("Search evaluation", "搜索评测")}
          prefix={<SearchOutlined />}
          placeholder={tr("Search questions or feedback", "搜索问题或反馈")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        <Select
          aria-label={tr("Filter status", "筛选状态")}
          value={filter}
          onChange={setFilter}
          options={[
            "all",
            ...(panel === "cases"
              ? ["needs_review", "not_run", "passed", "reviewed", "failed"]
              : ["pending", "processed"]),
          ].map((value) => ({
            value,
            label:
              value === "all" ? tr("All statuses", "全部状态") : labels[value],
          }))}
        />
        {panel === "cases" && (
          <>
            <Select
              aria-label={tr("Related asset", "关联定义")}
              value={asset || undefined}
              allowClear
              placeholder={tr("Related asset", "关联定义")}
              options={assets.map((value) => ({ value, label: value }))}
              onChange={(value) => setAsset(value || "")}
            />
            <Select
              aria-label={tr("Execution mode", "执行方式")}
              value={mode || undefined}
              onChange={setMode}
              options={[
                { value: "model", label: tr("Current model", "当前模型") },
                {
                  value: "deterministic",
                  label: tr("Deterministic baseline", "确定性基线"),
                },
              ]}
            />
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={busy || running}
              disabled={!visible.length || !mode}
              onClick={() => runCases(visible.map((c) => c.id))}
            >
              {tr("Run question set", "运行当前问题集")} · {visible.length}
            </Button>
          </>
        )}
      </div>
      {panel === "cases" && (
        <div className="eval-run-bar">
          {run ? (
            <>
              <Tag color={colors[run.status]}>{labels[run.status]}</Tag>
              <code>{run.id}</code>
              <span>
                {run.completed}/{run.total} · {time(run.started_at)}
              </span>
            </>
          ) : (
            <span>{tr("No evaluation has run.", "问题集尚未运行。")}</span>
          )}
          <Select
            aria-label={tr("Evaluation history", "评测历史")}
            placeholder={tr("Evaluation history", "评测历史")}
            value={run?.id}
            options={runs.map((item) => ({
              value: item.id,
              label: `${time(item.started_at)} · ${item.model || tr("Baseline", "基线")} · ${item.completed}/${item.total}`,
            }))}
            onChange={async (value) => {
              try {
                const { data } = await api.get(`${API}/runs/${value}`);
                setRun(data);
                const retained = data.case_ids.includes(selectedId)
                  ? selectedId
                  : data.case_ids[0];
                setSelectedId(retained);
                setParams(
                  { run: value, case: retained, ...(asset ? { asset } : {}) },
                  { replace: true },
                );
              } catch (err) {
                setError(errorText(err));
              }
            }}
          />
        </div>
      )}
      <div className="eval-shell">
        <section
          className="eval-list"
          aria-label={tr("Question and feedback list", "问题与反馈列表")}
        >
          {panel === "cases"
            ? visible.map((item) => {
                const row = resultFor(item);
                return (
                  <button
                    type="button"
                    data-testid={`evaluation-case-${item.id}`}
                    key={item.id}
                    className={`eval-row${selectedId === item.id ? " selected" : ""}`}
                    onClick={() => selectCase(item)}
                  >
                    <span>
                      <small>
                        {item.id} · r{item.revision}
                      </small>
                      <b>{item.question}</b>
                      <em>{item.expected}</em>
                    </span>
                    <span className="eval-row-status">
                      <strong>{scoreText(row)}</strong>
                      {tag(caseStatus(item))}
                    </span>
                    <ArrowRightOutlined />
                  </button>
                );
              })
            : visibleFeedback.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`eval-row${feedbackId === item.id ? " selected" : ""}`}
                  onClick={() => setFeedbackId(item.id)}
                >
                  <span>
                    <small>
                      {item.rating === "positive"
                        ? tr("Helpful", "有帮助")
                        : tr("Needs correction", "需要修正")}{" "}
                      · {time(item.created_at)}
                    </small>
                    <b>{item.category || item.question}</b>
                    <em>{item.comment || item.question}</em>
                  </span>
                  <span className="eval-row-status">
                    {tag(item.review_status || "pending")}
                  </span>
                  <ArrowRightOutlined />
                </button>
              ))}
          {!(panel === "cases" ? visible : visibleFeedback).length && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={tr("No matching items", "没有匹配的内容")}
            />
          )}
        </section>
        <aside className="eval-details">
          {panel === "cases" && selected ? (
            <>
              <div className="eval-kicker">
                {tr("QUESTION DETAILS", "问题详情")} · {selected.id}
              </div>
              <h2>{snapshot?.question || selected.question}</h2>
              <div className="eval-expectation">
                <small>{tr("Expected result", "预期结果")}</small>
                <p>{snapshot?.expected || selected.expected}</p>
                {snapshot &&
                  snapshot.criteria_hash !== selected.criteria_hash && (
                    <Tag color="warning">
                      {tr(
                        "This run used an earlier case revision",
                        "该批次使用了旧版检查标准",
                      )}{" "}
                      · r{snapshot.revision}
                    </Tag>
                  )}
              </div>
              <div className="eval-result-summary">
                {tag(result?.status || "not_run")}
                <strong>{scoreText(result)}</strong>
                <span>
                  {tr("Configured checks", "配置检查项")}{" "}
                  {result
                    ? `${Object.values(result.checks).filter(Boolean).length}/${Object.keys(result.checks).length}`
                    : "—"}
                </span>
              </div>
              <Space wrap className="eval-detail-actions">
                <Button
                  size="small"
                  type="primary"
                  loading={busy || running}
                  onClick={() => runCases([selected.id])}
                >
                  {tr("Run this question", "运行本题")}
                </Button>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  disabled={running}
                  onClick={() => openEdit(selected)}
                >
                  {tr("Edit question", "编辑问题")}
                </Button>
                <Button size="small" onClick={replay}>
                  {tr("Reproduce in query", "在问答中复现")}
                </Button>
              </Space>
              {result ? (
                <Tabs
                  size="small"
                  items={[
                    {
                      key: "checks",
                      label: tr("Checks", "检查详情"),
                      children: (
                        <>
                          <ul className="eval-checks">
                            {Object.entries(result.checks).map(
                              ([key, passed]) => (
                                <li key={key}>
                                  {passed ? (
                                    <CheckCircleOutlined
                                      style={{ color: token.colorSuccess }}
                                    />
                                  ) : (
                                    <CloseCircleOutlined
                                      style={{ color: token.colorError }}
                                    />
                                  )}
                                  <span>{checkNames[key] || key}</span>
                                  <Tag color={passed ? "success" : "error"}>
                                    {passed
                                      ? tr("Passed", "通过")
                                      : tr("Not matched", "未匹配")}
                                  </Tag>
                                </li>
                              ),
                            )}
                          </ul>
                          {result.issues.length > 0 && (
                            <Alert
                              type="warning"
                              showIcon
                              title={tr("Review needed", "需要复核")}
                              description={
                                <ul>
                                  {result.issues.map((issue, i) => (
                                    <li key={i}>{issueLabel(issue)}</li>
                                  ))}
                                </ul>
                              }
                            />
                          )}
                          {result.review_required && (
                            <div style={{ marginTop: 16 }}>
                              <p className="eval-note">
                                {tr(
                                  "Review the actual answer before accepting. This records your judgment without changing automated scores.",
                                  "请先核对实际回答。复核只记录你的判断，不会修改自动检查分数。",
                                )}
                              </p>
                              {result.manual_review && (
                                <Tag>
                                  {result.manual_review.decision === "accepted"
                                    ? tr("Review accepted", "已人工确认")
                                    : tr("Review rejected", "复核未通过")}
                                </Tag>
                              )}
                              <Input.TextArea
                                aria-label={tr("Review note", "复核说明")}
                                rows={2}
                                value={reviewNote}
                                onChange={(e) => setReviewNote(e.target.value)}
                                maxLength={2000}
                              />
                              <Space style={{ marginTop: 8 }} wrap>
                                <Button
                                  size="small"
                                  loading={busy}
                                  onClick={() => reviewAnswer("accepted")}
                                >
                                  {tr("Accept after review", "复核通过")}
                                </Button>
                                <Button
                                  size="small"
                                  disabled={busy}
                                  onClick={() => reviewAnswer("rejected")}
                                >
                                  {tr("Keep for review", "保留待复核")}
                                </Button>
                              </Space>
                            </div>
                          )}
                          <dl className="eval-metadata">
                            {[
                              [
                                tr("Model", "模型"),
                                result.answer.llm_model ||
                                  tr(
                                    "Deterministic / fallback",
                                    "确定性或降级回答",
                                  ),
                              ],
                              ["Run ID", result.answer.agent_run_id],
                              ["Trace ID", result.answer.trace_id],
                              [
                                tr("Execution code hash", "执行代码哈希"),
                                run.runtime_code_hash,
                              ],
                              [
                                tr("Duration", "耗时"),
                                result.answer.duration_ms != null
                                  ? `${result.answer.duration_ms} ms`
                                  : "—",
                              ],
                              [
                                tr("Active schema hash", "运行时定义哈希"),
                                run.schema_hash,
                              ],
                            ].map(([key, value]) => (
                              <div key={key}>
                                <dt>{key}</dt>
                                <dd>{value || "—"}</dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      ),
                    },
                    {
                      key: "answer",
                      label: tr("Answer", "实际回答"),
                      children: (
                        <div className="query-markdown">
                          <ReactMarkdown>
                            {result.answer.answer ||
                              tr("No answer returned", "未返回回答")}
                          </ReactMarkdown>
                        </div>
                      ),
                    },
                    {
                      key: "evidence",
                      label: tr("Evidence", "返回依据"),
                      children: (
                        <AnswerEvidence
                          key={`${run.id}-${selectedId}`}
                          result={{ ...result.answer, suggestions: [] }}
                          zh={zh}
                          onGraph={graph}
                        />
                      ),
                    },
                    {
                      key: "comparison",
                      label: tr("Before / after", "前后对比"),
                      children: (
                        <>
                          <Select
                            aria-label={tr("Compare with run", "选择对比批次")}
                            placeholder={tr(
                              "Choose an earlier run",
                              "选择历史批次",
                            )}
                            style={{ width: "100%" }}
                            value={compareId || undefined}
                            options={priorRuns.map((item) => ({
                              value: item.id,
                              label: `${time(item.started_at)} · ${item.model || tr("Baseline", "基线")}`,
                            }))}
                            onChange={compare}
                          />
                          {comparison && (
                            <div data-testid="evaluation-comparison">
                              <div className="eval-comparison-scores">
                                <div>
                                  <small>{tr("Before", "上次")}</small>
                                  <b>{scoreText(comparison.before)}</b>
                                </div>
                                <ArrowRightOutlined />
                                <div>
                                  <small>{tr("Current", "本次")}</small>
                                  <b>{scoreText(comparison.after)}</b>
                                </div>
                              </div>
                              {!comparison.same_criteria && (
                                <Alert
                                  type="warning"
                                  title={tr(
                                    "Criteria changed; scores are not directly comparable",
                                    "检查标准已变化，分数不可直接比较",
                                  )}
                                />
                              )}
                              <p className="eval-note">
                                {comparison.schema_changed
                                  ? tr(
                                      "The active schema changed.",
                                      "运行时本体定义已变化。",
                                    )
                                  : tr(
                                      "The active schema is unchanged.",
                                      "运行时本体定义相同。",
                                    )}{" "}
                                {comparison.code_changed &&
                                  tr(
                                    "Execution code changed.",
                                    "执行代码已变化。",
                                  )}
                              </p>
                              {[
                                [
                                  "evidence_delta",
                                  tr("Evidence changes", "证据变化"),
                                ],
                                ["path_delta", tr("Path changes", "路径变化")],
                                [
                                  "object_delta",
                                  tr("Object changes", "对象变化"),
                                ],
                              ].map(([key, label]) => (
                                <div className="eval-delta" key={key}>
                                  <b>{label}</b>
                                  <span>
                                    +{comparison[key].added.length} / −
                                    {comparison[key].removed.length}
                                  </span>
                                  {[
                                    ...comparison[key].added.map((value) => [
                                      "+",
                                      value,
                                    ]),
                                    ...comparison[key].removed.map((value) => [
                                      "−",
                                      value,
                                    ]),
                                  ].map(([sign, value], i) => (
                                    <code key={i}>
                                      {sign}{" "}
                                      {typeof value === "string"
                                        ? value
                                        : JSON.stringify(value)}
                                    </code>
                                  ))}
                                </div>
                              ))}
                              <details>
                                <summary>
                                  {tr("Before answer", "上次回答")}
                                </summary>
                                <div className="query-markdown">
                                  <ReactMarkdown>
                                    {comparison.before.answer.answer || ""}
                                  </ReactMarkdown>
                                </div>
                              </details>
                              <details>
                                <summary>
                                  {tr("Current answer", "本次回答")}
                                </summary>
                                <div className="query-markdown">
                                  <ReactMarkdown>
                                    {comparison.after.answer.answer || ""}
                                  </ReactMarkdown>
                                </div>
                              </details>
                            </div>
                          )}
                        </>
                      ),
                    },
                  ]}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    run?.status === "running"
                      ? tr("Waiting for this question", "等待本题完成")
                      : tr(
                          "Run this question to see checks, answer and evidence",
                          "运行本题后查看检查、回答与依据",
                        )
                  }
                />
              )}
            </>
          ) : panel === "feedback" && selectedFeedback ? (
            <>
              <div className="eval-kicker">
                {tr("ANSWER FEEDBACK", "回答反馈")}
              </div>
              {tag(selectedFeedback.review_status || "pending")}
              <h2>
                {selectedFeedback.category || tr("Answer feedback", "回答反馈")}
              </h2>
              <div className="eval-expectation">
                <small>{tr("Question", "关联问题")}</small>
                <p>{selectedFeedback.question}</p>
                <small>{tr("Comment", "补充说明")}</small>
                <p>{selectedFeedback.comment || "—"}</p>
              </div>
              <dl className="eval-metadata">
                {[
                  ["Run ID", selectedFeedback.agent_run_id],
                  ["Trace ID", selectedFeedback.trace_id],
                  [
                    tr("Submitted", "提交时间"),
                    time(selectedFeedback.created_at),
                  ],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <Space wrap>
                <Button
                  disabled={selectedFeedback.review_status === "processed"}
                  onClick={review}
                >
                  {tr("Mark processed", "标记已处理")}
                </Button>
                <Button
                  type="primary"
                  onClick={() =>
                    openEdit({
                      question: selectedFeedback.question,
                      expected: [
                        selectedFeedback.category,
                        selectedFeedback.comment,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      source_feedback_id: selectedFeedback.id,
                    })
                  }
                >
                  {tr("Create evaluation case", "创建评测用例")}
                </Button>
                {selectedFeedback.case_id && (
                  <Button
                    onClick={() => {
                      setPanel("cases");
                      setFilter("all");
                      setSelectedId(selectedFeedback.case_id);
                      setRun(null);
                      setSearch("");
                      setAsset("");
                      setParams(
                        { case: selectedFeedback.case_id },
                        { replace: true },
                      );
                    }}
                  >
                    {tr("Open created case", "查看已创建用例")}
                  </Button>
                )}
              </Space>
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={tr("Select an item to inspect", "选择一项查看详情")}
            />
          )}
        </aside>
      </div>
      <Drawer
        title={
          edit?.id
            ? tr("Edit evaluation question", "编辑评测问题")
            : edit?.source_feedback_id
              ? tr("Create case from feedback", "根据反馈创建用例")
              : tr("Add evaluation question", "添加评测问题")
        }
        open={!!edit}
        onClose={() => setEdit(null)}
        size={620}
        extra={
          <Button type="primary" onClick={saveCase} loading={busy}>
            {tr("Save question", "保存问题")}
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="question"
            label={tr("Business question", "业务问题")}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <Form.Item
            name="expected"
            label={tr("Expected result and boundaries", "预期结果与回答边界")}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={4} maxLength={4000} />
          </Form.Item>
          <Form.Item
            name="assets"
            label={tr("Related ontology definitions", "关联本体定义")}
          >
            <Select
              mode="tags"
              options={assets.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Collapse
            items={[
              {
                key: "criteria",
                label: tr(
                  "Automatic checks (optional)",
                  "自动检查标准（选填）",
                ),
                forceRender: true,
                children: (
                  <>
                    <p className="eval-note">
                      {tr(
                        "Without these criteria, a run is recorded for human review. Text checks match literal phrases.",
                        "未配置自动标准时记录实际回答并交由人工复核；关键词按字面匹配。",
                      )}
                    </p>
                    {[
                      [
                        "required_ids",
                        tr(
                          "Required object or rule IDs",
                          "必须返回的对象或规则 ID",
                        ),
                      ],
                      [
                        "answer_terms",
                        tr("Answer must include", "回答必须包含"),
                      ],
                      [
                        "forbidden_terms",
                        tr("Answer must not include", "回答禁止包含"),
                      ],
                      [
                        "evidence_terms",
                        tr("Evidence must include", "返回依据必须包含"),
                      ],
                    ].map(([name, label]) => (
                      <Form.Item key={name} name={name} label={label}>
                        <Select mode="tags" tokenSeparators={[",", "，"]} />
                      </Form.Item>
                    ))}
                    <Form.Item
                      name="match_products"
                      label={tr(
                        "Match the complete product ID set",
                        "核对完整产品 ID 集合",
                      )}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="product_ids"
                      label={tr(
                        "Expected product IDs (empty means no products)",
                        "预期产品 ID（空集合表示不应返回产品）",
                      )}
                    >
                      <Select mode="tags" tokenSeparators={[",", "，"]} />
                    </Form.Item>
                    <Form.List name="required_paths">
                      {(fields, { add, remove }) => (
                        <>
                          <label>
                            {tr("Required relationships", "必须返回的关系")}
                          </label>
                          {fields.map((field) => (
                            <div className="eval-path-fields" key={field.key}>
                              {[
                                ["source_id", tr("Source ID", "起点 ID")],
                                ["relation", tr("Relation", "关系")],
                                ["target_id", tr("Target ID", "终点 ID")],
                              ].map(([name, label]) => (
                                <Form.Item
                                  key={name}
                                  name={[field.name, name]}
                                  rules={[{ required: true }]}
                                >
                                  <Input placeholder={label} />
                                </Form.Item>
                              ))}
                              <Button
                                type="text"
                                danger
                                onClick={() => remove(field.name)}
                              >
                                ×
                              </Button>
                            </div>
                          ))}
                          <Button
                            block
                            onClick={() => add()}
                            icon={<PlusOutlined />}
                          >
                            {tr("Add relationship", "添加关系")}
                          </Button>
                        </>
                      )}
                    </Form.List>
                    <Form.Item
                      name="expected_unknown"
                      label={tr("Must report missing data", "必须说明无法确认")}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="no_paths"
                      label={tr(
                        "Must not return a relationship path",
                        "不应返回关系路径",
                      )}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>
      <LlmConfigDialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        llmStatus={model}
        onStatusChange={setModel}
      />
    </div>
  );
}
