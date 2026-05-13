import { useState, useCallback, useMemo } from 'react';
import { Database, Key, Hash, ArrowRight, Check, Link2, Table2 } from 'lucide-react';

/**
 * 全局映射校准编辑器
 * @param {object} schema - { tables: [...], relationships: [...] }
 * @param {object[]} files - 已解析的文件列表（含 fields 和 sampleRows）
 * @param {function} onConfirm - 确认映射回调
 */
export default function GlobalSchemaMapper({ schema, files, onConfirm }) {
  const [tables, setTables] = useState(() =>
    (schema.tables || []).map(t => ({ ...t, properties: [...(t.properties || [])] }))
  );
  const [relationships] = useState(schema.relationships || []);

  // 编辑属性名
  const handleRename = useCallback((filename, csvColumn, newName) => {
    setTables(prev => prev.map(t => {
      if (t.filename === filename) {
        return {
          ...t,
          properties: t.properties.map(p =>
            p.csvColumn === csvColumn ? { ...p, propertyName: newName } : p
          ),
        };
      }
      return t;
    }));
  }, []);

  // 删除属性
  const handleRemoveProp = useCallback((filename, csvColumn) => {
    setTables(prev => prev.map(t => {
      if (t.filename === filename) {
        return {
          ...t,
          properties: t.properties.filter(p => p.csvColumn !== csvColumn),
        };
      }
      return t;
    }));
  }, []);

  // 添加属性（从未映射列拖入）
  const handleAddProp = useCallback((filename, csvColumn, dataType) => {
    setTables(prev => prev.map(t => {
      if (t.filename === filename) {
        return {
          ...t,
          properties: [...t.properties, {
            csvColumn,
            propertyName: toCamel(csvColumn),
            type: dataType || 'string',
          }],
        };
      }
      return t;
    }));
  }, []);

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">映射校准</p>
          <p className="text-[10px] text-neutral-500">
            {tables.length} 个节点类型 &middot; {relationships.length} 条关系
          </p>
        </div>
        <button
          onClick={() => onConfirm({ tables, relationships })}
          className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500
                     rounded-lg text-xs font-semibold text-white transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> 确认映射并导入
        </button>
      </div>

      {/* 推理说明 */}
      {schema.reasoning && (
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-2">
          <p className="text-[10px] text-cyan-300 leading-relaxed">{schema.reasoning}</p>
        </div>
      )}

      {/* 关系概览 */}
      {relationships.length > 0 && (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Link2 className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-semibold text-neutral-300">跨表关系</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {relationships.map((rel, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] bg-neutral-800/50 rounded px-2 py-1">
                <span className="text-cyan-400 font-mono truncate">{rel.fromTable?.split('(')[0]}</span>
                <span className="text-neutral-600">.</span>
                <span className="text-amber-400 font-mono">{rel.fromColumn}</span>
                <ArrowRight className="w-3 h-3 text-neutral-600 shrink-0" />
                <span className="text-cyan-400 font-mono truncate">{rel.toTable?.split('(')[0]}</span>
                <span className="text-neutral-600">.</span>
                <span className="text-amber-400 font-mono">{rel.toColumn}</span>
                <span className="text-neutral-500 ml-auto shrink-0">({rel.relationshipType})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 各表节点映射 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {tables.map((table, i) => (
          <TableMappingCard
            key={i}
            table={table}
            fileData={files.find(f => f.filename === table.filename)}
            onRename={handleRename}
            onRemoveProp={handleRemoveProp}
            onAddProp={handleAddProp}
          />
        ))}
      </div>
    </div>
  );
}


function TableMappingCard({ table, fileData, onRename, onRemoveProp, onAddProp }) {
  const [dragOver, setDragOver] = useState(false);
  const isFact = table.tableCategory === 'fact';

  // 计算未映射的列
  const mappedColumns = useMemo(() => {
    const set = new Set();
    set.add(table.idColumn);
    set.add(table.nameColumn);
    table.properties?.forEach(p => set.add(p.csvColumn));
    return set;
  }, [table]);

  const unmappedFields = useMemo(() => {
    if (!fileData?.fields) return [];
    return fileData.fields.filter(f => !mappedColumns.has(f.fieldId));
  }, [fileData, mappedColumns]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const col = e.dataTransfer.getData('text/csv-column');
    const dtype = e.dataTransfer.getData('text/csv-datatype') || 'string';
    if (col) onAddProp(table.filename, col, dtype);
  }, [table.filename, onAddProp]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`bg-neutral-900/60 border rounded-lg transition-colors ${
        dragOver ? 'border-cyan-500 bg-cyan-500/5' : 'border-neutral-800'
      }`}
    >
      {/* 节点头 */}
      <div className="px-3 py-2.5 border-b border-neutral-800 flex items-center gap-2">
        <Table2 className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-xs font-bold text-white">{table.nodeType}</span>
        {table.label && <span className="text-[9px] text-neutral-500">({table.label})</span>}
        <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded ${
          isFact ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
        }`}>
          {isFact ? '事实表' : '维度表'}
        </span>
      </div>

      {/* ID 列 */}
      <div className="px-3 py-1.5 border-b border-neutral-800/50 bg-amber-500/5">
        <div className="flex items-center gap-1.5 text-[10px]">
          <Key className="w-3 h-3 text-amber-400" />
          <span className="text-amber-400 font-mono">{table.idColumn}</span>
          <ArrowRight className="w-3 h-3 text-neutral-600" />
          <span className="text-neutral-400">id</span>
        </div>
      </div>

      {/* 属性列表 */}
      <div className="px-3 py-2 space-y-0.5 max-h-40 overflow-y-auto">
        {table.properties?.map((prop, j) => (
          <div key={j} className="flex items-center gap-1.5 text-[10px] group">
            <Hash className="w-2.5 h-2.5 text-neutral-600 shrink-0" />
            <span className="text-neutral-400 font-mono truncate w-24" title={prop.csvColumn}>{prop.csvColumn}</span>
            <ArrowRight className="w-2.5 h-2.5 text-neutral-600 shrink-0" />
            <input
              value={prop.propertyName}
              onChange={(e) => onRename(table.filename, prop.csvColumn, e.target.value)}
              className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5
                         text-cyan-400 font-mono text-[10px] outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={() => onRemoveProp(table.filename, prop.csvColumn)}
              className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-opacity shrink-0"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* 未映射字段 */}
      {unmappedFields.length > 0 && (
        <div className="px-3 py-2 border-t border-neutral-800/50">
          <p className="text-[9px] text-neutral-500 mb-1">未映射字段 ({unmappedFields.length})</p>
          <div className="flex flex-wrap gap-1">
            {unmappedFields.map((f, j) => (
              <span
                key={j}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/csv-column', f.fieldId);
                  e.dataTransfer.setData('text/csv-datatype', f.dataType);
                }}
                className="px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-[9px]
                           text-neutral-400 font-mono cursor-grab hover:border-neutral-500 transition-colors"
                title={`${f.chineseName} (${f.dataType})`}
              >
                {f.fieldId}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function toCamel(s) {
  const parts = s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().split(/\s+/);
  return parts[0] + parts.slice(1).map(p => p[0]?.toUpperCase() + p.slice(1)).join('');
}
