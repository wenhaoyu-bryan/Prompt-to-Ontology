import { useState, useEffect } from 'react';
import { Package, Zap, Bot, Info } from 'lucide-react';
import PetFoodAgentChat from './PetFoodAgentChat';

export default function AgentTab({ selectedNode, nodeDetail }) {
  const isProduct = selectedNode && (selectedNode.objectType === 'PetFoodProduct' || selectedNode.type === 'PetFoodProduct');
  const productName = nodeDetail?.name || selectedNode?.label || '';

  const agentContext = isProduct && selectedNode
    ? { current_product_id: selectedNode.id, current_domain: 'pet_food' }
    : { current_domain: 'pet_food' };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Agent status + explanation bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/40 flex items-center gap-3">
        <Bot className="w-4 h-4 text-violet-400" />
        <span className="text-[10px] text-neutral-500">Agent Mode:</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-violet-500/10 text-violet-400 border-violet-500/20">
          Tool Reasoning
        </span>
        <span className="text-[9px] text-neutral-600 ml-1">
          Answers by calling ontology tools — not from memory
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Info className="w-3 h-3 text-neutral-600" />
          <span className="text-[9px] text-neutral-600">
            Queries objects, relations, rules, evidence, and data limitations
          </span>
        </div>
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
    </div>
  );
}
