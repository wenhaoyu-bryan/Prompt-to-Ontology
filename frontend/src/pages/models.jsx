import { useTranslation } from "react-i18next";
import PageHeader from "../components/common/PageHeader";
import ModelConfiguration from "../components/models/ModelConfiguration";

export default function ModelsPage() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith("zh");
  return (
    <div>
      <PageHeader
        title={zh ? "模型配置" : "Model configuration"}
        subtitle={
          zh
            ? "管理模型连接，为辅助构建和图谱问答分别选择模型。"
            : "Manage connections and choose a model for each agent."
        }
      />
      <ModelConfiguration />
    </div>
  );
}
