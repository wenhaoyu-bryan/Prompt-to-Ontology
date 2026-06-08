import { useState, useEffect } from 'react';
import { Settings, Key, Zap, Trash2, CheckCircle, AlertTriangle, X, Loader2, ExternalLink } from 'lucide-react';
import { fetchLLMConfig, saveLLMConfig, deleteLLMConfig, testLLMConnection } from '../api';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', defaultUrl: 'https://api.openai.com/v1' },
  { value: 'minimax', label: 'MiniMax', defaultModel: 'MiniMax-M2.7', defaultUrl: 'https://api.minimaxi.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultModel: 'claude-sonnet-4', defaultUrl: '' },
  { value: 'openai_compatible', label: 'OpenAI-compatible', defaultModel: '', defaultUrl: '' },
];

const MODEL_OPTIONS = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-5.5'],
  minimax: ['MiniMax-M2.7'],
  anthropic: ['claude-sonnet-4'],
  openai_compatible: [],
};

export default function LLMConfigPanel({ onClose }) {
  const [status, setStatus] = useState(null);
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLLMConfig().then(s => {
      setStatus(s);
      if (s?.configured && s?.provider && s.provider !== 'none') {
        setProvider(s.provider);
        setModel(s.model || '');
        setBaseUrl(s.base_url || '');
      }
    }).catch(() => {});
  }, []);

  function handleProviderChange(p) {
    setProvider(p);
    const opt = PROVIDERS.find(pr => pr.value === p);
    if (opt) {
      setModel(opt.defaultModel);
      setBaseUrl(opt.defaultUrl);
    }
    setTestResult(null);
    setError(null);
  }

  async function handleSave() {
    if (!apiKey.trim()) { setError('API key is required.'); return; }
    if (!model.trim()) { setError('Model is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await saveLLMConfig({ provider, api_key: apiKey.trim(), model: model.trim(), base_url: baseUrl.trim() });
      setStatus(result);
      setApiKey('');
      setTestResult(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save config.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const config = status?.configured
        ? null
        : { provider, api_key: apiKey.trim(), model: model.trim(), base_url: baseUrl.trim() };
      const result = await testLLMConnection(config);
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: 'Request failed.', error_type: 'unknown' });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    try {
      const result = await deleteLLMConfig();
      setStatus(result);
      setApiKey('');
      setTestResult(null);
      setError(null);
    } catch (e) {
      setError('Failed to delete config.');
    }
  }

  const isConfigured = status?.configured && status?.provider !== 'none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-bold text-white">LLM Configuration</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded-lg transition-colors">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Current status */}
          {isConfigured && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[11px] font-semibold text-green-300">LLM Configured</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 ml-auto">
                  {status.source === 'runtime' ? 'Runtime' : 'Environment'}
                </span>
              </div>
              <div className="text-[10px] text-neutral-400 space-y-0.5">
                <p>Provider: <span className="text-neutral-300">{status.provider}</span></p>
                <p>Model: <span className="text-neutral-300">{status.model}</span></p>
                {status.base_url && <p>Base URL: <span className="text-neutral-300 font-mono">{status.base_url}</span></p>}
                {status.key_masked && <p>Key: <span className="text-neutral-300 font-mono">{status.key_masked}</span></p>}
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[9px] text-amber-400/80 leading-relaxed">
              For local/private demo use only. API keys are stored only in backend memory and will be cleared when the backend restarts.
            </p>
          </div>

          {/* Provider */}
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1.5">Provider</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PROVIDERS.map(p => (
                <button
                  key={p.value}
                  onClick={() => handleProviderChange(p.value)}
                  className={`py-1.5 text-[10px] font-medium rounded-lg border transition-colors ${
                    provider === p.value
                      ? 'bg-violet-500/10 text-violet-400 border-violet-500/30'
                      : 'text-neutral-500 border-neutral-800 hover:border-neutral-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1.5">Model</label>
            {MODEL_OPTIONS[provider]?.length > 0 ? (
              <div className="flex gap-1.5 flex-wrap">
                {MODEL_OPTIONS[provider].map(m => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={`px-2.5 py-1 text-[10px] font-mono rounded-lg border transition-colors ${
                      model === m
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        : 'text-neutral-500 border-neutral-800 hover:border-neutral-600'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="Model name"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono outline-none focus:border-violet-500/50"
              />
            )}
          </div>

          {/* Base URL */}
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1.5">Base URL</label>
            <input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono outline-none focus:border-violet-500/50"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1.5">API Key</label>
            <div className="relative">
              <Key className="w-3.5 h-3.5 text-neutral-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={isConfigured ? 'Enter new key to replace...' : 'sk-...'}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-9 pr-20 py-2 text-xs text-neutral-200 font-mono outline-none focus:border-violet-500/50"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-neutral-500 hover:text-neutral-300 px-2 py-0.5"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[10px] text-red-400">{error}</span>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`rounded-lg px-3 py-2 flex items-start gap-2 ${
              testResult.ok
                ? 'bg-green-500/5 border border-green-500/20'
                : 'bg-red-500/5 border border-red-500/20'
            }`}>
              {testResult.ok
                ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
              <div className="text-[10px]">
                <span className={testResult.ok ? 'text-green-300' : 'text-red-300'}>
                  {testResult.message}
                </span>
                {testResult.ok && testResult.latency_ms != null && (
                  <span className="text-neutral-500 ml-2">({testResult.latency_ms}ms)</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-neutral-800 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim() || !model.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:text-violet-400/50 rounded-lg text-xs text-white font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            Save
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-800/50 rounded-lg text-xs text-neutral-300 font-medium transition-colors border border-neutral-700"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Test Connection
          </button>
          {isConfigured && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Key
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
