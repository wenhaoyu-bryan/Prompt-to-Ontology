import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import {
  Upload, FileText, Rows3, Columns3, CheckCircle2,
  Loader2, Brain, Database, RotateCcw, Table2,
  AlertCircle, Check, Link2, ArrowRight, Trash2,
} from 'lucide-react';
import GlobalSchemaMapper from './GlobalSchemaMapper';
import { inferSchemaMulti, batchImport } from '../api';

/**
 * DataPipeline — Foundry 风格数据流水线（多表版）
 * 三阶段: 上传解析 → AI 推断 + 映射校准 → 批量入库
 */
export default function DataPipeline({ onImportComplete, datasets = [], onDeleteDataset, onViewDataset }) {
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState('upload'); // upload | infer | mapping | importing | done
  const [globalSchema, setGlobalSchema] = useState(null);
  const [inferError, setInferError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [projectName, setProjectName] = useState('');

  const doneFiles = files.filter(f => f.status === 'done');
  const totalRows = doneFiles.reduce((sum, f) => sum + f.totalRows, 0);

  // ---- 多文件上传 ----
  const handleFiles = useCallback(async (fileList) => {
    const newFiles = [];
    for (const f of fileList) {
      if (!f.name.endsWith('.csv')) continue;

      try {
        const parsed = await parseMultiHeaderCSV(f);
        newFiles.push(parsed);
      } catch (e) {
        newFiles.push({
          status: 'error',
          file: f,
          filename: f.name,
          error: e.message,
        });
      }
    }
    setFiles(prev => {
      const existing = new Set(prev.map(ef => ef.filename));
      return [...prev, ...newFiles.filter(nf => !existing.has(nf.filename))];
    });
  }, []);

  // ---- AI 推断 ----
  const handleRunInfer = useCallback(async () => {
    const doneFiles = files.filter(f => f.status === 'done');
    if (doneFiles.length === 0) return;

    setPhase('infer');
    setInferError(null);

    try {
      const tablesPayload = doneFiles.map(f => ({
        filename: f.filename,
        tableDescription: f.tableDescription,
        fields: f.fields,
        sampleRows: f.sampleRows,
      }));

      const schema = await inferSchemaMulti(tablesPayload);
      setGlobalSchema(schema);
      setPhase('mapping');
    } catch (e) {
      const msg = e.code === 'ECONNABORTED'
        ? 'AI 推断超时（>2分钟），请检查后端 LLM 配置或稍后重试'
        : `AI 推断失败: ${e.response?.data?.detail || e.message}`;
      setInferError(msg);
      setPhase('upload');
    }
  }, [files]);

  // ---- 确认映射 → 批量导入 ----
  const handleConfirmMapping = useCallback(async (confirmed) => {
    setPhase('importing');
    setImportError(null);

    try {
      const doneFiles = files.filter(f => f.status === 'done');

      // dataset 名称：优先用用户输入的项目名
      const datasetName = projectName.trim()
        || files[0]?.tableDescription?.match(/^(.+?)（/)?.[1]?.trim()
        || files[0]?.filename?.match(/(.+?)\(/)?.[1]?.trim()
        || `import_${Date.now()}`;

      const tablesPayload = confirmed.tables.map(t => {
        const fileData = doneFiles.find(f => f.filename === t.filename);
        return {
          filename: t.filename,
          nodeType: t.nodeType,
          idColumn: t.idColumn,
          nameColumn: t.nameColumn,
          properties: t.properties,
          rows: fileData?.dataRows || [],
        };
      });

      const result = await batchImport({
        tables: tablesPayload,
        relationships: confirmed.relationships || [],
        dataset: datasetName,
      });

      setImportResult({ ...result, _dataset: datasetName });
      setPhase('done');
      setProjectName('');
      onImportComplete?.({ dataset: datasetName });
    } catch (e) {
      setImportError(`导入失败: ${e.response?.data?.detail || e.message}`);
      setPhase('mapping');
    }
  }, [files, onImportComplete]);

  // ---- 重置 ----
  const handleReset = useCallback(() => {
    setFiles([]);
    setPhase('upload');
    setGlobalSchema(null);
    setInferError(null);
    setImportResult(null);
    setImportError(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              数据流水线
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              数据集成 &rarr; AI 语义推断 &rarr; 映射校准 &rarr; 图谱写入
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 进度指示 */}
            <StepIndicator phase="upload" current={phase} label="上传" />
            <span className="text-neutral-700 text-xs">&rarr;</span>
            <StepIndicator phase="mapping" current={phase} label="推断 &amp; 校准" />
            <span className="text-neutral-700 text-xs">&rarr;</span>
            <StepIndicator phase="done" current={phase} label="导入" />

            {files.length > 0 && (
              <button onClick={handleReset}
                className="ml-3 flex items-center gap-1 px-2 py-1 text-[10px] text-neutral-500
                           hover:text-white rounded hover:bg-neutral-800 transition-colors">
                <RotateCcw className="w-3 h-3" /> 重置
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* 阶段 1: 上传 */}
        {phase === 'upload' && (
          <>
            {/* 拖拽上传 */}
            <div
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver ? 'border-cyan-500 bg-cyan-500/5' : 'border-neutral-700 hover:border-neutral-500'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                multiple
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
                className="hidden"
              />
              <Upload className="w-8 h-8 mx-auto mb-2 text-neutral-600" />
              <p className="text-sm text-neutral-400">拖拽 CSV 文件到此处（支持多文件）</p>
              <p className="text-[10px] text-neutral-600 mt-1">
                支持 3 行表头格式：表描述 + 中文字段名 + 英文字段 ID
              </p>
            </div>

            {/* 文件列表 */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-300">
                    已上传文件 ({doneFiles.length}/{files.length})
                  </p>
                  {doneFiles.length > 0 && (
                    <span className="text-[10px] text-neutral-500">
                      共 {totalRows.toLocaleString()} 行
                    </span>
                  )}
                </div>

                {files.map((f, i) => (
                  <FileCard key={i} fileData={f} onRemove={() => setFiles(prev => prev.filter((_, j) => j !== i))} />
                ))}

                {/* 项目名称 */}
                {doneFiles.length > 0 && (
                  <div className="flex items-center gap-3 px-1">
                    <label className="text-xs text-neutral-400 shrink-0">项目名称</label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder={doneFiles[0]?.tableDescription?.match(/^(.+?)（/)?.[1] || '输入项目名称'}
                      className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5
                                 text-xs text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                )}

                {/* 推断按钮 */}
                {doneFiles.length > 0 && (
                  <button
                    onClick={handleRunInfer}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3
                               bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold
                               text-white transition-colors"
                  >
                    <Brain className="w-4 h-4" />
                    AI 联合推断 ({doneFiles.length} 张表)
                  </button>
                )}
              </div>
            )}

            {/* 错误 */}
            {inferError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {inferError}
              </div>
            )}
          </>
        )}

        {/* 阶段 2: AI 推断中 */}
        {phase === 'infer' && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
            <p className="text-base text-cyan-400 font-medium">AI 正在联合分析 {doneFiles.length} 张表...</p>
            <p className="text-xs text-neutral-500 mt-2">推断节点类型、属性映射、跨表关系</p>
          </div>
        )}

        {/* 阶段 3: 映射校准 */}
        {phase === 'mapping' && globalSchema && (
          <>
            <GlobalSchemaMapper
              schema={globalSchema}
              files={doneFiles}
              onConfirm={handleConfirmMapping}
            />
            {importError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {importError}
              </div>
            )}
          </>
        )}

        {/* 阶段 4: 导入中 */}
        {phase === 'importing' && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
            <p className="text-base text-cyan-400 font-medium">UNWIND 批量写入 Neo4j...</p>
            <p className="text-xs text-neutral-500 mt-2">正在导入节点和关系</p>
          </div>
        )}

        {/* 阶段 5: 导入完成 */}
        {phase === 'done' && importResult && (
          <ImportResultPanel result={importResult} onReset={handleReset} onGoToGraph={() => onImportComplete?.({ dataset: importResult?._dataset })} />
        )}
      </div>

      {/* 已导入项目列表 */}
      {datasets.length > 0 && (
        <div className="shrink-0 border-t border-neutral-800 px-6 py-4">
          <h3 className="text-xs font-semibold text-neutral-400 mb-3 uppercase tracking-wider">
            已导入项目 ({datasets.length})
          </h3>
          <div className="space-y-2">
            {datasets.map((ds) => (
              <div key={ds.name} className="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 rounded-lg px-4 py-2.5">
                <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-white">{ds.label}</p>
                    {ds.builtIn && (
                      <span className="text-[8px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">内置</span>
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    {ds.nodeCount?.toLocaleString()} 节点 · {ds.relCount} 链路
                  </p>
                </div>
                <button
                  onClick={() => onViewDataset?.(ds.name)}
                  className="px-3 py-1.5 text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors"
                >
                  查看图谱
                </button>
                {!ds.builtIn && (
                  <button
                    onClick={() => {
                      if (confirm(`确定删除「${ds.label}」？此操作不可撤销。`)) {
                        onDeleteDataset?.(ds.name);
                      }
                    }}
                    className="p-1.5 text-neutral-600 hover:text-red-400 transition-colors"
                    title="删除项目"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ---- 子组件 ----

function FileCard({ fileData, onRemove }) {
  if (fileData.status === 'error') {
    return (
      <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        <span className="text-xs text-red-400">{fileData.filename}</span>
        <span className="text-[10px] text-red-400/70 ml-auto">{fileData.error}</span>
        <button onClick={onRemove} className="text-neutral-600 hover:text-red-400 ml-2">&times;</button>
      </div>
    );
  }

  if (fileData.status === 'parsing') {
    return (
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
        <span className="text-xs text-neutral-400">{fileData.filename}</span>
        <span className="text-[10px] text-neutral-500 ml-auto">解析中...</span>
      </div>
    );
  }

  const isFact = fileData.tableDescription?.includes('事实表');

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 flex items-center gap-2">
      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
      <span className="text-xs font-medium text-white">{fileData.filename}</span>
      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
        isFact ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
      }`}>
        {isFact ? '事实表' : '维度表'}
      </span>
      <div className="flex gap-2 ml-auto text-[10px]">
        <span className="text-blue-400"><Rows3 className="w-3 h-3 inline" /> {fileData.totalRows?.toLocaleString()}</span>
        <span className="text-purple-400"><Columns3 className="w-3 h-3 inline" /> {fileData.columnCount}</span>
      </div>
      <button onClick={onRemove} className="text-neutral-600 hover:text-red-400 ml-1">&times;</button>
    </div>
  );
}


function ImportResultPanel({ result, onReset, onGoToGraph }) {
  return (
    <div className="space-y-4">
      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Check className="w-5 h-5 text-green-400" />
          <span className="text-base font-semibold text-green-400">导入完成</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{result.total_imported?.toLocaleString() || 0}</p>
            <p className="text-xs text-neutral-500">导入记录</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{result.total_duration_ms || 0}ms</p>
            <p className="text-xs text-neutral-500">耗时</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">
              {Object.keys(result.nodes || {}).length + Object.keys(result.edges || {}).length}
            </p>
            <p className="text-xs text-neutral-500">写入类型</p>
          </div>
        </div>
      </div>

      {/* 各类型明细 */}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(result.nodes || {}).map(([type, detail]) => (
          <div key={type} className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 text-xs">
            <span className="text-cyan-400 font-semibold">{type}</span>
            <span className="text-neutral-500 ml-2">{detail.imported} 条 &middot; {detail.duration_ms}ms</span>
          </div>
        ))}
        {Object.entries(result.edges || {}).map(([key, detail]) => (
          <div key={key} className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 text-xs">
            <Link2 className="w-3 h-3 text-purple-400 inline mr-1" />
            <span className="text-purple-400 font-semibold">{key}</span>
            <span className="text-neutral-500 ml-2">{detail.imported} 条 &middot; {detail.duration_ms}ms</span>
          </div>
        ))}
      </div>

      {/* 查看图谱引导 */}
      {onGoToGraph && (
        <button
          onClick={onGoToGraph}
          className="w-full flex items-center justify-center gap-2 px-4 py-3
                     bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold
                     text-white transition-colors"
        >
          查看图谱 <ArrowRight className="w-4 h-4" />
        </button>
      )}

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                   bg-neutral-800 hover:bg-neutral-700 border border-neutral-700
                   rounded-lg text-sm text-neutral-300 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" /> 继续导入其他数据
      </button>
    </div>
  );
}


function StepIndicator({ phase, current, label }) {
  const phases = ['upload', 'mapping', 'done'];
  const currentIdx = phases.indexOf(current);
  const targetIdx = phases.indexOf(phase);
  const isActive = currentIdx >= targetIdx;
  const isCurrent = phase === current ||
    (phase === 'mapping' && ['mapping', 'infer', 'importing'].includes(current));

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
      isCurrent ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
      isActive ? 'bg-green-500/10 text-green-400 border-green-500/30' :
      'bg-neutral-800 text-neutral-500 border-neutral-700'
    }`}>
      {label}
    </span>
  );
}


// ---- CSV 解析核心 ----

async function parseMultiHeaderCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const allRows = results.data;
        if (allRows.length < 3) {
          reject(new Error('CSV 至少需要 3 行（中文名 + 英文名 + 数据）'));
          return;
        }

        // 第 1 行：可能是表描述，也可能是中文字段名
        // 判断逻辑：如果第 1 行只有第 1 列有值且其余为空，就是表描述
        const row0 = allRows[0];
        const row0NonEmpty = row0.filter(v => v && v.trim()).length;

        let tableDescription = '';
        let chineseNames, fieldIds, dataStartIdx;

        if (row0NonEmpty === 1) {
          // 第 1 行是表描述
          tableDescription = row0[0];
          chineseNames = allRows[1];
          fieldIds = allRows[2];
          dataStartIdx = 3;
        } else {
          // 第 1 行直接是中文字段名（无表描述行）
          tableDescription = file.name;
          chineseNames = allRows[0];
          fieldIds = allRows[1];
          dataStartIdx = 2;
        }

        chineseNames = chineseNames.filter(v => v && v.trim());
        fieldIds = fieldIds.filter(v => v && v.trim());
        const colCount = Math.min(chineseNames.length, fieldIds.length);

        // 构建 FieldMetadata
        const fields = [];
        for (let i = 0; i < colCount; i++) {
          const sampleValues = [];
          for (let r = dataStartIdx; r < Math.min(allRows.length, dataStartIdx + 20); r++) {
            const val = allRows[r]?.[i];
            if (val && val.trim()) sampleValues.push(val.trim());
          }

          fields.push({
            chineseName: chineseNames[i]?.trim() || '',
            fieldId: fieldIds[i]?.trim() || '',
            dataType: inferDataType(sampleValues),
            sampleValues: sampleValues.slice(0, 3),
          });
        }

        // 数据行
        const dataRows = [];
        for (let r = dataStartIdx; r < allRows.length; r++) {
          const row = allRows[r];
          if (!row || row.every(v => !v || !v.trim())) continue;
          const obj = {};
          for (let i = 0; i < colCount; i++) {
            obj[fieldIds[i]?.trim()] = row[i]?.trim() || '';
          }
          dataRows.push(obj);
        }

        resolve({
          status: 'done',
          file,
          filename: file.name,
          tableDescription,
          fields,
          dataRows,
          sampleRows: dataRows.slice(0, 5),
          totalRows: dataRows.length,
          columnCount: colCount,
        });
      },
      error: (err) => reject(err),
    });
  });
}

function inferDataType(values) {
  if (values.length === 0) return 'string';
  let numCount = 0, dateCount = 0;
  for (const v of values) {
    if (/^-?\d+(\.\d+)?$/.test(v)) numCount++;
    if (/^\d{4}[-/]\d{2}(-\d{2})?$/.test(v)) dateCount++;
  }
  if (dateCount > values.length * 0.5) return 'date';
  if (numCount > values.length * 0.5) return 'number';
  return 'string';
}
