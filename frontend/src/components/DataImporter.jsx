import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Check, AlertTriangle, X, ArrowRight } from 'lucide-react';
import Papa from 'papaparse';
import { previewImport, importData } from '../api';

const OBJECT_TYPES = [
  { value: 'raw-materials', label: '原材料' },
  { value: 'components', label: '零部件' },
  { value: 'final-products', label: '最终产品' },
  { value: 'suppliers', label: '供应商' },
  { value: 'factories', label: '工厂' },
  { value: 'links', label: '链路' },
];

export default function DataImporter({ onImportSuccess }) {
  const [objectType, setObjectType] = useState('raw-materials');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [preview, setPreview] = useState(null);
  const [fieldMapping, setFieldMapping] = useState({});
  const [errors, setErrors] = useState([]);
  const [validCount, setValidCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  // ---- 文件选择 ----
  const handleFile = useCallback(async (f) => {
    setFile(f);
    setResult(null);
    setPreview(null);
    setErrors([]);

    // Parse CSV
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data.filter(r => Object.values(r).some(v => v !== '' && v != null));
        setRows(data);
        setHeaders(results.meta.fields || []);

        // Auto field mapping
        const mapping = {};
        results.meta.fields?.forEach(h => {
          const clean = h.trim().toLowerCase();
          const match = guessField(clean);
          if (match) mapping[h] = match;
        });
        setFieldMapping(mapping);
      },
    });

    // Send preview to backend
    try {
      const formData = new FormData();
      formData.append('file', f);
      const res = await previewImport(formData);
      setPreview(res);
      setValidCount(res.valid_count || 0);
      setErrors(res.errors || []);
    } catch (e) {
      console.error('预览失败', e);
    }
  }, []);

  // ---- 拖拽 ----
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.csv') || f.name.endsWith('.json'))) {
      handleFile(f);
    }
  }, [handleFile]);

  const onFileSelect = (e) => {
    const f = e.target.files[0];
    if (f) handleFile(f);
  };

  // ---- 手动映射更新 ----
  const updateMapping = (header, value) => {
    setFieldMapping(prev => {
      const next = { ...prev };
      if (value === '__ignore__') delete next[header];
      else next[header] = value;
      return next;
    });
  };

  // ---- 导入 ----
  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await importData(objectType, formData);
      setResult(res);
      if (res.status === 'success') {
        onImportSuccess?.();
      }
    } catch (e) {
      setResult({ status: 'error', message: e.message });
    } finally {
      setImporting(false);
    }
  };

  // ---- 重置 ----
  const reset = () => {
    setFile(null); setRows([]); setHeaders([]); setPreview(null);
    setFieldMapping({}); setErrors([]); setValidCount(0); setResult(null);
  };

  const errorRows = new Set(errors.map(e => e.row));

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2 mb-2">
          <Upload className="w-4 h-4 text-green-500" />
          <h2 className="text-sm font-semibold text-white">数据导入</h2>
        </div>
        <p className="text-xs text-neutral-500">上传 CSV / JSON 文件，批量导入本体对象</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* 对象类型选择 */}
        <div>
          <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
            对象类型
          </label>
          <select
            value={objectType}
            onChange={e => setObjectType(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white px-3 py-2 outline-none focus:border-green-500/50"
          >
            {OBJECT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* 上传区域 */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-green-500 bg-green-500/5'
              : file
                ? 'border-neutral-700 bg-neutral-900/50'
                : 'border-neutral-800 hover:border-neutral-600'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={onFileSelect}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-xs">
              <FileText className="w-4 h-4 text-green-400" />
              <span className="text-white">{file.name}</span>
              <span className="text-neutral-500">({rows.length} 行)</span>
              <button
                onClick={e => { e.stopPropagation(); reset(); }}
                className="ml-2 p-0.5 hover:bg-neutral-700 rounded text-neutral-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-xs text-neutral-500">
              <Upload className="w-5 h-5 mx-auto mb-1 opacity-40" />
              <p>📁 拖拽 CSV / JSON 文件到此处</p>
              <p className="text-[10px] mt-0.5">或点击选择文件</p>
            </div>
          )}
        </div>

        {/* 字段映射 */}
        {headers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
              字段映射
            </p>
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg overflow-hidden">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="text-left px-3 py-1.5 font-medium">CSV 列</th>
                    <th className="text-left px-3 py-1.5 font-medium">→</th>
                    <th className="text-left px-3 py-1.5 font-medium">系统属性</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map(h => {
                    const mapped = fieldMapping[h];
                    const isMapped = !!mapped;
                    return (
                      <tr key={h} className="border-b border-neutral-800/50">
                        <td className="px-3 py-1 text-white">{h}</td>
                        <td className="px-3 py-1 text-neutral-600">
                          <ArrowRight className="w-3 h-3" />
                        </td>
                        <td className="px-3 py-1">
                          {isMapped ? (
                            <span className="inline-flex items-center gap-1 text-green-400">
                              <Check className="w-3 h-3" />
                              {mapped}
                            </span>
                          ) : (
                            <select
                              value=""
                              onChange={e => updateMapping(h, e.target.value)}
                              className="bg-neutral-800 border border-neutral-700 rounded text-[10px] text-amber-400 px-1.5 py-0.5"
                            >
                              <option value="">⚠ 未匹配</option>
                              <option value="__ignore__">(忽略)</option>
                              <option value="name">name</option>
                              <option value="stock">stock</option>
                              <option value="threshold">threshold</option>
                              <option value="supplier_id">supplier_id</option>
                              <option value="factory_id">factory_id</option>
                              <option value="daily_consumption">daily_consumption</option>
                              <option value="risk_level">risk_level</option>
                              <option value="status">status</option>
                              <option value="location">location</option>
                              <option value="link_type">link_type</option>
                              <option value="source_id">source_id</option>
                              <option value="target_id">target_id</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 预览表格 */}
        {preview && preview.preview && preview.preview.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
              数据预览 (前 {Math.min(preview.preview.length, 5)} 行)
            </p>
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg overflow-x-auto">
              <table className="w-full text-[10px] whitespace-nowrap">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="text-left px-2 py-1.5 font-medium">#</th>
                    {Object.keys(preview.preview[0] || {}).slice(0, 6).map(k => (
                      <th key={k} className="text-left px-2 py-1.5 font-medium">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.slice(0, 5).map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-neutral-800/50 ${errorRows.has(i + 1) ? 'bg-red-500/10' : ''}`}
                    >
                      <td className={`px-2 py-1 ${errorRows.has(i + 1) ? 'text-red-400' : 'text-neutral-600'}`}>
                        {i + 1}
                      </td>
                      {Object.values(row).slice(0, 6).map((v, j) => (
                        <td key={j} className="px-2 py-1 text-neutral-300">{String(v).substring(0, 20)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 校验结果 */}
        {preview && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
            errors.length === 0
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          }`}>
            {errors.length === 0 ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            校验: {preview.total_rows} 行 · {validCount} 通过
            {errors.length > 0 && ` · ${errors.length} 个错误`}
          </div>
        )}

        {/* 错误详情 */}
        {errors.length > 0 && (
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {errors.slice(0, 10).map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-400 bg-red-500/5 px-2.5 py-1 rounded">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>第 {e.row} 行 · {e.field}: {e.msg}</span>
              </div>
            ))}
            {errors.length > 10 && (
              <p className="text-[10px] text-neutral-500">… 还有 {errors.length - 10} 个错误</p>
            )}
          </div>
        )}

        {/* 导入结果 */}
        {result && (
          <div className={`px-3 py-2.5 rounded-lg text-xs ${
            result.status === 'success'
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}>
            {result.status === 'success'
              ? `✅ 导入成功: ${result.imported || 0} 条记录，图谱已刷新`
              : `❌ 导入失败: ${result.message || '未知错误'}`}
            {result.errors?.length > 0 && result.errors.slice(0, 3).map((e, i) => (
              <p key={i} className="text-[10px] mt-0.5">· {e.msg}</p>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作 */}
      {file && (
        <div className="px-4 py-3 border-t border-neutral-800 flex gap-2">
          <button
            onClick={handleImport}
            disabled={importing || errors.length > 0 || validCount === 0}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
              importing || errors.length > 0 || validCount === 0
                ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
          >
            {importing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                导入中...
              </>
            ) : (
              <>确认导入 ({validCount} 条)</>
            )}
          </button>
          <button
            onClick={reset}
            className="px-4 py-2.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 字段猜测
// ============================================================

function guessField(name) {
  const map = {
    'id': 'id', '编号': 'id', 'name': 'name', '名称': 'name', '名字': 'name',
    'stock': 'stock', '库存': 'stock', '库存数量': 'stock', '当前库存': 'stock',
    'threshold': 'threshold', '阈值': 'threshold', '安全阈值': 'threshold', '安全线': 'threshold',
    'supplier_id': 'supplier_id', 'supplierid': 'supplier_id', '供应商id': 'supplier_id', '供应商编号': 'supplier_id',
    'factory_id': 'factory_id', 'factoryid': 'factory_id', '工厂id': 'factory_id', '工厂编号': 'factory_id',
    'risk_level': 'risk_level', 'risklevel': 'risk_level', '风险等级': 'risk_level', '风险评级': 'risk_level',
    'on_time_delivery_rate': 'on_time_delivery_rate', 'ontimedeliveryrate': 'on_time_delivery_rate', '准时率': 'on_time_delivery_rate', '交货准时率': 'on_time_delivery_rate',
    'target_yield': 'target_yield', 'targetyield': 'target_yield', '目标产能': 'target_yield', '目标产量': 'target_yield',
    'current_yield': 'current_yield', 'currentyield': 'current_yield', '实际产能': 'current_yield', '实际产量': 'current_yield',
    'daily_consumption': 'daily_consumption', 'dailyconsumption': 'daily_consumption', '日消耗': 'daily_consumption', '日消耗量': 'daily_consumption',
    'defect_rate': 'defect_rate', 'defectrate': 'defect_rate', '不良率': 'defect_rate', '次品率': 'defect_rate',
    'quality_score': 'quality_score', 'qualityscore': 'quality_score', '质检得分': 'quality_score', '质量分': 'quality_score',
    'capacity_utilization': 'capacity_utilization', 'capacityutilization': 'capacity_utilization', '产能利用率': 'capacity_utilization', '利用率': 'capacity_utilization',
    'location': 'location', '所在地': 'location', '地址': 'location', '地点': 'location',
    'contact': 'contact', '联系人': 'contact', '联系方式': 'contact',
    'certification': 'certification', '认证': 'certification', '资质': 'certification', '证书': 'certification',
    'unit': 'unit', '单位': 'unit',
    'source_id': 'source_id', 'sourceid': 'source_id', '源id': 'source_id', '源节点': 'source_id',
    'target_id': 'target_id', 'targetid': 'target_id', '目标id': 'target_id', '目标节点': 'target_id',
    'link_type': 'link_type', 'linktype': 'link_type', '关系类型': 'link_type', '类型': 'link_type',
    'label': 'label', '标签': 'label', '描述': 'label',
    'status': 'status', '状态': 'status',
    'headcount': 'headcount', '人数': 'headcount', '在岗人数': 'headcount',
  };
  return map[name] || null;
}
