import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Typography,
  message,
} from "antd";
import { useTranslation } from "react-i18next";
import { api } from "../../providers/dataProvider";
const { Text } = Typography;
export default function LlmConfigDialog({
  open: configModalOpen,
  onClose,
  llmStatus,
  onStatusChange: setLlmStatus,
}) {
  const { t } = useTranslation();
  const [configForm, setConfigForm] = useState({
    provider: "openai",
    api_key: "",
    model: "gpt-4o-mini",
    base_url: "https://api.openai.com/v1",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  useEffect(() => {
    if (configModalOpen && llmStatus?.configured)
      setConfigForm((p) => ({
        ...p,
        provider: llmStatus.provider,
        model: llmStatus.model,
        base_url: llmStatus.base_url,
      }));
  }, [
    configModalOpen,
    llmStatus?.provider,
    llmStatus?.model,
    llmStatus?.base_url,
  ]);
  const setConfigModalOpen = (value) => {
    if (!value) {
      setConfigForm((p) => ({ ...p, api_key: "" }));
      onClose();
    }
  };
  const loadLLMStatus = async () => {
    const { data } = await api.get("/llm/config");
    setLlmStatus(data);
  };
  const handleSaveConfig = async () => {
    try {
      const { data } = await api.post("/llm/config", configForm);
      setLlmStatus(data);
      setConfigModalOpen(false);
      message.success(t("agent.configSaved"));
      loadLLMStatus();
    } catch (err) {
      message.error(t("agent.configSaveFailed"));
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post(
        "/llm/test",
        configForm.api_key ? configForm : {},
      );
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, message: t("agent.testFailed") });
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteConfig = async () => {
    try {
      await api.delete("/llm/config");
      setLlmStatus({ configured: false, source: "none" });
      message.success(t("agent.runtimeDeleted"));
      loadLLMStatus();
    } catch {
      message.error(t("agent.runtimeDeleteFailed"));
    }
  };

  return (
    <Modal
      title={t("agent.llmConfigTitle")}
      open={configModalOpen}
      onCancel={() => {
        setConfigModalOpen(false);
        setTestResult(null);
      }}
      footer={null}
      width={480}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        {llmStatus?.configured && (
          <Alert
            type={llmStatus.source === "runtime" ? "success" : "info"}
            title={`${t("agent.currentConfig")}${llmStatus.provider} / ${llmStatus.model}`}
            description={
              llmStatus.source === "runtime"
                ? t("agent.runtimeDesc")
                : t("agent.envDesc")
            }
            showIcon
          />
        )}

        <div>
          <Text>{t("agent.provider")}</Text>
          <Select
            value={configForm.provider}
            onChange={(v) => {
              const defaults = {
                openai: {
                  base_url: "https://api.openai.com/v1",
                  model: "gpt-4o-mini",
                },
                anthropic: {
                  base_url: "https://api.anthropic.com/v1",
                  model: "claude-sonnet-4-20250514",
                },
                deepseek: {
                  base_url: "https://api.deepseek.com",
                  model: "deepseek-flash",
                },
                mimo: { base_url: "https://api.xiaomimimo.com/v1", model: "" },
                minimax: { base_url: "https://api.minimax.chat/v1", model: "" },
              };
              const d = defaults[v] || {};
              setConfigForm((p) => ({
                ...p,
                provider: v,
                base_url: d.base_url ?? p.base_url,
                model: d.model ?? p.model,
              }));
            }}
            style={{ width: "100%", marginTop: 4 }}
            options={[
              { label: "OpenAI", value: "openai" },
              { label: "Anthropic", value: "anthropic" },
              { label: "DeepSeek", value: "deepseek" },
              { label: "Mimo", value: "mimo" },
              { label: "MiniMax", value: "minimax" },
            ]}
          />
        </div>

        <div>
          <Text>{t("agent.model")}</Text>
          <Input
            value={configForm.model}
            onChange={(e) =>
              setConfigForm((p) => ({ ...p, model: e.target.value }))
            }
            placeholder={t("agent.modelPlaceholder")}
            style={{ marginTop: 4 }}
          />
        </div>

        <div>
          <Text>{t("agent.baseUrl")}</Text>
          <Input
            value={configForm.base_url}
            onChange={(e) =>
              setConfigForm((p) => ({ ...p, base_url: e.target.value }))
            }
            placeholder="https://api.openai.com/v1"
            style={{ marginTop: 4 }}
          />
        </div>

        <div>
          <Text>{t("agent.apiKey")}</Text>
          <Input.Password
            value={configForm.api_key}
            onChange={(e) =>
              setConfigForm((p) => ({ ...p, api_key: e.target.value }))
            }
            placeholder={t("agent.apiKeyPlaceholder")}
            style={{ marginTop: 4 }}
          />
        </div>

        <Alert type="warning" title={t("agent.securityNote")} showIcon />

        {testResult && (
          <Alert
            type={testResult.ok ? "success" : "error"}
            title={testResult.message}
            description={
              testResult.ok && testResult.latency_ms != null
                ? `${t("agent.latency")}${testResult.latency_ms}ms`
                : undefined
            }
            showIcon
          />
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="primary"
            onClick={handleSaveConfig}
            disabled={!configForm.api_key}
          >
            {t("common.save")}
          </Button>
          <Button onClick={handleTestConnection} loading={testing}>
            {t("agent.testConnection")}
          </Button>
          {llmStatus?.source === "runtime" && (
            <Button danger onClick={handleDeleteConfig}>
              {t("agent.deleteRuntimeKey")}
            </Button>
          )}
        </div>
      </Space>
    </Modal>
  );
}
