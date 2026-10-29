import { useState } from "react";
import { Alert, Button, Empty, Select, Table, Tabs, Tag } from "antd";
import { ArrowRightOutlined, LinkOutlined } from "@ant-design/icons";
import EvidencePath from "../graph/EvidencePath";

const scalar = (value) =>
  value == null
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
const label = (name) =>
  name.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

export default function AnswerEvidence({
  result,
  zh,
  onGraph,
  onSubmit,
  submitted,
}) {
  const results = result.tool_results || [];
  const paths = results.flatMap((item) => item.paths || []);
  const [pathIndex, setPathIndex] = useState(0);
  const [source, setSource] = useState(null);
  const path = paths[pathIndex] || paths[0];
  const limitations = [
    ...new Set(
      results.flatMap((item) => [
        ...(item.limitations || []),
        ...(item.status !== "success" && item.message ? [item.message] : []),
      ]),
    ),
  ];
  const renderData = (data, key) => {
    if (Array.isArray(data)) {
      if (!data.length)
        return (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={zh ? "没有匹配的记录" : "No matching records"}
          />
        );
      if (
        data.every(
          (row) => row && typeof row === "object" && !Array.isArray(row),
        )
      ) {
        const keys = [...new Set(data.flatMap(Object.keys))].slice(0, 9);
        return (
          <Table
            size="small"
            dataSource={data.map((row, i) => ({
              ...row,
              _query_row: `${key}-${i}`,
            }))}
            rowKey="_query_row"
            pagination={
              data.length > 6 ? { pageSize: 6, size: "small" } : false
            }
            scroll={{ x: "max-content" }}
            columns={keys.map((name) => ({
              title: label(name),
              dataIndex: name,
              key: name,
              render: (value) =>
                /^(PF|ING|BR|RR)\d+$/.test(String(value)) ? (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => onGraph({ source_id: String(value) })}
                  >
                    {String(value)}
                  </Button>
                ) : (
                  <span className="query-cell">{scalar(value)}</span>
                ),
            }))}
          />
        );
      }
      return (
        <div className="query-value-tags">
          {data.map((value, i) => (
            <Tag key={i}>{scalar(value)}</Tag>
          ))}
        </div>
      );
    }
    if (
      data &&
      typeof data === "object" &&
      Object.values(data).every(
        (value) => value == null || typeof value !== "object",
      )
    ) {
      return (
        <dl className="query-attributes">
          {Object.entries(data).map(([name, value]) => (
            <div key={name}>
              <dt>{label(name)}</dt>
              <dd>{scalar(value)}</dd>
            </div>
          ))}
        </dl>
      );
    }
    if (data && typeof data === "object")
      return (
        <div className="query-object-data">
          {Object.entries(data).map(([name, value]) => (
            <div key={name}>
              <h4>{label(name)}</h4>
              {typeof value === "object" && value !== null ? (
                renderData(value, `${key}-${name}`)
              ) : (
                <span>{scalar(value)}</span>
              )}
            </div>
          ))}
        </div>
      );
    return <span>{scalar(data)}</span>;
  };
  const items = [
    {
      key: "facts",
      label: zh ? "查询结果" : "Results",
      children: results.length ? (
        results.map((item, index) => (
          <section className="query-tool-result" key={index}>
            <div className="query-section-heading">
              <b>{item.tool_name}</b>
              <Tag>{item.status}</Tag>
            </div>
            {item.data != null ? (
              renderData(item.data, index)
            ) : (
              <Alert
                type="warning"
                title={
                  item.message ||
                  (zh ? "本工具未返回结果" : "No result returned")
                }
              />
            )}
          </section>
        ))
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            zh
              ? "本轮未返回结构化工具结果"
              : "This run did not return structured tool results"
          }
        />
      ),
    },
    {
      key: "path",
      label: `${zh ? "关系路径" : "Relationships"}${paths.length ? ` · ${paths.length}` : ""}`,
      children: path ? (
        <>
          <div className="query-path-toolbar">
            <Select
              aria-label={zh ? "选择关系路径" : "Choose a relationship"}
              value={Math.min(pathIndex, paths.length - 1)}
              onChange={setPathIndex}
              options={paths.map((step, i) => ({
                value: i,
                label: `${step.source_id} → ${step.relation} → ${step.target_id}`,
              }))}
            />
            <Button icon={<ArrowRightOutlined />} onClick={() => onGraph(path)}>
              {zh ? "在图谱中查看" : "Explore in graph"}
            </Button>
          </div>
          <EvidencePath
            path={[path]}
            zh={zh}
            label={zh ? "本轮运行时关系路径" : "Runtime relationship path"}
          />
          <p className="query-note">
            {zh
              ? "路径端点来自本轮实际查询返回的关系。"
              : "Relationship endpoints returned by this query run."}
          </p>
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            zh
              ? "本轮未返回可展示的关系路径"
              : "No relationship path was returned for this run"
          }
        />
      ),
    },
    {
      key: "sources",
      label: zh ? "来源依据" : "Sources",
      children: (
        <>
          <p className="query-note">
            {zh
              ? "以下是运行时工具的返回依据。本轮未提供原始文件行或文档片段引用。"
              : "These references come from runtime tool results. Original file-row or document citations were not supplied for this run."}
          </p>
          {results.map((item, i) => (
            <button
              type="button"
              className="query-source"
              key={i}
              onClick={() => setSource(source === i ? null : i)}
            >
              <LinkOutlined />
              <span>
                <b>{item.tool_name}</b>
                <small>
                  {zh
                    ? "工具结果与返回依据"
                    : "Tool result and returned evidence"}
                </small>
              </span>
              <ArrowRightOutlined />
            </button>
          ))}
          {source !== null && results[source] && (
            <div className="query-source-detail">
              <h4>{results[source].tool_name}</h4>
              <ul>
                {(results[source].evidence || []).map((line, i) => (
                  <li key={i}>{scalar(line)}</li>
                ))}
              </ul>
              <pre>{JSON.stringify(results[source].data, null, 2)}</pre>
            </div>
          )}
        </>
      ),
    },
  ];
  if (limitations.length)
    items.push({
      key: "limits",
      label: `${zh ? "无法确认" : "Limitations"} · ${limitations.length}`,
      children: (
        <Alert
          type="warning"
          showIcon
          title={zh ? "本轮数据范围与缺口" : "Data scope and gaps"}
          description={
            <ul>
              {limitations.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          }
        />
      ),
    });
  if (result.suggestions?.length)
    items.push({
      key: "changes",
      label: `${zh ? "变更建议" : "Proposed changes"} · ${result.suggestions.length}`,
      children: (
        <>
          {result.suggestions.map((item) => (
            <div className="query-proposal" key={item.id}>
              <b>{item.title}</b>
              <p>{item.reason}</p>
              {item.property_update && (
                <code>
                  {item.property_update.property}:{" "}
                  {scalar(item.property_update.old_value)} →{" "}
                  {scalar(item.property_update.new_value)}
                </code>
              )}
            </div>
          ))}
          <Button type="primary" onClick={onSubmit} disabled={!!submitted}>
            {submitted
              ? zh
                ? "已提交审核"
                : "Submitted to review"
              : zh
                ? "提交到审核队列"
                : "Submit to Review Queue"}
          </Button>
        </>
      ),
    });
  return (
    <div className="query-evidence" data-testid="query-evidence">
      <Tabs items={items} size="small" />
    </div>
  );
}
