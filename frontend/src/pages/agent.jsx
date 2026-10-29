import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Collapse,
  Dropdown,
  Drawer,
  Input,
  Modal,
  Radio,
  Select,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from "antd";
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DislikeOutlined,
  EllipsisOutlined,
  HistoryOutlined,
  LikeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api, apiLong } from "../providers/dataProvider";
import LlmConfigDialog from "../components/query/LlmConfigDialog";
import AnswerEvidence from "../components/query/AnswerEvidence";
import "./queryWorkspace.css";

const STORE = "pto-query-conversations-v1";
const id = () => crypto.randomUUID();
function readSessions() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE));
    return Array.isArray(data)
      ? data
          .filter(
            (s) =>
              s &&
              typeof s.id === "string" &&
              typeof s.title === "string" &&
              Array.isArray(s.turns),
          )
          .map((s) => ({
            ...s,
            turns: s.turns
              .filter(
                (t) =>
                  t &&
                  typeof t.id === "string" &&
                  typeof t.question === "string",
              )
              .map((t) =>
                !t.result && !t.error
                  ? {
                      ...t,
                      error:
                        "This query was interrupted. Retry to run it again.",
                    }
                  : t,
              ),
          }))
      : [];
  } catch {
    return [];
  }
}
const summary = (answer) =>
  String(answer || "")
    .replace(/^##\s*(Conclusion|结论)\s*/i, "")
    .split(/\n##\s/)[0]
    .trim();
const short = (text) =>
  String(text || "")
    .replace(/[#*\n]/g, " ")
    .trim()
    .slice(0, 150);
const Markdown = ({ children }) => (
  <div className="query-markdown">
    <ReactMarkdown>{children || ""}</ReactMarkdown>
  </div>
);

export default function AgentPage() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const text = (en, cn) => (zh ? cn : en);
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const evaluationContext =
    params.get("from") === "evaluation"
      ? {
          from: "evaluation",
          case: params.get("case") || "",
          evaluation_run: params.get("evaluation_run") || "",
        }
      : {};
  const [sessions, setSessions] = useState(readSessions);
  const [activeId, setActiveId] = useState(() =>
    params.get("question")
      ? ""
      : params.get("conversation") ||
        readSessions().find((s) => !s.archived)?.id ||
        "",
  );
  const [turnId, setTurnId] = useState(params.get("turn") || "");
  const [input, setInput] = useState(params.get("question") || "");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("active");
  const [collapsed, setCollapsed] = useState(true);
  const [pending, setPending] = useState(null);
  const [status, setStatus] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [rename, setRename] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [category, setCategory] = useState("");
  const [comment, setComment] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const scroll = useRef(null);
  const active = sessions.find((s) => s.id === activeId);
  const turns = active?.turns || [];
  const selected = turns.find((t) => t.id === turnId) || turns.at(-1);
  const visible = sessions
    .filter((s) => !!s.archived === (scope === "archived"))
    .filter((s) =>
      `${s.title} ${s.turns.map((t) => t.question).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt,
    );
  const reasons = zh
    ? [
        "答案不准确",
        "对象或属性错误",
        "关系路径错误",
        "证据不完整",
        "数据范围问题",
        "其他",
      ]
    : [
        "Incorrect answer",
        "Wrong object or property",
        "Wrong relationship",
        "Incomplete evidence",
        "Data scope issue",
        "Other",
      ];

  useEffect(() => {
    api
      .get("/llm/config")
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(sessions));
      setHistoryError(false);
    } catch {
      setHistoryError(true);
    }
  }, [sessions]);
  useEffect(() => {
    if (params.get("conversation")) {
      setActiveId(params.get("conversation"));
      setTurnId(params.get("turn") || "");
    }
  }, [params]);
  useEffect(() => {
    if (pending?.sessionId === activeId)
      scroll.current?.scrollTo({
        top: scroll.current.scrollHeight,
        behavior: "smooth",
      });
  }, [pending, activeId]);

  const selectSession = (session) => {
    setActiveId(session.id);
    setTurnId(session.turns.at(-1)?.id || "");
    setInput("");
    setParams(
      { ...evaluationContext, conversation: session.id },
      { replace: true },
    );
  };
  const selectTurn = (turn) => {
    setTurnId(turn.id);
    setParams(
      { ...evaluationContext, conversation: activeId, turn: turn.id },
      { replace: true },
    );
  };
  const newConversation = () => {
    setActiveId("");
    setTurnId("");
    setInput("");
    setParams(evaluationContext, { replace: true });
  };
  const updateTurn = (sessionId, targetId, patch) =>
    setSessions((current) =>
      current.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              turns: s.turns.map((t) =>
                t.id === targetId ? { ...t, ...patch } : t,
              ),
            },
      ),
    );

  const send = async (question = input, retryId = "") => {
    const q = question.trim();
    if (!q || pending) return;
    const sessionId = active && !active.archived ? active.id : id();
    const targetId = retryId || id();
    const preceding = retryId
      ? turns.slice(
          0,
          turns.findIndex((t) => t.id === retryId),
        )
      : turns;
    const contextTurns = active?.archived ? [] : preceding;
    const productIds = [...contextTurns]
      .reverse()
      .map((t) => t.question.match(/\bPF\d+\b/gi) || [])
      .find((ids) => ids.length);
    const lastProduct =
      productIds?.length === 1 ? productIds[0].toUpperCase() : undefined;
    const history = contextTurns
      .filter((t) => t.result)
      .slice(-4)
      .flatMap((t) => [
        { role: "user", content: t.question },
        { role: "assistant", content: t.result.answer },
      ]);
    setSessions((current) => {
      const session = current.find((s) => s.id === sessionId);
      const turn = {
        id: targetId,
        question: q,
        createdAt: new Date().toISOString(),
      };
      if (!session)
        return [
          {
            id: sessionId,
            title: q.slice(0, 60),
            updatedAt: Date.now(),
            turns: [turn],
          },
          ...current,
        ];
      return current.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              updatedAt: Date.now(),
              turns: retryId
                ? s.turns.map((t) => (t.id === retryId ? turn : t))
                : [...s.turns, turn],
            }
          : s,
      );
    });
    setActiveId(sessionId);
    setTurnId(targetId);
    setInput("");
    setPending({ sessionId, turnId: targetId });
    setParams(
      { ...evaluationContext, conversation: sessionId, turn: targetId },
      { replace: true },
    );
    try {
      const { data } = await apiLong.post("/pet-food/agent/chat", {
        question: q,
        context: {
          current_domain: "pet_food",
          current_product_id: lastProduct,
          history,
        },
      });
      updateTurn(sessionId, targetId, { result: data });
    } catch (error) {
      const detail = error.response?.data?.detail;
      updateTurn(sessionId, targetId, {
        error:
          typeof detail === "string"
            ? detail
            : text(
                "The query could not complete. Check the service and retry.",
                "查询未能完成，请检查服务后重试。",
              ),
      });
    } finally {
      setPending(null);
    }
  };

  const sessionAction = (session, key) => {
    if (key === "rename") {
      setRename({ id: session.id, title: session.title });
      return;
    }
    if (key === "delete") {
      Modal.confirm({
        title: text("Delete this conversation?", "删除此会话？"),
        content: text(
          "This removes its browser history. Server run records and feedback remain.",
          "这会清除此浏览器中的会话，服务端运行记录和反馈仍保留。",
        ),
        okText: text("Delete", "删除"),
        cancelText: text("Cancel", "取消"),
        okButtonProps: { danger: true },
        onOk: () => {
          setSessions((current) => current.filter((s) => s.id !== session.id));
          if (activeId === session.id) newConversation();
        },
      });
      return;
    }
    setSessions((current) =>
      current.map((s) =>
        s.id === session.id
          ? {
              ...s,
              [key === "pin" ? "pinned" : "archived"]: !(key === "pin"
                ? s.pinned
                : s.archived),
            }
          : s,
      ),
    );
  };
  const openGraph = (step) =>
    navigate(
      `/graph?${new URLSearchParams({ ...evaluationContext, node: step.source_id, ...(step.target_id ? { target: step.target_id, relation: step.relation } : {}), conversation: activeId, turn: selected.id })}`,
    );
  const submitChanges = async (turn) => {
    try {
      const { data } = await api.post("/agent/suggestions/submit-review", {
        agent_run_id: turn.result.agent_run_id,
        user_message: turn.question,
        suggestions: turn.result.suggestions,
      });
      updateTurn(activeId, turn.id, { submitted: data.batch?.id || true });
      message.success(text("Submitted to Review Queue", "已提交审核队列"));
    } catch (error) {
      message.error(
        error.response?.data?.detail || text("Submission failed", "提交失败"),
      );
    }
  };
  const saveFeedback = async (turn, rating, reason = "", note = "") => {
    setSavingFeedback(true);
    try {
      const { data } = await api.post("/agent/feedback", {
        trace_id: turn.result.trace_id,
        agent_run_id: turn.result.agent_run_id,
        conversation_id: activeId,
        turn_id: turn.id,
        rating,
        category: reason,
        comment: note,
      });
      updateTurn(activeId, turn.id, { feedback: data });
      setFeedback(null);
      message.success(
        text("Feedback recorded for this answer", "已记录本轮回答的反馈"),
      );
    } catch {
      message.error(
        text(
          "Feedback was not saved. Retry when the service is available.",
          "反馈未保存，请在服务可用时重试。",
        ),
      );
    } finally {
      setSavingFeedback(false);
    }
  };

  const variables = {
    "--query-bg": token.colorBgContainer,
    "--query-raised": token.colorBgElevated,
    "--query-page": token.colorBgLayout,
    "--query-border": token.colorBorderSecondary,
    "--query-muted": token.colorTextSecondary,
    "--query-text": token.colorText,
    "--query-accent": token.colorPrimary,
  };
  return (
    <div className="query-workspace" style={variables}>
      <header className="query-page-heading">
        <div>
          <Typography.Title level={4}>
            {text("Analyst Agent", "图谱问答")}
          </Typography.Title>
          <span>
            {text(
              "Ask a question. Follow the facts and relationships behind the answer.",
              "围绕业务对象提问，查看结论背后的事实、关系与来源。",
            )}
          </span>
        </div>
        <div className="query-page-actions">
          <Tag>{text("Pet Food reference", "Pet Food 参考域")}</Tag>
          <Button
            onClick={() =>
              navigate(
                `/verified-qa?${new URLSearchParams({ ...(params.get("case") ? { case: params.get("case") } : {}), ...(params.get("evaluation_run") ? { run: params.get("evaluation_run") } : {}) })}`,
              )
            }
          >
            {text("Evaluation", "问题集评测")}
          </Button>
          <Button
            icon={<SettingOutlined />}
            onClick={() => setConfigOpen(true)}
          >
            {text("Model settings", "模型设置")}
          </Button>
        </div>
      </header>
      {historyError && (
        <Alert
          type="warning"
          title={text(
            "Browser history could not be saved. Keep this page open to retain the current conversation.",
            "会话无法保存到浏览器，请保持本页面打开以保留当前内容。",
          )}
        />
      )}
      <div className={`query-shell${collapsed ? " is-collapsed" : ""}`}>
        <aside
          className="query-history"
          aria-label={text("Conversation history", "会话历史")}
        >
          <div className="query-history-header">
            <b>{text("Conversations", "会话")}</b>
            <Tooltip
              title={text(
                collapsed ? "Show history" : "Collapse history",
                collapsed ? "展开历史" : "收起历史",
              )}
            >
              <Button
                type="text"
                aria-label={text("Toggle history", "切换会话历史")}
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
              />
            </Tooltip>
          </div>
          <Button
            className="query-new"
            aria-label={text("New conversation", "新会话")}
            title={text("New conversation", "新会话")}
            icon={<PlusOutlined />}
            onClick={newConversation}
          >
            {text("New conversation", "新会话")}
          </Button>
          <div className="query-history-tools">
            <Input
              prefix={<SearchOutlined />}
              aria-label={text("Search conversations", "搜索会话")}
              placeholder={text("Search conversations", "搜索会话")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
            <Radio.Group
              size="small"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              optionType="button"
              options={[
                { value: "active", label: text("Recent", "最近") },
                { value: "archived", label: text("Archived", "已归档") },
              ]}
            />
          </div>
          <div className="query-history-list">
            {visible.map((session) => (
              <div
                className={`query-history-item${session.id === activeId ? " is-active" : ""}`}
                key={session.id}
              >
                <button type="button" onClick={() => selectSession(session)}>
                  <span>
                    {session.pinned && <small>● </small>}
                    {session.title}
                  </span>
                  <small>
                    {session.turns.length} {text("questions", "个问题")}
                  </small>
                </button>
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    items: [
                      {
                        key: "pin",
                        label: text(
                          session.pinned ? "Unpin" : "Pin",
                          session.pinned ? "取消置顶" : "置顶",
                        ),
                      },
                      { key: "rename", label: text("Rename", "重命名") },
                      {
                        key: "archive",
                        label: text(
                          session.archived ? "Restore" : "Archive",
                          session.archived ? "恢复会话" : "归档",
                        ),
                      },
                      {
                        key: "delete",
                        label: text("Delete", "删除"),
                        danger: true,
                      },
                    ],
                    onClick: ({ key }) => sessionAction(session, key),
                  }}
                >
                  <Button
                    type="text"
                    aria-label={`${text("Conversation actions", "会话操作")}: ${session.title}`}
                    icon={<EllipsisOutlined />}
                  />
                </Dropdown>
              </div>
            ))}
            {!visible.length && (
              <p className="query-history-empty">
                {text("No conversations here yet.", "这里还没有会话。")}
              </p>
            )}
          </div>
          <footer className="query-history-footer">
            <HistoryOutlined />{" "}
            {text("Saved in this browser", "保存在当前浏览器")}
          </footer>
        </aside>
        <section
          className="query-conversation"
          aria-label={text("Query conversation", "问答会话")}
        >
          <header className="query-conversation-header">
            <div className="query-conversation-name">
              <ApartmentOutlined />
              <b>{active?.title || text("New conversation", "新会话")}</b>
            </div>
            <div>
              <Tag color={status?.configured ? "success" : "default"}>
                {status?.configured
                  ? text("LLM enabled", "模型已配置")
                  : text("Deterministic demo", "确定性演示")}
              </Tag>
              <Button
                type="text"
                icon={<ClockCircleOutlined />}
                disabled={!selected?.result}
                onClick={() => setRunOpen(true)}
              >
                {text("Run details", "运行信息")}
              </Button>
            </div>
          </header>
          <div className="query-conversation-scroll" ref={scroll}>
            {!turns.length && (
              <div className="query-starter">
                <span className="query-starter-mark">
                  <ApartmentOutlined />
                </span>
                <Tag>
                  {text("YOUR ONTOLOGY, EXPLAINED", "从本体中寻找依据")}
                </Tag>
                <h2>
                  {text("Start with a question.", "从一个业务问题开始。")}
                </h2>
                <p>
                  {text(
                    "Explore products, ingredients, and rule results. Each answer keeps its own evidence and query run.",
                    "探索产品、成分与规则结果。每轮回答都保留独立的证据和查询记录。",
                  )}
                </p>
                <div className="query-starters">
                  {(zh
                    ? [
                        "哪些产品含有 chicken？",
                        "解释 PF001 的风险与数据缺口",
                        "比较 PF001 和 PF002",
                      ]
                    : [
                        "Which products contain chicken?",
                        "Explain PF001’s risks and missing data",
                        "Compare PF001 and PF002",
                      ]
                  ).map((q) => (
                    <button type="button" onClick={() => send(q)} key={q}>
                      <ToolOutlined />
                      <span>{q}</span>
                      <ArrowRightOutlined />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn) => (
              <div
                className="query-turn"
                key={turn.id}
                data-testid="query-turn"
              >
                <div className="query-question">
                  <span>{text("YOU", "我")}</span>
                  <p>{turn.question}</p>
                </div>
                {turn.id !== selected?.id ? (
                  <button
                    type="button"
                    className="query-prior"
                    onClick={() => selectTurn(turn)}
                  >
                    <RobotOutlined />
                    <span>
                      <b>
                        {short(summary(turn.result?.answer)) ||
                          text("View this query", "查看本轮查询")}
                      </b>
                      <small>
                        {turn.result?.tool_results?.length || 0}{" "}
                        {text("tool results", "项工具结果")}
                      </small>
                    </span>
                    <ArrowRightOutlined />
                  </button>
                ) : turn.result ? (
                  <article className="query-answer" data-testid="query-answer">
                    <div className="query-answer-heading">
                      <span>
                        <RobotOutlined />
                        <b>{text("Answer", "回答")}</b>
                        <Tag>
                          {(turn.result.answer_llm_used ?? turn.result.llm_used)
                            ? text("Model summary", "模型归纳")
                            : text("Tool summary", "工具结果摘要")}
                        </Tag>
                      </span>
                      <time>
                        {new Date(turn.createdAt).toLocaleTimeString(
                          zh ? "zh-CN" : "en-US",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </time>
                    </div>
                    <Markdown>{summary(turn.result.answer)}</Markdown>
                    <details className="query-full-answer">
                      <summary>
                        {text("Full explanation", "查看完整说明")}
                      </summary>
                      <Markdown>{turn.result.answer}</Markdown>
                    </details>
                    {!!turn.result.tool_calls?.length && (
                      <Collapse
                        className="query-process"
                        ghost
                        items={[
                          {
                            key: "process",
                            label: (
                              <span>
                                {text("Query process", "查询过程")}{" "}
                                <small>
                                  {turn.result.tool_calls.length}{" "}
                                  {text("tools", "个工具")} ·{" "}
                                  {(
                                    (turn.result.duration_ms || 0) / 1000
                                  ).toFixed(2)}
                                  s
                                </small>
                              </span>
                            ),
                            children: (
                              <ol>
                                {turn.result.tool_calls.map((call, i) => (
                                  <li key={i}>
                                    <span className="query-step-number">
                                      {i + 1}
                                    </span>
                                    <div>
                                      <b>{call.tool_name}</b>
                                      <code>
                                        {JSON.stringify(call.arguments)}
                                      </code>
                                    </div>
                                    <Tag
                                      color={
                                        call.status === "success"
                                          ? "success"
                                          : "warning"
                                      }
                                    >
                                      {call.status} · {call.duration_ms}ms
                                    </Tag>
                                  </li>
                                ))}
                              </ol>
                            ),
                          },
                        ]}
                      />
                    )}
                    <AnswerEvidence
                      key={turn.id}
                      result={turn.result}
                      zh={zh}
                      onGraph={openGraph}
                      onSubmit={() => submitChanges(turn)}
                      submitted={turn.submitted}
                    />
                    <footer className="query-feedback">
                      <span>
                        {text(
                          "Was this answer helpful?",
                          "本次回答是否有帮助？",
                        )}
                      </span>
                      <Button
                        type={
                          turn.feedback?.rating === "positive"
                            ? "primary"
                            : "text"
                        }
                        size="small"
                        aria-label={text("Helpful", "有帮助")}
                        icon={<LikeOutlined />}
                        disabled={!turn.result.trace_id || savingFeedback}
                        onClick={() =>
                          saveFeedback(
                            turn,
                            "positive",
                            text("Helpful", "有帮助"),
                          )
                        }
                      />
                      <Button
                        type={
                          turn.feedback?.rating === "negative"
                            ? "primary"
                            : "text"
                        }
                        size="small"
                        aria-label={text("Needs correction", "需要修正")}
                        icon={<DislikeOutlined />}
                        disabled={!turn.result.trace_id || savingFeedback}
                        onClick={() => {
                          setFeedback(turn);
                          setCategory("");
                          setComment("");
                        }}
                      />
                      {turn.feedback && (
                        <small>
                          <CheckOutlined />{" "}
                          {text("Feedback recorded", "已记录反馈")}
                          <Button
                            type="link"
                            size="small"
                            onClick={() =>
                              navigate(
                                `/verified-qa?panel=feedback&feedback=${turn.feedback.id}`,
                              )
                            }
                          >
                            {text("View feedback", "查看反馈")}
                          </Button>
                        </small>
                      )}
                    </footer>
                  </article>
                ) : turn.error ? (
                  <Alert
                    type="error"
                    title={text("Query did not complete", "查询未完成")}
                    description={turn.error}
                    action={
                      <Button
                        onClick={() => send(turn.question, turn.id)}
                        disabled={!!pending}
                      >
                        {text("Retry", "重试")}
                      </Button>
                    }
                  />
                ) : (
                  <div className="query-loading" role="status">
                    <Spin size="small" />
                    <span>
                      {text("Reading ontology tools…", "正在读取本体工具…")}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="query-composer">
            <Input.TextArea
              aria-label={text("Ask about the ontology", "输入本体问题")}
              placeholder={
                active?.archived
                  ? text(
                      "Start a new conversation to continue",
                      "发送问题将开启新会话",
                    )
                  : text(
                      "Ask about a product, ingredient, or rule…",
                      "输入产品、成分或规则相关问题…",
                    )
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div>
              <span>
                {text(
                  "Read-only queries · proposed changes require review",
                  "只读查询 · 变更建议需经审核",
                )}
              </span>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => send()}
                loading={!!pending}
                disabled={!input.trim()}
              >
                {text("Ask", "提问")}
              </Button>
            </div>
          </div>
        </section>
      </div>
      <LlmConfigDialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        llmStatus={status}
        onStatusChange={setStatus}
      />
      <Modal
        title={text("Rename conversation", "重命名会话")}
        open={!!rename}
        onCancel={() => setRename(null)}
        onOk={() => {
          if (!rename.title.trim()) return;
          setSessions((current) =>
            current.map((s) =>
              s.id === rename.id
                ? { ...s, title: rename.title.trim().slice(0, 100) }
                : s,
            ),
          );
          setRename(null);
        }}
      >
        <Input
          aria-label={text("Conversation title", "会话标题")}
          value={rename?.title || ""}
          onChange={(e) => setRename((p) => ({ ...p, title: e.target.value }))}
        />
      </Modal>
      <Modal
        title={text("Answer feedback", "回答反馈")}
        open={!!feedback}
        onCancel={() => setFeedback(null)}
        confirmLoading={savingFeedback}
        okButtonProps={{ disabled: !category }}
        onOk={() => saveFeedback(feedback, "negative", category, comment)}
      >
        <p>
          {text(
            "What needs to be corrected in this answer?",
            "本轮回答的哪个部分需要修正？",
          )}
        </p>
        <Select
          aria-label={text("Feedback reason", "反馈原因")}
          placeholder={text("Choose a reason", "选择原因")}
          style={{ width: "100%" }}
          value={category || undefined}
          onChange={setCategory}
          options={reasons.map((value) => ({ value, label: value }))}
        />
        <Input.TextArea
          aria-label={text("Feedback details", "反馈说明")}
          style={{ marginTop: 14 }}
          placeholder={text(
            "Additional details (optional)",
            "补充说明（选填）",
          )}
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
      <Drawer
        title={text("Run details", "运行信息")}
        open={runOpen}
        onClose={() => setRunOpen(false)}
        size={480}
      >
        {selected?.result && (
          <div className="query-run-details">
            <Tag>
              {selected.result.llm_used
                ? text("LLM + ontology tools", "LLM 与本体工具")
                : text("Deterministic demo", "确定性演示")}
            </Tag>
            {[
              ["Run ID", selected.result.agent_run_id],
              ["Trace ID", selected.result.trace_id],
              [text("Model", "模型"), selected.result.llm_model],
              [text("Provider", "服务商"), selected.result.llm_provider],
              [text("Question", "问题"), selected.question],
              [
                text("Duration", "耗时"),
                selected.result.duration_ms != null
                  ? `${selected.result.duration_ms} ms`
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{value || "—"}</b>
              </div>
            ))}
            <p className="query-note">
              {text(
                "Only recorded tool calls and returned facts are shown. Model internal reasoning is not displayed.",
                "这里只展示已记录的工具调用与返回事实，不展示模型内部思维链。",
              )}
            </p>
            <Button
              icon={<ArrowRightOutlined />}
              onClick={() => navigate("/agent-traces")}
            >
              {text("Open Agent Traces", "查看运行记录")}
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
