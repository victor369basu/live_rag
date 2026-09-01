/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Node, Link, NodeType } from '../types';
import { Network, Crown, Activity, Share2, Zap, BarChart2, Layers } from 'lucide-react';

interface GraphTopologySummaryProps {
  nodes: Node[];
  links: Link[];
  onSelectHub?: (node: Node) => void;
}

const TYPE_COLORS: Record<NodeType, string> = {
  Person: '#F59E0B',        // Dynamic Amber
  Organization: '#3B82F6',  // Tech Azure Blue
  Team: '#8B5CF6',          // Violet/Purple
  Product: '#10B981',       // Mint Emerald
  Technology: '#EC4899',    // Vibrant Magenta
  Feature: '#06B6D4',       // Cyber Cyan
  Other: '#64748B'          // Slate Gray
};

export const GraphTopologySummary: React.FC<GraphTopologySummaryProps> = ({
  nodes,
  links,
  onSelectHub
}) => {
  // Compute topology metrics efficiently with useMemo
  const topology = useMemo(() => {
    const totalNodes = nodes.length;
    const totalLinks = links.length;

    if (totalNodes === 0) {
      return {
        totalNodes: 0,
        totalLinks: 0,
        avgDegree: '0.00',
        densityPercent: '0.0',
        isolatedCount: 0,
        topHubs: [],
        typeDistribution: []
      };
    }

    // Degree map calculation
    const degreeMap: Record<string, number> = {};
    nodes.forEach(n => {
      degreeMap[n.id] = 0;
    });

    links.forEach(link => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      if (srcId && degreeMap[srcId] !== undefined) degreeMap[srcId] += 1;
      if (tgtId && degreeMap[tgtId] !== undefined) degreeMap[tgtId] += 1;
    });

    const degrees = Object.values(degreeMap);
    const sumDegree = degrees.reduce((acc, d) => acc + d, 0);
    const avgDegree = (sumDegree / totalNodes).toFixed(2);

    // Density: 2 * E / (V * (V - 1))
    const maxPossibleEdges = (totalNodes * (totalNodes - 1)) / 2;
    const densityPercent = maxPossibleEdges > 0 ? ((totalLinks / maxPossibleEdges) * 100).toFixed(1) : '0.0';

    const isolatedCount = degrees.filter(d => d === 0).length;

    // Sort hubs by degree descending
    const sortedNodes = [...nodes].sort((a, b) => (degreeMap[b.id] || 0) - (degreeMap[a.id] || 0));
    const topHubs = sortedNodes.slice(0, 3).map(n => ({
      node: n,
      degree: degreeMap[n.id] || 0,
      connectivityShare: totalLinks > 0 ? (((degreeMap[n.id] || 0) / (totalLinks * 2)) * 100).toFixed(1) : '0.0'
    }));

    // Entity type breakdown
    const typeCounts: Record<string, number> = {};
    nodes.forEach(n => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    const typeDistribution = Object.entries(typeCounts)
      .map(([type, count]) => ({
        type: type as NodeType,
        count,
        percent: ((count / totalNodes) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalNodes,
      totalLinks,
      avgDegree,
      densityPercent,
      isolatedCount,
      topHubs,
      typeDistribution
    };
  }, [nodes, links]);

  if (nodes.length === 0) {
    return (
      <div className="border border-border-dark rounded-xl bg-panel-bg p-5 text-center text-gray-500 font-mono text-xs shadow-md">
        <Network className="w-8 h-8 mx-auto mb-2 text-gray-600 opacity-60" />
        <p className="text-gray-400 font-semibold">Graph Topology Analytics Unavailable</p>
        <p className="text-[11px] text-gray-600 mt-1">Ingest a document to compute network structural metrics.</p>
      </div>
    );
  }

  const primaryHub = topology.topHubs[0];

  return (
    <div className="border border-border-dark rounded-xl bg-panel-bg overflow-hidden shadow-xl mt-3 animate-fadeIn">
      {/* Header */}
      <div className="bg-card-bg border-b border-border-dark px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-200 uppercase">
            Graph Topology Analytics
          </h3>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-gray-400">
          <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
            <Zap className="w-3 h-3" />
            LIVE METRICS
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Metric 1: Average Node Degree */}
          <div className="p-3 rounded-lg border border-border-dark bg-card-bg/40 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 uppercase">
              <span>Avg Node Degree</span>
              <Share2 className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-extrabold font-mono text-gray-100 flex items-baseline gap-1.5">
              {topology.avgDegree}
              <span className="text-[10px] text-gray-500 font-normal">edges/node</span>
            </div>
            <p className="text-[10px] text-gray-500 font-mono">
              Mean connectivity across all {topology.totalNodes} entities
            </p>
          </div>

          {/* Metric 2: Central Hub Entity */}
          <div className="p-3 rounded-lg border border-border-dark bg-card-bg/40 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 uppercase">
              <span>Central Hub Entity</span>
              <Crown className="w-3.5 h-3.5 text-amber-400" />
            </div>
            {primaryHub ? (
              <div>
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[primaryHub.node.type] || '#64748B' }}
                  />
                  <span
                    onClick={() => onSelectHub && onSelectHub(primaryHub.node)}
                    className="text-sm font-bold text-amber-300 font-sans truncate cursor-pointer hover:underline"
                    title={`Click to focus on ${primaryHub.node.label}`}
                  >
                    {primaryHub.node.label}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                  Degree: <span className="text-emerald-400 font-bold">{primaryHub.degree}</span> ({primaryHub.connectivityShare}% share)
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 font-mono">N/A</div>
            )}
          </div>

          {/* Metric 3: Graph Density */}
          <div className="p-3 rounded-lg border border-border-dark bg-card-bg/40 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 uppercase">
              <span>Graph Density</span>
              <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-extrabold font-mono text-gray-100 flex items-baseline gap-1.5">
              {topology.densityPercent}%
              <span className="text-[10px] text-gray-500 font-normal">saturated</span>
            </div>
            <p className="text-[10px] text-gray-500 font-mono">
              {topology.totalLinks} active of max possible relations
            </p>
          </div>

          {/* Metric 4: Isolated Entities */}
          <div className="p-3 rounded-lg border border-border-dark bg-card-bg/40 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 uppercase">
              <span>Isolated Entities</span>
              <Layers className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-extrabold font-mono text-gray-100 flex items-baseline gap-1.5">
              {topology.isolatedCount}
              <span className="text-[10px] text-gray-500 font-normal">unlinked</span>
            </div>
            <p className="text-[10px] text-gray-500 font-mono">
              Nodes without active relational edges
            </p>
          </div>
        </div>

        {/* Detailed Leaderboard & Entity Type Breakdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Top Hub Entities Leaderboard */}
          <div className="p-3 rounded-lg border border-border-dark bg-brand-bg/60 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-gray-300 uppercase tracking-wide">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Crown className="w-3.5 h-3.5" />
                Top Central Hub Entities
              </span>
              <span className="text-[9px] text-gray-500">BY DEGREE</span>
            </div>
            <div className="space-y-1.5">
              {topology.topHubs.map((item, idx) => (
                <div
                  key={item.node.id}
                  onClick={() => onSelectHub && onSelectHub(item.node)}
                  className="p-2 rounded border border-border-dark bg-card-bg/50 hover:bg-card-bg flex items-center justify-between gap-2 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="w-4 h-4 rounded-full bg-card-bg border border-border-light text-[9px] font-mono font-bold text-gray-400 flex items-center justify-center flex-shrink-0">
                      #{idx + 1}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[item.node.type] || '#64748B' }}
                    />
                    <span className="text-xs font-semibold text-gray-200 truncate">{item.node.label}</span>
                    <span className="text-[9px] font-mono text-gray-500 uppercase px-1.5 py-0.5 rounded bg-brand-bg border border-border-dark flex-shrink-0">
                      {item.node.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] flex-shrink-0">
                    <span className="text-emerald-400 font-bold">{item.degree} links</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Type Distribution Visualizer */}
          <div className="p-3 rounded-lg border border-border-dark bg-brand-bg/60 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-gray-300 uppercase tracking-wide">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Network className="w-3.5 h-3.5" />
                Entity Taxonomy Distribution
              </span>
              <span className="text-[9px] text-gray-500">TAXONOMY</span>
            </div>
            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
              {topology.typeDistribution.map(item => (
                <div key={item.type} className="space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[item.type] || '#64748B' }}
                      />
                      <span className="text-gray-300 font-medium">{item.type}</span>
                    </div>
                    <span className="text-gray-400">
                      <strong className="text-gray-200">{item.count}</strong> ({item.percent}%)
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-card-bg rounded-full overflow-hidden border border-border-dark">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.percent}%`,
                        backgroundColor: TYPE_COLORS[item.type] || '#64748B'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
