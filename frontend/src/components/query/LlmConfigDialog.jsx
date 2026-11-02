import { useState } from "react";
import { Drawer } from "antd";
import { useTranslation } from "react-i18next";
import ModelConfiguration from "../models/ModelConfiguration";
export default function LlmConfigDialog({ open, onClose, onStatusChange }) {
  const [busy, setBusy] = useState(false);
  const { i18n } = useTranslation();
  return (
    <Drawer
      title={
        i18n.language.startsWith("zh") ? "模型配置" : "Model configuration"
      }
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      maskClosable={!busy}
      closable={!busy}
      keyboard={!busy}
      size={860}
      destroyOnHidden
    >
      {open && (
        <ModelConfiguration
          onStatusChange={onStatusChange}
          onBusyChange={setBusy}
        />
      )}
    </Drawer>
  );
}
