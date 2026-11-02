import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Button } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import LlmConfigDialog from "../query/LlmConfigDialog";

export default function BuildNavigation({
  mode,
  disabled = false,
  onModelsChanged,
}) {
  const [modelsOpen, setModelsOpen] = useState(false);
  const { i18n } = useTranslation();
  const location = useLocation();
  const zh = i18n.language.startsWith("zh");
  const items = [
    {
      mode: "import",
      to: "/pipeline?mode=assisted",
      label: zh ? "导入数据" : "Import data",
    },
    {
      mode: "schema",
      to: "/pipeline?mode=schema",
      label: zh ? "设计本体草稿" : "Design schema draft",
    },
    {
      mode: "manual",
      to: "/pipeline?mode=manual",
      label: zh ? "手动配置" : "Manual configuration",
    },
  ];
  return (
    <nav
      className="build-navigation"
      aria-label={zh ? "本体构建方式" : "Build mode"}
    >
      {items.map((item) => (
        <Link
          key={item.mode}
          to={
            mode === item.mode
              ? `${location.pathname}${location.search}${location.hash}`
              : item.to
          }
          aria-current={mode === item.mode ? "page" : undefined}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          className={`${item.mode === mode ? "is-current" : ""} ${item.mode === "manual" ? "build-navigation-advanced" : ""}`}
          onClick={(event) => {
            if (
              disabled ||
              (mode === item.mode && !event.metaKey && !event.ctrlKey)
            )
              event.preventDefault();
          }}
        >
          {item.label}
        </Link>
      ))}
      <Button
        type="text"
        icon={<SettingOutlined />}
        disabled={disabled}
        style={{ marginLeft: "auto", flexShrink: 0 }}
        onClick={() => setModelsOpen(true)}
      >
        {zh ? "模型配置" : "Model settings"}
      </Button>
      <LlmConfigDialog
        open={modelsOpen}
        onClose={() => {
          setModelsOpen(false);
          onModelsChanged?.();
        }}
      />
    </nav>
  );
}
