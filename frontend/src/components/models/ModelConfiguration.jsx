import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import {
  modelApi as api,
  setModelConfigToken,
} from "../../providers/modelConfigClient";
import "./models.css";

const { Text } = Typography;
const DEFAULT = "__deployment_default__";
const fresh = () => ({
  name: "",
  provider: "openai_compatible",
  model: "",
  base_url: "https://api.openai.com/v1",
  api_key: "",
});
export default function ModelConfiguration({ onStatusChange, onBusyChange }) {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  const tr = (en, cn) => (zh ? cn : en);
  const [registry, setRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [result, setResult] = useState(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [form] = Form.useForm();
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const report = (e) => {
    if (e.response?.status === 401) {
      setNeedsToken(true);
      setError(
        needsToken
          ? tr(
              "Administration token was not accepted.",
              "管理令牌不正确，请检查后重试。",
            )
          : "",
      );
      setEditor(null);
      form.resetFields();
      return;
    }
    const detail = e.response?.data?.detail;
    setError(
      typeof detail === "string"
        ? detail
        : tr(
            "Could not load or save model settings. Check the service and retry.",
            "模型配置未能加载或保存，请检查服务后重试。",
          ),
    );
  };
  const accept = (data) => {
    setRegistry(data);
    setNeedsToken(false);
    onStatusChange?.(data.agents.query);
  };
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      accept((await api.get("/llm/connections")).data);
    } catch (e) {
      report(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const edit = (c) => {
    setResult(null);
    setError("");
    setEditor(c || {});
    form.setFieldsValue(c ? { ...c, api_key: "" } : fresh());
  };
  const close = () => {
    if (busy) return;
    form.resetFields();
    setResult(null);
    setEditor(null);
  };
  const save = async (values) => {
    setBusy(true);
    setError("");
    try {
      const { data } = editor.id
        ? await api.put(`/llm/connections/${editor.id}`, values)
        : await api.post("/llm/connections", values);
      accept(data);
      form.resetFields();
      setEditor(null);
      setResult(null);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    setResult(null);
    setError("");
    try {
      setResult(
        (
          await api.post("/llm/connections/test", {
            ...values,
            ...(editor.id ? { id: editor.id } : {}),
          })
        ).data,
      );
    } catch (e) {
      const safeDetails = [
        "api_key is required when provider or base_url changes",
        "api_key is required",
        "provider is required",
        "model is required",
        "name and model are required",
        "Unsupported provider",
        "A masked API key cannot be saved",
        "base_url contains invalid whitespace or controls",
        "base_url has an invalid host or port",
      ];
      if (e.response?.status === 401) {
        setModelConfigToken("");
        setAdminToken("");
        report(e);
      } else if (
        e.response?.status === 400 &&
        safeDetails.includes(e.response?.data?.detail)
      ) {
        report(e);
      } else {
        setResult({
          ok: false,
          message: tr(
            "Connection test did not complete. Check the service and retry.",
            "连接测试未完成，请检查服务后重试。",
          ),
        });
      }
    } finally {
      setBusy(false);
    }
  };
  const bind = async (agent, value) => {
    setBusy(true);
    setError("");
    try {
      accept(
        (
          await api.put("/llm/bindings", {
            ...registry.bindings,
            [agent]: value === DEFAULT ? null : value,
          })
        ).data,
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = (c) =>
    Modal.confirm({
      title: tr(`Delete ${c.name}?`, `删除 ${c.name}？`),
      content: tr(
        "The connection and its saved key will be removed.",
        "将删除此连接及其保存的密钥。",
      ),
      okText: tr("Delete connection", "删除连接"),
      cancelText: tr("Cancel", "取消"),
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true);
        setError("");
        try {
          accept((await api.delete(`/llm/connections/${c.id}`)).data);
        } catch (e) {
          report(e);
        } finally {
          setBusy(false);
        }
      },
    });
  const status = (c) =>
    c?.configured
      ? `${c.provider} / ${c.model}`
      : tr(
          "No model configured · deterministic fallback",
          "未配置模型 · 使用确定性基线",
        );
  const options = [
    { value: DEFAULT, label: tr("Deployment default", "部署默认配置") },
    ...(registry?.connections || []).map((c) => ({
      value: c.id,
      label: `${c.name} · ${c.model}`,
    })),
  ];
  return (
    <div className="model-settings">
      {needsToken && (
        <section className="model-section">
          <h2>{tr("Model administration access", "模型管理权限")}</h2>
          <p>
            {tr(
              "This deployment requires its model administration token.",
              "此部署已启用模型管理令牌，请向部署管理员获取。",
            )}
          </p>
          <Form
            layout="inline"
            onFinish={() => {
              setModelConfigToken(adminToken);
              setAdminToken("");
              load();
            }}
          >
            <Form.Item>
              <Input.Password
                aria-label={tr("Administration token", "管理令牌")}
                autoComplete="off"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
              />
            </Form.Item>
            <Button htmlType="submit" disabled={!adminToken.trim()}>
              {tr("Unlock settings", "解锁配置")}
            </Button>
          </Form>
        </section>
      )}
      {error && !editor && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={<Button onClick={load}>{tr("Retry", "重试")}</Button>}
        />
      )}
      {loading && !registry ? (
        <div className="model-loading">
          <Spin />
        </div>
      ) : (
        registry &&
        !needsToken && (
          <>
            <section
              className="model-section"
              aria-label={tr("Agent models", "Agent 模型分配")}
            >
              <div className="model-section-heading">
                <div>
                  <h2>{tr("Agent models", "Agent 模型分配")}</h2>
                  <Text type="secondary">
                    {tr(
                      "Selections are saved immediately and apply to new runs.",
                      "选择后立即保存，对新任务生效。",
                    )}
                  </Text>
                </div>
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  aria-label={tr("Refresh models", "刷新模型配置")}
                  onClick={load}
                  disabled={busy || loading}
                />
              </div>
              {[
                [
                  "build",
                  tr("Assisted build", "辅助构建"),
                  tr(
                    "Source mapping and new schema design",
                    "来源映射与新 Schema 辅助设计",
                  ),
                ],
                [
                  "query",
                  tr("Graph query", "图谱问答"),
                  tr(
                    "Ontology questions and model evaluations",
                    "本体问答与模型评测",
                  ),
                ],
              ].map(([agent, name, description]) => (
                <div className="model-agent-row" key={agent}>
                  <div>
                    <h3>{name}</h3>
                    <Text type="secondary">{description}</Text>
                  </div>
                  <div className="model-agent-choice">
                    <Select
                      aria-label={`${name}${zh ? "模型" : " model"}`}
                      value={registry.bindings[agent] || DEFAULT}
                      options={options}
                      onChange={(value) => bind(agent, value)}
                      disabled={busy || loading}
                    />
                    <Text type="secondary" className="model-effective">
                      {status(registry.agents[agent])}
                    </Text>
                  </div>
                </div>
              ))}
              <p className="model-note">
                {tr("Deployment default", "部署默认配置")}:{" "}
                {status(registry.default)}
              </p>
            </section>
            <section
              className="model-section"
              aria-label={tr("Model connections", "模型连接")}
            >
              <div className="model-section-heading">
                <div>
                  <h2>{tr("Model connections", "模型连接")}</h2>
                  <Text type="secondary">
                    {tr(
                      "Both agents can share a connection. Choose a model that supports tools.",
                      "两个 Agent 可共用连接。请选择支持工具调用的模型。",
                    )}
                  </Text>
                </div>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => edit(null)}
                  disabled={busy || loading}
                >
                  {tr("Add connection", "添加连接")}
                </Button>
              </div>
              {!registry.connections.length ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={tr(
                    "No saved connections. Add one or use the deployment default above.",
                    "暂无已保存的连接，可添加连接或使用上方部署默认配置。",
                  )}
                />
              ) : (
                registry.connections.map((c) => {
                  const used = Object.entries(registry.bindings)
                    .filter(([, id]) => id === c.id)
                    .map(([a]) =>
                      a === "build"
                        ? tr("Build", "辅助构建")
                        : tr("Query", "图谱问答"),
                    );
                  return (
                    <div className="model-connection-row" key={c.id}>
                      <div className="model-connection-info">
                        <Button
                          type="text"
                          className="model-connection-name"
                          onClick={() => edit(c)}
                          disabled={busy || loading}
                        >
                          {c.name}
                        </Button>
                        <div>
                          <Text>{c.model}</Text>{" "}
                          <Tag>
                            {c.provider === "anthropic"
                              ? "Anthropic Messages"
                              : "OpenAI compatible"}
                          </Tag>
                        </div>
                        <Text type="secondary" className="model-endpoint">
                          {c.base_url}
                        </Text>
                        {used.length > 0 && (
                          <Text type="secondary">
                            {tr("Used by", "用于")}: {used.join(" · ")}
                          </Text>
                        )}
                      </div>
                      <div className="model-connection-actions">
                        <Text type="secondary">{c.key_masked}</Text>
                        <Button
                          onClick={() => edit(c)}
                          disabled={busy || loading}
                        >
                          {tr("Edit", "编辑")}
                        </Button>
                        <Button
                          type="text"
                          danger
                          disabled={busy || used.length > 0}
                          title={
                            used.length
                              ? tr(
                                  "Reassign agents before deleting",
                                  "请先为 Agent 更换连接",
                                )
                              : undefined
                          }
                          onClick={() => remove(c)}
                        >
                          {tr("Delete", "删除")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
            <p className="model-note">
              {tr(
                "Keys are stored on this server; only masked values return to the browser. These settings are shared by this deployment.",
                "密钥保存在当前服务端，浏览器仅显示脱敏值；本部署中的用户共用这些配置。",
              )}
            </p>
          </>
        )
      )}
      <Drawer
        title={
          editor?.id
            ? tr("Edit connection", "编辑连接")
            : tr("Add connection", "添加连接")
        }
        open={!!editor}
        onClose={close}
        size={480}
        maskClosable={!busy}
        keyboard={!busy}
        closable={!busy}
        forceRender
        footer={
          <div className="model-editor-footer">
            <Button onClick={test} disabled={busy || loading}>
              {tr("Test connection", "测试连接")}
            </Button>
            <div>
              <Button onClick={close} disabled={busy || loading}>
                {tr("Cancel", "取消")}
              </Button>{" "}
              <Button
                type="primary"
                onClick={() => form.submit()}
                loading={busy}
              >
                {tr("Save connection", "保存连接")}
              </Button>
            </div>
          </div>
        }
      >
        {error && (
          <Alert
            type="error"
            showIcon
            title={error}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          disabled={busy || loading}
          onValuesChange={() => setResult(null)}
          requiredMark={false}
        >
          <Form.Item
            name="name"
            label={tr("Connection name", "连接名称")}
            rules={[
              {
                required: true,
                whitespace: true,
                message: tr("Enter a name", "请填写连接名称"),
              },
            ]}
          >
            <Input
              maxLength={80}
              placeholder={tr("e.g. Primary model", "例如：主力模型")}
            />
          </Form.Item>
          <Form.Item
            name="provider"
            label={tr("Protocol", "API 协议")}
            rules={[{ required: true }]}
          >
            <Select
              onChange={(provider) =>
                form.setFieldsValue({
                  base_url:
                    provider === "anthropic"
                      ? "https://api.anthropic.com"
                      : "https://api.openai.com/v1",
                })
              }
              options={[
                {
                  value: "openai_compatible",
                  label: "OpenAI compatible · Chat Completions",
                },
                { value: "anthropic", label: "Anthropic · Messages" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="base_url"
            label={tr("Base URL", "API 基础地址")}
            extra={tr(
              "OpenAI: include /v1 when required by your provider. Anthropic: use the server root.",
              "OpenAI 地址按服务商要求包含 /v1；Anthropic 填写服务根地址。",
            )}
            rules={[
              {
                required: true,
                whitespace: true,
                message: tr("Enter the API base URL", "请填写 API 基础地址"),
              },
              {
                validator: (_, value) => {
                  try {
                    const url = new URL(value);
                    if (
                      !["http:", "https:"].includes(url.protocol) ||
                      !url.hostname ||
                      url.username ||
                      url.password ||
                      url.search ||
                      url.hash ||
                      /\s/.test(value)
                    )
                      throw new Error();
                    return Promise.resolve();
                  } catch {
                    return Promise.reject(
                      new Error(
                        tr(
                          "Enter a valid HTTP(S) base URL",
                          "请填写有效的 HTTP(S) 基础地址",
                        ),
                      ),
                    );
                  }
                },
              },
            ]}
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item
            name="model"
            label={tr("Model ID", "模型 ID")}
            rules={[
              {
                required: true,
                whitespace: true,
                message: tr(
                  "Enter the provider's model ID",
                  "请填写服务商提供的模型 ID",
                ),
              },
            ]}
          >
            <Input
              placeholder={tr(
                "Exact model ID from your provider",
                "填写服务商提供的准确模型 ID",
              )}
              maxLength={200}
            />
          </Form.Item>
          <Form.Item
            name="api_key"
            label="API key"
            extra={
              editor?.id
                ? tr(
                    "Leave blank to keep the key only when protocol and URL are unchanged.",
                    "协议和地址未更改时，留空保留密钥；更改后请重新填写。",
                  )
                : undefined
            }
            rules={
              editor?.id
                ? []
                : [
                    {
                      required: true,
                      whitespace: true,
                      message: tr("Enter an API key", "请填写 API key"),
                    },
                  ]
            }
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={
                editor?.id
                  ? tr("Saved key · unchanged", "已保存密钥 · 留空不更改")
                  : "API key"
              }
            />
          </Form.Item>
        </Form>
        <p className="model-note">
          {tr(
            "The test sends a short request to this provider. It checks connectivity, not the agent's complete tool workflow.",
            "测试会向此服务商发送一条简短请求，仅检查连通性，不代表 Agent 的完整工具流程已通过。",
          )}
        </p>
        {result && (
          <Alert
            type={result.ok ? "success" : "error"}
            showIcon
            title={result.message}
            description={
              result.latency_ms != null ? `${result.latency_ms} ms` : undefined
            }
          />
        )}
      </Drawer>
    </div>
  );
}
