import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Trash2, Shield, AlertTriangle, ChevronDown, ChevronUp, User, Search, Zap } from 'lucide-react';
import { petFoodAgentChat } from '../api';

const EXAMPLE_QUESTIONS = [
  'Why is this product risky?',
  'Which products contain chicken?',
  'Which cat foods are missing taurine?',
  'Which senior cat products have high phosphorus?',
  'Compare PF001 and PF003.',
  'Which products avoid chicken?',
];

export default function PetFoodAgentChat({ context } = {}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(question) {
    const q = (question || input).trim();
    if (!q || loading) return;

    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const res = await petFoodAgentChat(q, context);
      setMessages(prev => [...prev, { role: 'agent', logs: res.logs || [], answer: res.answer || '', tools_used: res.tools_used || [], llm_used: res.llm_used || false }]);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Request failed');
      setMessages(prev => [...prev, { role: 'error', content: err?.response?.data?.detail || err.message || 'Request failed' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="px-6 py-4 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Pet Food Agent</h2>
              <p className="text-[11px] text-neutral-500">Graph Evidence + Risk Rules</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-neutral-500 hover:text-neutral-300 bg-neutral-900 border border-neutral-800 rounded-lg hover:border-neutral-700 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear chat
            </button>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !loading && <EmptyState onExampleClick={handleSend} />}

        {messages.map((msg, i) => (
          msg.role === 'user' ? (
            <UserMessage key={i} content={msg.content} />
          ) : msg.role === 'error' ? (
            <ErrorMessage key={i} content={msg.content} />
          ) : (
            <AgentMessage key={i} logs={msg.logs} answer={msg.answer} toolsUsed={msg.tools_used} llmUsed={msg.llm_used} />
          )
        ))}

        {loading && <LoadingIndicator />}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-3 border-t border-neutral-800 shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question, e.g. Which products contain chicken?"
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:border-cyan-500/50 transition-colors"
            disabled={loading}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:text-violet-400/50 rounded-lg text-xs text-white font-medium transition-colors flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}


// ──────── Sub-components ────────

function EmptyState({ onExampleClick }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6 pb-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/20 flex items-center justify-center">
        <Bot className="w-7 h-7 text-violet-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white mb-1">Pet Food Agent</p>
        <p className="text-[11px] text-neutral-500 max-w-sm">
          Ontology-based pet food safety analysis agent. Answers questions using graph database evidence chains. Not veterinary diagnosis.
        </p>
      </div>
      <div className="w-full max-w-lg">
        <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">Example questions</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {EXAMPLE_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => onExampleClick(q)}
              className="px-3 py-1.5 text-[11px] text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg hover:border-violet-500/40 hover:text-violet-300 hover:bg-violet-500/5 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


function UserMessage({ content }) {
  return (
    <div className="flex justify-end">
      <div className="flex items-start gap-2 max-w-lg flex-row-reverse">
        <div className="w-7 h-7 rounded-full bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
          <User className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl rounded-tr-sm px-4 py-3">
          <p className="text-xs text-neutral-200">{content}</p>
        </div>
      </div>
    </div>
  );
}


function AgentMessage({ logs, answer, toolsUsed, llmUsed }) {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 space-y-2 max-w-2xl">
        {/* Tools used badge */}
        {toolsUsed && toolsUsed.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] text-neutral-600">Tools used:</span>
            {toolsUsed.map((t, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                {t}
              </span>
            ))}
            {llmUsed && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                LLM
              </span>
            )}
          </div>
        )}

        {/* Reasoning logs toggle */}
        {logs && logs.length > 0 && (
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-1.5 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Reasoning trace ({logs.length} steps)
          </button>
        )}

        {showLogs && logs && (
          <div className="space-y-1.5">
            {logs.map((log, i) => (
              <LogEntry key={i} log={log} />
            ))}
          </div>
        )}

        {/* Structured answer */}
        {answer && <StructuredAnswer answer={answer} />}
      </div>
    </div>
  );
}


function LogEntry({ log }) {
  const typeConfig = {
    thought: { bg: 'bg-violet-500/5', border: 'border-violet-500/20', text: 'text-violet-400', label: 'Think' },
    tool_call: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400', label: 'Tool' },
    observation: { bg: 'bg-green-500/5', border: 'border-green-500/20', text: 'text-green-400', label: 'Observe' },
    decision: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', text: 'text-amber-400', label: 'Decide' },
    error: { bg: 'bg-red-500/5', border: 'border-red-500/20', text: 'text-red-400', label: 'Error' },
  };
  const cfg = typeConfig[log.type] || typeConfig.thought;

  return (
    <div className={`${cfg.bg} border ${cfg.border} rounded-lg px-3 py-2`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`text-[9px] font-semibold ${cfg.text}`}>{log.icon || ''} {cfg.label}</span>
        {log.timestamp && <span className="text-[8px] text-neutral-700 ml-auto">{log.timestamp}</span>}
      </div>
      <p className="text-[10px] text-neutral-400 leading-relaxed">{log.message}</p>
    </div>
  );
}


function StructuredAnswer({ answer }) {
  // Parse the markdown answer into sections
  const sections = parseAnswerSections(answer);

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden">
      {/* Conclusion */}
      {sections.conclusion && (
        <div className="px-4 py-3 border-b border-neutral-800">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Search className="w-2.5 h-2.5" /> Conclusion
          </p>
          <div className="text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap">
            {sections.conclusion}
          </div>
        </div>
      )}

      {/* Graph Evidence */}
      {sections.evidence && (
        <div className="px-4 py-3 border-b border-neutral-800">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" /> Graph Evidence
          </p>
          <div className="text-[11px] text-neutral-300 leading-relaxed whitespace-pre-wrap font-mono bg-neutral-950/50 rounded-lg p-2.5">
            {sections.evidence}
          </div>
        </div>
      )}

      {/* Triggered Rules */}
      {sections.rules && (
        <div className="px-4 py-3 border-b border-neutral-800">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Shield className="w-2.5 h-2.5" /> Rule Evaluation
          </p>
          <div className="text-[11px] text-amber-300 leading-relaxed whitespace-pre-wrap">
            {sections.rules}
          </div>
        </div>
      )}

      {/* Explanation */}
      {sections.explanation && (
        <div className="px-4 py-3 border-b border-neutral-800">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Explanation</p>
          <div className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {sections.explanation}
          </div>
        </div>
      )}

      {/* Remaining / unmatched content */}
      {sections.rest && (
        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {sections.rest}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-4 py-2.5 bg-amber-500/5 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-amber-400/80">This answer is based only on the current sample data and rules. It is not veterinary diagnosis.</p>
      </div>
    </div>
  );
}


/**
 * Parse the markdown answer from the agent into structured sections.
 * Expected headers: ## Conclusion, ## Graph Evidence, ## Triggered Rules, ## Explanation
 */
function parseAnswerSections(md) {
  if (!md) return {};

  // Split by ## headers
  const headerRe = /^##\s+(.+)$/gm;
  const parts = [];
  let lastIdx = 0;
  let match;

  while ((match = headerRe.exec(md)) !== null) {
    if (parts.length > 0) {
      parts[parts.length - 1].content = md.slice(lastIdx, match.index).trim();
    }
    parts.push({ title: match[1].trim() });
    lastIdx = match.index + match[0].length;
  }
  if (parts.length > 0) {
    parts[parts.length - 1].content = md.slice(lastIdx).trim();
  }

  // If no headers found, return entire content as conclusion
  if (parts.length === 0) {
    return { conclusion: md.trim() };
  }

  const result = {};
  let restParts = [];

  for (const p of parts) {
    const t = p.title.toLowerCase();
    const c = p.content || '';
    if (t.includes('conclusion') || t.includes('结论')) {
      result.conclusion = c;
    } else if (t.includes('evidence') || t.includes('证据') || t.includes('graph')) {
      result.evidence = c;
    } else if (t.includes('rule') || t.includes('规则') || t.includes('trigger') || t.includes('evaluation')) {
      result.rules = c;
    } else if (t.includes('explanation') || t.includes('解释') || t.includes('analysis') || t.includes('limitation')) {
      result.explanation = c;
    } else {
      restParts.push(`## ${p.title}\n${c}`);
    }
  }

  if (restParts.length > 0) {
    result.rest = restParts.join('\n\n');
  }

  return result;
}


function ErrorMessage({ content }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
      </div>
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 max-w-lg">
        <p className="text-[10px] text-red-400 font-semibold mb-1">Error</p>
        <p className="text-xs text-red-300">{content}</p>
      </div>
    </div>
  );
}


function LoadingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-xs text-neutral-500">Querying graph evidence chain...</span>
        </div>
      </div>
    </div>
  );
}
