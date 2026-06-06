import { Package, Zap } from 'lucide-react';
import PetFoodAgentChat from './PetFoodAgentChat';

export default function AgentTab({ selectedNode, nodeDetail }) {
  const isProduct = selectedNode && (selectedNode.objectType === 'PetFoodProduct' || selectedNode.type === 'PetFoodProduct');
  const productName = nodeDetail?.name || selectedNode?.label || '';

  const agentContext = isProduct && selectedNode
    ? { current_product_id: selectedNode.id, current_domain: 'pet_food' }
    : { current_domain: 'pet_food' };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
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
