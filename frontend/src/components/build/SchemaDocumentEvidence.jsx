import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Spin, Tag, message } from "antd";
import { DeleteOutlined, FileTextOutlined, UploadOutlined } from "@ant-design/icons";

const MAX_DOCUMENTS = 3;
const MAX_DOCUMENT_BYTES = 12 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024;
const MAX_LINES = 600;
const linesOf = (content) => content.replace(/\r\n?/g, "\n").split("\n");

export function MarkdownReferences({ documents, setDocuments, readOnly, pending, reading, setReading, requiresAgent, tr }) {
  const input = useRef(null);
  const readFiles = async (event) => {
    const files = Array.from(event.target.files);
    event.target.value = "";
    if (!files.length) return;
    if (documents.length + files.length > MAX_DOCUMENTS || files.some((file) => (
      !/\.md$/i.test(file.name) || file.size > MAX_DOCUMENT_BYTES
    ))) {
      message.error(tr("Choose up to 3 Markdown files of 12 KiB each.", "最多选择 3 个 Markdown 文件，每个不超过 12 KiB。"));
      return;
    }
    setReading(true);
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
      const added = await Promise.all(files.map(async (file) => ({
        name: file.name,
        content: decoder.decode(await file.arrayBuffer()),
      })));
      const next = [...documents, ...added];
      const bytes = next.reduce((total, doc) => total + new Blob([doc.content]).size, 0);
      const lines = next.reduce((total, doc) => total + linesOf(doc.content).length, 0);
      if (bytes > MAX_TOTAL_BYTES || lines > MAX_LINES || added.some((doc) => !doc.content.trim() || doc.content.includes("\0"))) {
        message.error(tr("Use non-empty Markdown with at most 24 KiB and 600 lines in total.", "请使用非空 Markdown，总大小不超过 24 KiB，总行数不超过 600。"));
        return;
      }
      if (input.current) setDocuments(next);
    } catch {
      message.error(tr("Could not read the Markdown as UTF-8.", "无法按 UTF-8 读取 Markdown。"));
    } finally {
      setReading(false);
    }
  };

  if (readOnly && !documents.length) return null;
  return (
    <div className="sd-reference-documents">
      <h4>{tr("Markdown references", "Markdown 参考文档")}</h4>
      <p className="ab-muted">
        {tr("Add product documentation or SOPs for business context. If you enable Build Agent, the configured model provider receives the document text.", "可添加产品文档或 SOP 补充业务语义。启用构建 Agent 后，文档正文会发送给当前配置的模型服务。")}
      </p>
      {!readOnly && (
        <>
          <input
            type="file"
            hidden
            ref={input}
            aria-label={tr("Upload Markdown reference documents", "上传 Markdown 参考文档")}
            accept=".md"
            multiple
            disabled={pending || reading}
            onChange={readFiles}
          />
          <Button size="small" icon={<UploadOutlined />} loading={reading} disabled={pending} onClick={() => input.current?.click()}>
            {tr("Add Markdown files", "添加 Markdown 文件")}
          </Button>
          <p className="ab-muted sd-document-limit">{tr("3 files · 12 KiB each · 24 KiB and 600 lines total", "最多 3 个文件 · 单个 12 KiB · 总计 24 KiB 和 600 行")}</p>
        </>
      )}
      {documents.map((doc, index) => (
        <div className="ab-file" key={doc.id || index}>
          <FileTextOutlined />
          <div><b>{doc.name}</b></div>
          {!readOnly && (
            <Button type="text" icon={<DeleteOutlined />} disabled={pending || reading}
              aria-label={`${tr("Remove", "移除")} ${doc.name}`}
              onClick={() => setDocuments((items) => items.filter((_, i) => i !== index))} />
          )}
        </div>
      ))}
      {requiresAgent && !readOnly && (
        <Alert type="info" showIcon title={tr("Select Build Agent under Design assistant to use these documents.", "请在设计助手中选择构建 Agent，以使用这些文档。")} />
      )}
    </div>
  );
}

function targetName(suggestion, run) {
  if (!suggestion.target_id) return "";
  const [id, property] = suggestion.target_id.split("/");
  const item = (suggestion.kind === "relationship" ? run.links : run.objects).find((entry) => entry.id === id);
  if (!item) return suggestion.target_id;
  return property ? `${item.name}.${property}` : item.name;
}

export function DocumentSuggestions({ run, loadDocument, tr }) {
  const [viewer, setViewer] = useState(null);
  const [fullDocument, setFullDocument] = useState(false);
  const request = useRef(0);
  const sourcePane = useRef(null);
  useEffect(() => {
    const pane = sourcePane.current;
    const firstCitedLine = pane?.querySelector(".sd-source-line-cited");
    if (firstCitedLine) pane.scrollTop = Math.max(0, firstCitedLine.offsetTop - 28);
  }, [viewer?.lines, fullDocument]);
  const suggestions = run.document_suggestions || [];
  const fallback = run.steps?.some((step) => step.method === "model" && step.status === "fallback");
  const kinds = {
    object: tr("Object", "对象"),
    property: tr("Property", "属性"),
    relationship: tr("Relationship", "关系"),
    term: tr("Term candidate", "术语候选"),
    rule: tr("Rule candidate", "规则候选"),
  };
  const open = async (citation) => {
    const token = ++request.current;
    setFullDocument(false);
    setViewer({ citation });
    try {
      const { data } = await loadDocument(citation.document_id);
      if (token === request.current) setViewer({ citation, lines: linesOf(data.content) });
    } catch (error) {
      if (token === request.current && error.name !== "AbortError") setViewer({ citation, failed: true });
    }
  };
  const close = () => {
    request.current++;
    setViewer(null);
  };
  const citation = viewer?.citation;
  const lower = fullDocument ? 0 : Math.max(0, (citation?.start_line ?? 1) - 5);
  const upper = fullDocument ? viewer?.lines?.length : (citation?.end_line ?? 1) + 4;
  const lineRange = (start, end) => start === end ? String(start) : `${start}–${end}`;

  return (
    <section className="ab-panel sd-document-suggestions" aria-label={tr("Document-backed suggestions", "文档依据与建议")}>
      <h3>{tr("Document-backed suggestions", "文档依据与建议")}</h3>
      <p className="ab-muted">{tr("Original Build Agent suggestions for review. Term and rule candidates are notes for reviewers.", "以下是构建 Agent 的原始建议。术语与规则候选供审核参考。")}</p>
      {!suggestions.length && (
        <Alert type={fallback ? "warning" : "info"} showIcon title={fallback
          ? tr("The model was unavailable or returned invalid evidence. Review the parsed DDL draft.", "模型不可用或未返回有效依据。仍可审核 DDL 解析草稿。")
          : tr("The Build Agent did not return any cited suggestions.", "构建 Agent 未返回带原文引用的建议。")} />
      )}
      {suggestions.map((item) => {
        const source = item.citation;
        const target = targetName(item, run);
        const line = source.start_line === source.end_line ? tr("line", "行") : tr("lines", "行");
        return (
          <article className="sd-document-suggestion" key={item.id}>
            <Tag>{kinds[item.kind]}</Tag>
            {target && <small>{target}</small>}
            {(item.label || item.title) && <h4>{item.label || item.title}</h4>}
            {item.description && <p>{item.description}</p>}
            <Button type="link" size="small" className="sd-source-link" icon={<FileTextOutlined />} onClick={() => open(source)}>
              {source.name} · {line} {lineRange(source.start_line, source.end_line)}
            </Button>
          </article>
        );
      })}
      <Modal open={!!viewer} title={citation?.name} onCancel={close} footer={null} width={720}>
        {viewer && (
          <>
            {citation.heading && <h4>{citation.heading}</h4>}
            <p>{tr("Cited line", "引用行")} {lineRange(citation.start_line, citation.end_line)}</p>
            {viewer.failed ? (
              <Alert type="error" showIcon title={tr("The original source could not be loaded.", "无法加载文档原文。")} />
            ) : viewer.lines ? (
              <>
                <div ref={sourcePane} className="sd-source-lines" role="region" aria-label={tr("Original document text", "原始文档内容")} tabIndex={0}>
                  {viewer.lines.slice(lower, upper).map((line, index) => {
                    const number = index + lower + 1;
                    const cited = number >= citation.start_line && number <= citation.end_line;
                    return (
                      <div className={cited ? "sd-source-line sd-source-line-cited" : "sd-source-line"} key={number}>
                        <span aria-hidden="true">{number}</span><code>{line || " "}</code>
                      </div>
                    );
                  })}
                </div>
                {(citation.start_line > 5 || citation.end_line + 4 < viewer.lines.length) && (
                  <Button type="link" onClick={() => setFullDocument((show) => !show)}>
                    {fullDocument ? tr("Show cited context", "只看引用上下文") : tr("Show full document", "查看全文")}
                  </Button>
                )}
              </>
            ) : <Spin />}
          </>
        )}
      </Modal>
    </section>
  );
}
