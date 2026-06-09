import { useState, useEffect } from 'react';
import { Package, Zap, Bot, Info, Settings } from 'lucide-react';
import PetFoodAgentChat from './PetFoodAgentChat';
import LLMConfigPanel from './LLMConfigPanel';
import { fetchLLMConfig } from '../api';

export default function AgentTab({ selectedNode, nodeDetail }) {
  const [llmStatus, setLlmStatus] = useState(null);
  const [showConfig, setShowConfig] = useState(false);

  const isProduct = selectedNode && (selectedNode.objectType === 'PetFoodProduct' || selectedNode.type === 'PetFoodProduct');
  const productName = nodeDetail?.name || selectedNode?.label || '';

  const agentContext = isProduct && selectedNode
    ? { current_product_id: selectedNode.id, current_domain: 'pet_food' }
    : { current_domain: 'pet_food' };

  useEffect(() => {
    fetchLLMConfig().then(setLlmStatus).catch(() => {});
  }, [showConfig]);

  const llmConfigured = llmStatus?.configured && llmStatus?.provider !== 'none';

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Agent status + explanation bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/40 flex items-center gap-3">
        <Bot className="w-4 h-4 text-violet-400" />
        <span className="text-[10px] text-neutral-500">Agent Mode:</span>
        {llmConfigured ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-green-500/10 text-green-400 border-green-500/20">
            LLM Tool Reasoning
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-amber-500/10 text-amber-400 border-amber-500/20">
            Deterministic Fallback
          </span>
        )}
        {llmConfigured && llmStatus?.source && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500">
            {llmStatus.source === 'runtime' ? 'Runtime Config' : 'Environment'}
          </span>
        )}
        <button
          onClick={() => setShowConfig(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-neutral-400 hover:text-violet-300 bg-neutral-800 border border-neutral-700 rounded-lg hover:border-violet-500/30 transition-colors ml-auto"
        >
          <Settings className="w-3 h-3" />
          Configure LLM
        </button>
      </div>

      {/* Context bar — shown when a product is selected */}
      {isProduct && productName && (
        <div className="shrink-0 px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/40 flex items-center gap-3">
          <Package className="w-4 h-4 text-pink-400" />
          <span className="text-xs text-neutral-400">Current product:</span>
          <span className="text-xs font-semibold text-white">{productName}</span>
          <span className="text-[10px] text-neutral-600 font-mono">{selectedNode.id}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-600">Try asking:</span>
            <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
              Explain the risks of {productName}
            </span>
          </div>
        </div>
      )}

      {/* Agent chat */}
      <PetFoodAgentChat context={agentContext} />

      {/* LLM Config Modal */}
      {showConfig && <LLMConfigPanel onClose={() => setShowConfig(false)} />}
    </div>
  );
}
