/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Node, Link, FactContribution, NodeType } from '../types';
import { Sparkles, Eye, ShieldAlert, BadgeInfo, CheckCircle2, AlertTriangle, Play, RefreshCw } from 'lucide-react';

interface RetrievalAuditProps {
  query: string;
  seeds: string[];
  retrievedNodes: string[];
  retrievedEdges: string[];
  nodeReasons: Record<string, string>;
  edgeReasons: Record<string, string>;
  whyText: string;
  allNodes: Node[];
  allLinks: Link[];
  answer: string;
  ratings: FactContribution[];
  isDrafting: boolean;
  isAuditing: boolean;
  onDraft: () => void;
  onAudit: () => void;
  onHighlightFact: (factId: number) => void;
  flashedFactId: number | null;
}

const TYPE_COLORS: Record<NodeType, string> = {
  Person: '#F59E0B',        // Amber Gold
  Organization: '#3B82F6',  // Tech Azure Blue
  Team: '#8B5CF6',          // Violet/Purple
  Product: '#10B981',       // Mint Emerald
  Technology: '#EC4899',    // Magenta Tech
  Feature: '#06B6D4',       // Cyber Cyan
  Other: '#64748B'          // Slate Gray
};

export const RetrievalAudit: React.FC<RetrievalAuditProps> = ({
  query,
  seeds,
  retrievedNodes,
  retrievedEdges,
  nodeReasons,
  edgeReasons,
  whyText,
  allNodes,
  allLinks,
  answer,
  ratings,
  isDrafting,
  isAuditing,
  onDraft,
  onAudit,
  onHighlightFact,
  flashedFactId
}) => {
  // Map rating level to CSS colors
  const getRatingClasses = (level?: string) => {
    switch (level) {
      case 'high':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30';
      case 'low':
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
      case 'none':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30 opacity-50';
      default:
        return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
    }
  };

  // Helper to parse markdown bold elements while preserving strings and keys
  const formatMarkdownText = (rawChunk: string, prefix: string) => {
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const elements: React.ReactNode[] = [];
    let lastIdx = 0;
    let bMatch;
    let bKey = 0;

    while ((bMatch = boldRegex.exec(rawChunk)) !== null) {
      if (bMatch.index > lastIdx) {
        elements.push(rawChunk.substring(lastIdx, bMatch.index));
      }
      elements.push(
        <strong key={`${prefix}-b-${bKey++}`} className="font-semibold text-gray-100">
          {bMatch[1]}
        </strong>
      );
      lastIdx = boldRegex.lastIndex;
    }
    if (lastIdx < rawChunk.length) {
      elements.push(rawChunk.substring(lastIdx));
    }
    return elements;
  };

  // Convert answer citations into clickable chips
  const renderCitationsInAnswer = (text: string) => {
    if (!text) return null;

    // Matches strings like [1] or [1][2]
    const citationRegex = /\[(\d+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      const factIdStr = match[1];
      const factId = parseInt(factIdStr, 10);

      // Add text before match with markdown bold formatting
      if (matchIndex > lastIndex) {
        const textSegment = text.substring(lastIndex, matchIndex);
        parts.push(...formatMarkdownText(textSegment, `seg-${lastIndex}`));
      }

      // Check if audited rating exists
      const rating = ratings.find(r => r.id === factId);
      let chipClass = 'bg-card-bg text-gray-300 border-border-light hover:bg-neutral-800';
      let isWeak = false;

      if (rating) {
        if (rating.level === 'high') {
          chipClass = 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 font-semibold';
        } else if (rating.level === 'medium') {
          chipClass = 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40 hover:bg-yellow-500/30';
        } else if (rating.level === 'low') {
          chipClass = 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700';
          isWeak = true;
        } else if (rating.level === 'none') {
          chipClass = 'bg-rose-950/40 text-rose-300 border-rose-900/50 hover:bg-rose-900/30';
          isWeak = true;
        }
      }

      parts.push(
        <button
          key={matchIndex}
          type="button"
          onClick={() => onHighlightFact(factId)}
          className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 mx-0.5 text-[10px] font-mono font-bold rounded border cursor-pointer select-none align-middle transform transition-all duration-150 active:scale-95 ${chipClass} ${
            isWeak ? 'ring-1 ring-rose-500/30' : ''
          }`}
          title={
            rating
              ? `Fact ${factId} rated ${rating.level.toUpperCase()} contribution: ${rating.reason}`
              : `Click to highlight retrieved Fact ${factId}`
          }
        >
          {factId}
          {isWeak && <span className="ml-0.5 text-[9px] text-rose-400">⚠</span>}
        </button>
      );

      lastIndex = citationRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      const textSegment = text.substring(lastIndex);
      parts.push(...formatMarkdownText(textSegment, `seg-${lastIndex}`));
    }

    return parts;
  };

  if (retrievedNodes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Retrieval Reason banner */}
      <div className="p-4 rounded-xl bg-card-bg border border-border-dark flex gap-3.5 shadow-md">
        <BadgeInfo className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs font-mono leading-relaxed text-gray-300">{whyText}</p>
      </div>

      {/* Nodes & Edges pulled in list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nodes Pulled In */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-emerald-400">
            Anchor Nodes Pulled In ({retrievedNodes.length})
          </h4>
          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
            {retrievedNodes.map(nid => {
              const node = allNodes.find(n => n.id === nid);
              if (!node) return null;
              const isSeed = seeds.includes(nid);
              const reason = nodeReasons[nid] || 'Included as adjacent graph context.';

              return (
                <div
                  key={nid}
                  className="p-3 rounded-lg border border-border-dark bg-panel-bg relative overflow-hidden flex flex-col justify-center shadow-sm"
                  style={{ borderLeft: `4px solid ${TYPE_COLORS[node.type] || '#8a8272'}` }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-200">{node.label}</span>
                    <span className="text-[10px] font-mono uppercase text-gray-500">
                      {node.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 font-mono leading-relaxed">{reason}</p>
                  {isSeed && (
                    <span className="absolute top-0 right-0 bg-blue-500/10 text-blue-400 border-l border-b border-blue-500/20 text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-bl">
                      SEED
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Edges / Facts Pulled In */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-emerald-400">
            Relational Facts Retrieved ({retrievedEdges.length})
          </h4>
          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
            {retrievedEdges.map((eid, idx) => {
              const link = allLinks.find(l => l.id === eid);
              if (!link) return null;

              const srcNode = allNodes.find(n => n.id === (typeof link.source === 'object' ? link.source.id : link.source));
              const tgtNode = allNodes.find(n => n.id === (typeof link.target === 'object' ? link.target.id : link.target));
              if (!srcNode || !tgtNode) return null;

              const factId = idx + 1;
              const reason = edgeReasons[eid] || 'Discovered during graph-walk expansion.';
              const isFlashed = flashedFactId === factId;

              return (
                <div
                  id={`fact-card-${factId}`}
                  key={eid}
                  onClick={() => onHighlightFact(factId)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all duration-300 bg-panel-bg ${
                    isFlashed
                      ? 'border-amber-400 bg-amber-500/5 ring-1 ring-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'border-border-dark hover:border-border-light'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                      {factId}
                    </span>
                    <div className="flex-1 space-y-1">
                      <div className="text-xs text-gray-200">
                        <span className="font-semibold text-emerald-400">{srcNode.label}</span>
                        <span className="text-gray-500 mx-1">({link.relation})</span>
                        <span className="font-semibold text-gray-300">{tgtNode.label}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-mono leading-relaxed italic">{reason}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Answer Generation & Auditing Interface */}
      <div className="border border-border-dark rounded-xl bg-card-bg p-4 space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border-dark">
          <div>
            <h4 className="text-xs font-bold font-mono tracking-wider text-blue-400 uppercase">
              Answer Formulation &amp; Audit Pipeline
            </h4>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Draft a focused factual answer using only retrieved links, then audit which ones were actually used.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onDraft}
              disabled={isDrafting || retrievedEdges.length === 0}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-colors cursor-pointer disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              {isDrafting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              DRAFT RESPONSE
            </button>
            <button
              onClick={onAudit}
              disabled={isAuditing || !answer || ratings.length > 0}
              className="flex items-center gap-1.5 text-xs bg-transparent border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 font-bold py-2 px-4 rounded-lg transition-colors cursor-pointer disabled:border-border-dark disabled:text-neutral-500 disabled:hover:bg-transparent"
            >
              {isAuditing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              RANK CONTRIBUTION
            </button>
          </div>
        </div>

        {/* Draft Answer Area */}
        {answer && (
          <div className="p-4 rounded-lg border border-border-dark bg-panel-bg space-y-3 shadow-inner">
            <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 uppercase font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Response Synthesis (with inline citations)
            </div>
            <div className="text-sm text-gray-200 leading-relaxed select-text whitespace-pre-line space-y-2">
              {renderCitationsInAnswer(answer)}
            </div>
            <p className="text-[10px] text-gray-500 font-mono leading-relaxed border-t border-border-dark/60 pt-2">
              💡 Hint: Click on any numbered citation badge above to highlight and center the factual source card on the side and animate its corresponding path in the live graph!
            </p>
          </div>
        )}

        {/* Audit Pass Results */}
        {ratings.length > 0 && (
          <div className="space-y-3 border-t border-border-dark pt-4">
            <div className="text-xs font-mono font-semibold text-blue-400 uppercase tracking-wider">
              Factual Contribution Audit Ledger
            </div>
            <div className="space-y-2">
              {ratings.map(rating => {
                const link = allLinks.find((l, i) => i === rating.id - 1);
                if (!link) return null;
                const srcNode = allNodes.find(n => n.id === (typeof link.source === 'object' ? link.source.id : link.source));
                const tgtNode = allNodes.find(n => n.id === (typeof link.target === 'object' ? link.target.id : link.target));
                if (!srcNode || !tgtNode) return null;

                const ratingClasses = getRatingClasses(rating.level);

                return (
                  <div
                    key={rating.id}
                    className="p-3 border border-border-dark bg-panel-bg/40 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-panel-bg/80 transition-all duration-200 shadow-sm"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="text-xs text-gray-200">
                        <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono font-bold bg-neutral-800 text-gray-400 border border-neutral-700 rounded mr-2 align-middle">
                          {rating.id}
                        </span>
                        <span className="font-semibold text-gray-100">{srcNode.label}</span>
                        <span className="text-gray-500 mx-1">({link.relation})</span>
                        <span className="font-semibold text-gray-200">{tgtNode.label}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-mono leading-relaxed italic">{rating.reason}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border ${ratingClasses}`}>
                        {rating.level === 'high' && <CheckCircle2 className="w-3 h-3 text-amber-400" />}
                        {rating.level === 'none' && <ShieldAlert className="w-3 h-3 text-rose-400" />}
                        {rating.level.toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
