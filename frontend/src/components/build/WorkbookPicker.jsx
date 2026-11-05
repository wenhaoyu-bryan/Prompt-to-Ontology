import { useEffect, useState } from "react";
import { Alert, Button, InputNumber, Modal, Select, Space, Table } from "antd";
import { api } from "../../providers/dataProvider";

export const isWorkbook = (file) => /\.xlsx$/i.test(file.name);

export function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",", 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function WorkbookPicker({ file, tr, onClose, onSelect }) {
  const [sheet, setSheet] = useState(file.sheet);
  const [header, setHeader] = useState(file.header_row ?? 1);
  const [request, setRequest] = useState({ sheet, header_row: header });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .post("/assisted-build/xlsx/preview", { content: file.content, ...request }, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setPreview(data);
        setSheet(data.sheet);
        setHeader(data.header_row);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        const detail = cause.response?.data?.detail;
        setError(typeof detail === "string" ? detail : true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [file.content, request]);

  const validHeader = Number.isInteger(header) && header >= 1 && header <= 100;
  const current = preview?.sheet === sheet && preview?.header_row === header;
  const ready = !loading && !error && current && !preview?.error && preview?.rows?.length > 0;
  const errorMessage = error === true
    ? tr("Workbook preview failed.", "工作簿预览失败。")
    : error || (current && preview?.error);
  const rows = (preview?.rows || []).map((cells, index) => ({
    rowNumber: preview.row_numbers[index], cells,
  }));
  const columns = [
    { title: tr("Excel row", "Excel 行号"), dataIndex: "rowNumber", key: "rowNumber" },
    ...(preview?.columns || []).map((title, index) => ({
      title,
      key: index,
      render: (_, row) => row.cells[index] == null ? "—" : String(row.cells[index]),
    })),
  ];

  return (
    <Modal
      open
      title={tr("Configure workbook", "配置工作簿")}
      width={760}
      onCancel={onClose}
      onOk={() => onSelect({ sheet, header_row: header })}
      okText={tr("Use worksheet", "使用此工作表")}
      cancelText={tr("Cancel", "取消")}
      okButtonProps={{ disabled: !ready }}
    >
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <div>{file.name}</div>
        <Space wrap align="end">
          <div>
            <label htmlFor="workbook-sheet">{tr("Worksheet", "工作表")}</label>
            <Select
              id="workbook-sheet"
              aria-label={tr("Worksheet", "工作表")}
              value={sheet}
              onChange={(name) => {
                setSheet(name);
                setHeader(1);
              }}
              options={(preview?.sheets || []).map((name) => ({ label: name, value: name }))}
              style={{ display: "block", minWidth: 160 }}
              disabled={loading || !preview?.sheets?.length}
            />
          </div>
          <div>
            <label htmlFor="workbook-header">{tr("Header row", "表头行")}</label>
            <InputNumber
              id="workbook-header"
              aria-label={tr("Header row", "表头行")}
              value={header}
              min={1}
              max={100}
              precision={0}
              onChange={setHeader}
              style={{ display: "block" }}
              disabled={loading}
            />
          </div>
          <Button
            loading={loading}
            disabled={!validHeader}
            onClick={() => setRequest({ sheet, header_row: header })}
          >
            {tr("Preview worksheet", "预览工作表")}
          </Button>
        </Space>
        {errorMessage && (
          <Alert type="error" showIcon title={errorMessage} />
        )}
        {current && !error && !preview?.error && rows.length > 0 && (
          <Table
            size="small"
            rowKey="rowNumber"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: "max-content", y: 320 }}
          />
        )}
      </Space>
    </Modal>
  );
}
