/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { CommunityConstellationProps, ConstellationNode, ConstellationLink } from './types';
import { computeCommunitiesAndLayout } from './communityDetection';
import { Search, ZoomIn, ZoomOut, RotateCcw, Orbit, Sparkles, X, Compass, ArrowRight } from 'lucide-react';

export const CommunityConstellationView: React.FC<CommunityConstellationProps> = ({
  nodes,
  links,
  documents = [],
  onNodeSelect,
  selectedNodeId
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<any, any> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const d3NodesRef = useRef<any[]>([]);

  // Search and selection states
  const [searchTerm, setSearchTerm] = useState('');
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(selectedNodeId || null);
  const [selectedCommunities, setSelectedCommunities] = useState<Set<number>>(new Set());
  const [orbitalForceActive, setOrbitalForceActive] = useState<boolean>(true);
  const [generatingReportFor, setGeneratingReportFor] = useState<number | null>(null);
  const [communitySummaries, setCommunitySummaries] = useState<Record<number, string>>({});
  
  // Floating Hover tooltips
  const [hoveredNode, setHoveredNode] = useState<ConstellationNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<ConstellationLink | null>(null);

  // Compute communities and constellation graph metadata
  const { communities, constellationNodes, constellationLinks } = useMemo(() => {
    return computeCommunitiesAndLayout(nodes, links);
  }, [nodes, links]);

  // Default select all communities whenever communities change
  useEffect(() => {
    if (communities.length > 0) {
      setSelectedCommunities(new Set(communities.map(c => c.id)));
    }
  }, [communities]);

  // Sync external selected node
  useEffect(() => {
    if (selectedNodeId) {
      setInspectedNodeId(selectedNodeId);
      zoomToNode(selectedNodeId);
    }
  }, [selectedNodeId]);

  // Filtered nodes & links based on active community checkboxes
  const { activeNodes, activeLinks } = useMemo(() => {
    if (selectedCommunities.size === 0) {
      return { activeNodes: [], activeLinks: [] };
    }

    const filteredNodes = constellationNodes.filter(n => selectedCommunities.has(n.communityId));
    const activeNodeSet = new Set(filteredNodes.map(n => n.id));

    const filteredLinks = constellationLinks.filter(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      return activeNodeSet.has(sId) && activeNodeSet.has(tId);
    });

    return { activeNodes: filteredNodes, activeLinks: filteredLinks };
  }, [constellationNodes, constellationLinks, selectedCommunities]);

  // Inspected node object
  const inspectedNode = useMemo(() => {
    if (!inspectedNodeId) return null;
    return constellationNodes.find(n => n.id === inspectedNodeId) || null;
  }, [inspectedNodeId, constellationNodes]);

  // Connected neighbors of inspected node
  const neighborNodes = useMemo(() => {
    if (!inspectedNode) return [];
    const connectedIds = new Set<string>();
    links.forEach(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      if (sId === inspectedNode.id) connectedIds.add(tId);
      if (tId === inspectedNode.id) connectedIds.add(sId);
    });
    return constellationNodes.filter(n => connectedIds.has(n.id));
  }, [inspectedNode, links, constellationNodes]);

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    return constellationNodes.filter(n => n.label.toLowerCase().includes(q)).slice(0, 8);
  }, [searchTerm, constellationNodes]);

  // Zoom & Pan to a node smoothly
  const zoomToNode = (targetNodeId: string) => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const target = d3NodesRef.current.find(n => n.id === targetNodeId);
    if (!target || target.x == null || target.y == null) return;

    setInspectedNodeId(targetNodeId);

    const width = containerRef.current.clientWidth || 800;
    const height = 520;
    const scale = 1.8;
    const x = width / 2 - target.x * scale;
    const y = height / 2 - target.y * scale;

    const transform = d3.zoomIdentity.translate(x, y).scale(scale);

    d3.select(svgRef.current)
      .transition()
      .duration(700)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.transform, transform);

    const originalNode = nodes.find(n => n.id === targetNodeId);
    if (originalNode && onNodeSelect) {
      onNodeSelect(originalNode);
    }
  };

  // Toggle community selection
  const toggleCommunity = (id: number) => {
    setSelectedCommunities(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedCommunities.size === communities.length) {
      setSelectedCommunities(new Set());
    } else {
      setSelectedCommunities(new Set(communities.map(c => c.id)));
    }
  };

  // D3 Canvas Rendering
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Reset SVG
    d3.select(svgRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth || 800;
    const height = 520;
    const centerX = width / 2;
    const centerY = height / 2;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Defs: Gradients & Star Glow
    const defs = svg.append('defs');

    // Background Radial Gradient
    const spaceGrad = defs.append('radialGradient')
      .attr('id', 'constellation-space-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '75%');
    spaceGrad.append('stop').attr('offset', '0%').attr('stop-color', '#13182C');
    spaceGrad.append('stop').attr('offset', '60%').attr('stop-color', '#0C0E1A');
    spaceGrad.append('stop').attr('offset', '100%').attr('stop-color', '#07080F');

    // Star Glow Filter
    const starFilter = defs.append('filter')
      .attr('id', 'star-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    starFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = starFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    svg.append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'url(#constellation-space-grad)');

    // Deep copy for simulation
    const d3Nodes = activeNodes.map(n => ({ ...n }));
    const d3Links = activeLinks.map(l => ({
      ...l,
      source: d3Nodes.find(n => n.id === (typeof l.source === 'object' ? l.source.id : l.source)) || l.source,
      target: d3Nodes.find(n => n.id === (typeof l.target === 'object' ? l.target.id : l.target)) || l.target
    }));

    d3NodesRef.current = d3Nodes;

    const g = svg.append('g').attr('class', 'constellation-zoom-layer');

    // Zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;

    // Optional subtle orbital guide circles in background
    if (orbitalForceActive) {
      const guideGroup = g.append('g').attr('class', 'orbital-guide-rings').attr('opacity', 0.15);
      [270, 305].forEach(r => {
        guideGroup.append('circle')
          .attr('cx', centerX)
          .attr('cy', centerY)
          .attr('r', r)
          .attr('fill', 'none')
          .attr('stroke', '#64748B')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,8');
      });
    }

    // Community Centroids calculation for clustered galactic cores
    const communityCenters = new Map<number, { x: number; y: number }>();
    const totalComms = communities.length;
    communities.forEach((c, idx) => {
      if (totalComms === 1) {
        communityCenters.set(c.id, { x: centerX, y: centerY });
      } else {
        // Distribute community core galaxies around center in spiral
        const angle = (idx / totalComms) * Math.PI * 2;
        const radius = Math.min(160, 40 + idx * 12);
        communityCenters.set(c.id, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius
        });
      }
    });

    // Setup Simulation
    const simulation = d3.forceSimulation<any>(d3Nodes)
      .force('link', d3.forceLink<any, any>(d3Links).id(d => d.id).distance(d => d.isInterCommunity ? 70 : 25).strength(0.5))
      .force('charge', d3.forceManyBody<any>().strength(d => (d as any).isSatellite ? -15 : -65))
      .force('center', d3.forceCenter(centerX, centerY).strength(0.08))
      .force('collide', d3.forceCollide<any>(d => (d as any).isSatellite ? 6 : 10))
      // Custom clustering force: pull core nodes toward community centroids
      .force('cluster', (alpha) => {
        for (const node of d3Nodes as any[]) {
          if (!node.isSatellite) {
            const center = communityCenters.get(node.communityId) || { x: centerX, y: centerY };
            node.vx += (center.x - node.x) * 0.08 * alpha;
            node.vy += (center.y - node.y) * 0.08 * alpha;
          }
        }
      });

    // Custom orbital ring force: pull satellites to concentric outer orbit
    if (orbitalForceActive) {
      simulation.force('orbital_ring', (alpha) => {
        for (const node of d3Nodes as any[]) {
          if (node.isSatellite && node.orbitalRadius !== undefined && node.orbitalAngle !== undefined) {
            const targetX = centerX + Math.cos(node.orbitalAngle) * node.orbitalRadius;
            const targetY = centerY + Math.sin(node.orbitalAngle) * node.orbitalRadius;
            node.vx += (targetX - node.x) * 0.25 * alpha;
            node.vy += (targetY - node.y) * 0.25 * alpha;
          }
        }
      });
    }

    simRef.current = simulation;

    // Links Layer
    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup.selectAll<SVGLineElement, any>('line')
      .data<any>(d3Links)
      .enter().append('line')
      .attr('stroke', d => d.isInterCommunity ? '#94A3B8' : (d.source.communityColor || '#4F75FF'))
      .attr('stroke-opacity', d => d.isInterCommunity ? 0.25 : 0.45)
      .attr('stroke-width', d => d.isInterCommunity ? 0.75 : 1.1)
      .attr('class', 'cursor-pointer')
      .on('mouseenter', (event, d) => {
        setHoveredLink(d);
      })
      .on('mouseleave', () => {
        setHoveredLink(null);
      });

    // Nodes Layer
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup.selectAll<SVGGElement, any>('g')
      .data<any>(d3Nodes)
      .enter().append('g')
      .attr('class', 'constellation-node cursor-pointer')
      .call(d3.drag<any, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.2).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }))
      .on('click', (event, d) => {
        zoomToNode(d.id);
      });

    // Glowing halo for inspected or high-degree nodes
    node.append('circle')
      .attr('r', d => {
        if (d.id === inspectedNodeId) return 14;
        return d.degree > 3 ? 9 : (d.isSatellite ? 3.5 : 6);
      })
      .attr('fill', d => d.communityColor)
      .attr('opacity', d => d.id === inspectedNodeId ? 0.6 : (d.degree > 3 ? 0.25 : 0.1))
      .attr('filter', d => d.id === inspectedNodeId ? 'url(#star-glow)' : 'none');

    // Core dot
    node.append('circle')
      .attr('r', d => {
        if (d.id === inspectedNodeId) return 6.5;
        if (d.degree > 5) return 5;
        if (d.degree > 2) return 4;
        return d.isSatellite ? 2.2 : 3.2;
      })
      .attr('fill', d => d.communityColor)
      .attr('stroke', d => d.id === inspectedNodeId ? '#FFFFFF' : '#0B0D14')
      .attr('stroke-width', d => d.id === inspectedNodeId ? 2 : 0.75);

    // Dynamic hover & search highlights
    node.on('mouseenter', (event, d) => {
      setHoveredNode(d);
      const neighborIds = new Set<string>([d.id]);
      d3Links.forEach(l => {
        if (l.source.id === d.id) neighborIds.add(l.target.id);
        if (l.target.id === d.id) neighborIds.add(l.source.id);
      });

      node.attr('opacity', n => neighborIds.has(n.id) ? 1 : 0.15);
      link.attr('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.05);
      link.attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 2.5 : 0.75);
    }).on('mouseleave', () => {
      setHoveredNode(null);
      node.attr('opacity', 1);
      link.attr('opacity', 1);
      link.attr('stroke-width', d => d.isInterCommunity ? 0.75 : 1.1);
    });

    // Tick update
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Resize observer with animation frame to prevent loop notifications
    let animationFrameId: number | null = null;
    const observer = new ResizeObserver((entries) => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        if (!entries || entries.length === 0 || !containerRef.current) return;
        const newWidth = containerRef.current.clientWidth;
        if (newWidth > 0) {
          svg.attr('width', newWidth);
          simulation.force('center', d3.forceCenter(newWidth / 2, height / 2));
          simulation.alpha(0.15).restart();
        }
      });
    });
    observer.observe(containerRef.current);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      observer.disconnect();
      simulation.stop();
    };
  }, [activeNodes, activeLinks, inspectedNodeId, orbitalForceActive, communities]);

  // Zoom helpers
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.35);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.75);
  };

  const handleReset = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  // Generate community summary on the fly
  const handleGenerateSummary = async (comm: typeof communities[0]) => {
    if (communitySummaries[comm.id]) return;
    setGeneratingReportFor(comm.id);

    try {
      const topEntitiesStr = comm.topEntities.join(', ');
      const prompt = `Summarize Knowledge Graph Cluster "${comm.name}" (${comm.nodeCount} entities): Top hubs are ${topEntitiesStr}. Give a crisp 2-sentence domain summary explaining what this cluster covers.`;
      
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: prompt })
      });
      const data = await res.json();
      setCommunitySummaries(prev => ({
        ...prev,
        [comm.id]: data.answer || `Semantic cluster representing ${topEntitiesStr} and related cross-functional workflows.`
      }));
    } catch {
      setCommunitySummaries(prev => ({
        ...prev,
        [comm.id]: `Cluster centered on ${comm.topEntities.join(', ')}.`
      }));
    } finally {
      setGeneratingReportFor(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden border border-border-dark bg-[#0A0C14] shadow-2xl flex flex-col lg:flex-row min-h-[600px]"
    >
      {/* LEFT: Celestial Constellation Canvas */}
      <div className="relative flex-1 min-h-[480px] lg:min-h-[600px] overflow-hidden bg-[#0A0C14]">
        {/* Floating Zoom & Orbit Controls */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-[#121624]/90 backdrop-blur-md border border-border-dark p-1.5 rounded-lg shadow-lg">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 text-gray-300 hover:text-white hover:bg-border-dark rounded transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 text-gray-300 hover:text-white hover:bg-border-dark rounded transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleReset}
            title="Reset Centering"
            className="p-1.5 text-gray-300 hover:text-white hover:bg-border-dark rounded transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="h-3.5 w-px bg-border-dark mx-0.5" />
          <button
            onClick={() => setOrbitalForceActive(!orbitalForceActive)}
            title={orbitalForceActive ? "Disable Orbital Ring Layout" : "Enable Orbital Ring Layout"}
            className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-colors ${
              orbitalForceActive
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Orbit className="w-3 h-3" />
            <span>ORBITAL</span>
          </button>
        </div>

        {/* Floating Hover Card in Galaxy Canvas */}
        {hoveredNode && (
          <div className="absolute bottom-3 left-3 z-20 bg-[#0B0D14]/95 backdrop-blur-xl border border-blue-500/40 p-2.5 rounded-lg shadow-xl font-mono text-xs max-w-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-white truncate">{hoveredNode.label}</span>
              <span
                className="px-1.5 py-0.5 text-[9px] font-bold rounded text-slate-900 uppercase"
                style={{ backgroundColor: hoveredNode.communityColor }}
              >
                Comm {hoveredNode.communityId}
              </span>
            </div>
            <div className="text-[10px] text-gray-400">
              Type: <strong className="text-gray-200">{hoveredNode.type}</strong> · {hoveredNode.degree} connections
            </div>
          </div>
        )}

        {hoveredLink && !hoveredNode && (
          <div className="absolute bottom-3 left-3 z-20 bg-[#0B0D14]/95 backdrop-blur-xl border border-blue-500/40 p-2 rounded-lg shadow-xl font-mono text-xs">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-blue-300 font-bold">
                {typeof hoveredLink.source === 'object' ? (hoveredLink.source as any).label : hoveredLink.source}
              </span>
              <ArrowRight className="w-3 h-3 text-gray-400" />
              <span className="text-blue-300 font-bold">
                {typeof hoveredLink.target === 'object' ? (hoveredLink.target as any).label : hoveredLink.target}
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Canvas */}
        <svg
          ref={svgRef}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
        />

        {/* Empty state warning */}
        {activeNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-gray-500 font-mono text-xs">
            No communities selected. Check one or more communities in the right sidebar to render the graph.
          </div>
        )}
      </div>

      {/* RIGHT: High-Precision Communities & Node Inspector Sidebar */}
      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border-dark bg-[#0F121E] flex flex-col text-gray-200 font-mono text-xs">
        {/* 1. Search Nodes Box with Instant Camera Jump */}
        <div className="p-3.5 border-b border-border-dark bg-[#131726]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search & jump to node..."
              className="w-full bg-[#0A0C14] border border-border-dark rounded-md pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick search dropdown results */}
          {searchMatches.length > 0 && (
            <div className="mt-2 bg-[#0A0C14] border border-border-dark rounded-md overflow-hidden shadow-xl divide-y divide-border-dark">
              {searchMatches.map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    zoomToNode(m.id);
                    setSearchTerm('');
                  }}
                  className="w-full text-left px-2.5 py-1.5 flex items-center justify-between hover:bg-[#161B2E] transition-colors text-[11px]"
                >
                  <span className="truncate text-gray-200">{m.label}</span>
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: m.communityColor }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2. Node Info Inspector */}
        <div className="p-3.5 border-b border-border-dark bg-[#0F121E]">
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-2">
            NODE INFO
          </div>
          {inspectedNode ? (
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white text-xs truncate">
                  {inspectedNode.label}
                </span>
                <span
                  className="px-2 py-0.5 text-[9px] font-bold rounded-full text-slate-900"
                  style={{ backgroundColor: inspectedNode.communityColor }}
                >
                  Comm {inspectedNode.communityId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400 bg-[#0A0C14] p-2 rounded border border-border-dark">
                <div>
                  <span className="text-gray-500 block">Type</span>
                  <span className="text-gray-200 font-bold">{inspectedNode.type}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Connections</span>
                  <span className="text-blue-400 font-bold">{inspectedNode.degree} links</span>
                </div>
              </div>

              {neighborNodes.length > 0 && (
                <div>
                  <span className="text-[10px] text-gray-500 block mb-1">Adjacent Entities:</span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                    {neighborNodes.map(nb => (
                      <button
                        key={nb.id}
                        onClick={() => zoomToNode(nb.id)}
                        className="text-[10px] bg-[#161B2E] hover:bg-[#1E253F] border border-border-dark px-1.5 py-0.5 rounded text-gray-300 truncate max-w-[140px]"
                      >
                        {nb.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500 italic text-[11px] py-1">
              Click a node to inspect &amp; focus camera
            </div>
          )}
        </div>

        {/* 3. Communities List (Checklist with colored indicators & counts) */}
        <div className="flex-1 flex flex-col overflow-hidden p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
              COMMUNITIES
            </span>
            <span className="text-[10px] text-gray-500">
              {communities.length} clusters
            </span>
          </div>

          {/* Select All Checkbox */}
          <label className="flex items-center gap-2.5 py-1.5 px-2 bg-[#131726] border border-border-dark rounded-md mb-2 cursor-pointer hover:bg-[#181D30] transition-colors">
            <input
              type="checkbox"
              checked={selectedCommunities.size === communities.length}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 rounded border-border-dark bg-[#0A0C14] text-blue-600 focus:ring-0 cursor-pointer accent-blue-500"
            />
            <span className="text-xs text-gray-200 font-bold">Select All</span>
          </label>

          {/* Communities Scrollable List */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {communities.map(comm => {
              const isChecked = selectedCommunities.has(comm.id);
              const summary = communitySummaries[comm.id];
              const isGenerating = generatingReportFor === comm.id;

              return (
                <div
                  key={comm.id}
                  className={`group rounded-md border p-1.5 transition-colors ${
                    isChecked
                      ? 'bg-[#121624] border-border-dark hover:border-gray-600'
                      : 'bg-[#0A0C14]/50 border-transparent opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCommunity(comm.id)}
                        className="w-3.5 h-3.5 rounded border-border-dark bg-[#0A0C14] text-blue-600 focus:ring-0 cursor-pointer accent-blue-500"
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: comm.color }}
                      />
                      <span className="text-[11px] text-gray-200 truncate">
                        {comm.name}
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleGenerateSummary(comm)}
                        title="Generate Cluster AI Summary"
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-amber-300 transition-opacity"
                      >
                        <Sparkles className={`w-3 h-3 ${isGenerating ? 'animate-spin text-amber-400' : ''}`} />
                      </button>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {comm.nodeCount}
                      </span>
                    </div>
                  </div>

                  {/* Summary preview if generated */}
                  {summary && (
                    <div className="mt-1.5 pt-1.5 border-t border-border-dark text-[10px] text-gray-400 bg-[#0A0C14] p-1.5 rounded">
                      {summary}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Global Bottom Footer Stats Bar */}
        <div className="p-2.5 border-t border-border-dark bg-[#0A0C14] text-[10px] text-gray-500 text-center flex items-center justify-center gap-1.5">
          <span>{activeNodes.length} nodes</span>
          <span>·</span>
          <span>{activeLinks.length} edges</span>
          <span>·</span>
          <span>{selectedCommunities.size} communities</span>
        </div>
      </div>
    </div>
  );
};
