/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Node, Link, NodeType } from '../types';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Grid, 
  RefreshCw, 
  Maximize2,
  Compass,
  Eye,
  EyeOff,
  Sparkles,
  Crosshair,
  ArrowRight,
  X
} from 'lucide-react';

interface ForceGraphProps {
  nodes: Node[];
  links: Link[];
  retrievedNodes: string[];
  retrievedEdges: string[];
  contributionRatings: Record<string, { level: 'high' | 'medium' | 'low' | 'none'; reason: string }>;
  onNodeClick?: (node: Node) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const TYPE_COLORS: Record<NodeType, string> = {
  Person: '#F59E0B',        // Vibrant Gold Amber
  Organization: '#3B82F6',  // Bright Azure Blue
  Team: '#A855F7',          // Electric Violet
  Product: '#10B981',       // Emerald Green
  Technology: '#EC4899',    // Hot Pink
  Feature: '#06B6D4',       // Cyber Cyan
  Other: '#94A3B8'          // Slate Silver
};

export type LabelMode = 'smart' | 'none' | 'retrieved' | 'all';

export const ForceGraph: React.FC<ForceGraphProps> = ({
  nodes,
  links,
  retrievedNodes,
  retrievedEdges,
  contributionRatings,
  onNodeClick,
  onRefresh,
  isLoading
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<any, any> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const d3NodesRef = useRef<any[]>([]);
  const d3LinksRef = useRef<any[]>([]);

  // Text label mode: 'smart' (no permanent clutter; labels appear on hover/selection), 'none', 'retrieved', 'all'
  const [labelMode, setLabelMode] = useState<LabelMode>('smart');
  const [showGrid, setShowGrid] = useState(true);
  const [spacingMultiplier, setSpacingMultiplier] = useState<number>(1.2);
  const [minDegreeFilter, setMinDegreeFilter] = useState<number>(0);
  
  // Interactive Locator & Hover states
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [spotlightNodeId, setSpotlightNodeId] = useState<string | null>(null);
  const [spotlightLinkId, setSpotlightLinkId] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<NodeType | 'ALL'>('ALL');
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [hoveredLink, setHoveredLink] = useState<Link | null>(null);

  // Degree map calculation
  const nodeDegrees = useMemo(() => {
    const degMap = new Map<string, number>();
    nodes.forEach(n => degMap.set(n.id, 0));
    links.forEach(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      if (degMap.has(sId)) degMap.set(sId, (degMap.get(sId) || 0) + 1);
      if (degMap.has(tId)) degMap.set(tId, (degMap.get(tId) || 0) + 1);
    });
    return degMap;
  }, [nodes, links]);

  // Pruned nodes for uncluttered viewing with high-performance safe bounds
  const filteredNodes = useMemo(() => {
    let res = nodes;
    if (minDegreeFilter > 0) {
      res = res.filter(n => (nodeDegrees.get(n.id) || 0) >= minDegreeFilter);
    }
    if (selectedTypeFilter !== 'ALL') {
      res = res.filter(n => n.type === selectedTypeFilter);
    }

    // Performance protection: if graph has > 150 nodes, prioritize retrieved and top degree hub entities
    if (res.length > 150) {
      const retrievedSet = new Set(retrievedNodes);
      const sorted = [...res].sort((a, b) => {
        const aRet = retrievedSet.has(a.id) || a.id === spotlightNodeId ? 1 : 0;
        const bRet = retrievedSet.has(b.id) || b.id === spotlightNodeId ? 1 : 0;
        if (aRet !== bRet) return bRet - aRet;
        return (nodeDegrees.get(b.id) || 0) - (nodeDegrees.get(a.id) || 0);
      });
      res = sorted.slice(0, 150);
    }

    return res;
  }, [nodes, minDegreeFilter, selectedTypeFilter, nodeDegrees, retrievedNodes, spotlightNodeId]);

  const filteredLinks = useMemo(() => {
    const nodeSet = new Set(filteredNodes.map(n => n.id));
    return links.filter(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      return nodeSet.has(sId) && nodeSet.has(tId);
    });
  }, [links, filteredNodes]);

  // Search Results for Quick Locator
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { matchedNodes: [], matchedLinks: [] };
    const q = searchQuery.toLowerCase().trim();

    const matchedNodes = nodes.filter(n => 
      n.label.toLowerCase().includes(q) || 
      n.type.toLowerCase().includes(q)
    ).slice(0, 8);

    const matchedLinks = links.filter(l => {
      const sLabel = typeof l.source === 'object' ? (l.source as any).label || (l.source as any).id : l.source;
      const tLabel = typeof l.target === 'object' ? (l.target as any).label || (l.target as any).id : l.target;
      return (
        l.relation.toLowerCase().includes(q) ||
        String(sLabel).toLowerCase().includes(q) ||
        String(tLabel).toLowerCase().includes(q)
      );
    }).slice(0, 6);

    return { matchedNodes, matchedLinks };
  }, [searchQuery, nodes, links]);

  // Spotlight and smoothly zoom to a specific Node
  const zoomToNode = (targetNodeId: string) => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const target = d3NodesRef.current.find(n => n.id === targetNodeId);
    if (!target || target.x == null || target.y == null) return;

    setSpotlightNodeId(targetNodeId);
    setSpotlightLinkId(null);
    setIsSearchOpen(false);

    const width = containerRef.current.clientWidth || 800;
    const height = 520;
    const scale = 1.6;
    const x = width / 2 - target.x * scale;
    const y = height / 2 - target.y * scale;

    const transform = d3.zoomIdentity.translate(x, y).scale(scale);

    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.transform, transform);

    const originalNode = nodes.find(n => n.id === targetNodeId);
    if (originalNode && onNodeClick) {
      onNodeClick(originalNode);
    }
  };

  // Spotlight and smoothly zoom to a specific Link
  const zoomToLink = (linkItem: Link) => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const sId = typeof linkItem.source === 'object' ? linkItem.source.id : linkItem.source;
    const tId = typeof linkItem.target === 'object' ? linkItem.target.id : linkItem.target;
    
    const sourceNode = d3NodesRef.current.find(n => n.id === sId);
    const targetNode = d3NodesRef.current.find(n => n.id === tId);

    if (!sourceNode || !targetNode || sourceNode.x == null || targetNode.x == null) return;

    setSpotlightLinkId(linkItem.id);
    setSpotlightNodeId(null);
    setIsSearchOpen(false);

    const midX = (sourceNode.x + targetNode.x) / 2;
    const midY = (sourceNode.y + targetNode.y) / 2;

    const width = containerRef.current.clientWidth || 800;
    const height = 520;
    const scale = 1.5;
    const x = width / 2 - midX * scale;
    const y = height / 2 - midY * scale;

    const transform = d3.zoomIdentity.translate(x, y).scale(scale);

    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.transform, transform);
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    // Deep copy data for D3 force simulation
    const d3Nodes = filteredNodes.map(n => ({ ...n }));
    const d3Links = filteredLinks.map(l => ({
      ...l,
      source: d3Nodes.find(n => n.id === (typeof l.source === 'object' ? l.source.id : l.source)) || l.source,
      target: d3Nodes.find(n => n.id === (typeof l.target === 'object' ? l.target.id : l.target)) || l.target
    }));

    d3NodesRef.current = d3Nodes;
    d3LinksRef.current = d3Links;

    const width = containerRef.current.clientWidth || 800;
    const height = 520;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // SVG Defs: Filters & Patterns
    const defs = svg.append('defs');

    // Glow filter for beacon / radar
    const filter = defs.append('filter')
      .attr('id', 'glow-cyan')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Dot Grid Pattern
    const pattern = defs.append('pattern')
      .attr('id', 'dot-grid-pattern')
      .attr('width', 28)
      .attr('height', 28)
      .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('circle')
      .attr('cx', 2)
      .attr('cy', 2)
      .attr('r', 1)
      .attr('fill', '#334155')
      .attr('opacity', 0.4);

    // Canvas Background
    svg.append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', showGrid ? 'url(#dot-grid-pattern)' : 'transparent')
      .attr('class', 'pointer-events-none');

    // Main Zoom Container
    const g = svg.append('g').attr('class', 'zoom-group');

    // Setup D3 Zoom
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;

    // Uncongested Force Simulation Setup with Dynamic Spacing & Degree-Aware Repulsion
    const baseLinkDist = Math.max(140, 160 * spacingMultiplier);
    const baseCharge = -450 * spacingMultiplier;

    const simulation = d3.forceSimulation<any>(d3Nodes)
      .alphaDecay(0.04)
      .alphaMin(0.005)
      .force('link', d3.forceLink<any, any>(d3Links).id(d => d.id).distance((d: any) => {
        const sDeg = nodeDegrees.get(typeof d.source === 'object' ? d.source.id : d.source.id || d.source) || 1;
        const tDeg = nodeDegrees.get(typeof d.target === 'object' ? d.target.id : d.target.id || d.target) || 1;
        return baseLinkDist + Math.min(sDeg + tDeg, 10) * 12;
      }).strength(0.45))
      .force('charge', d3.forceManyBody<any>()
        .theta(0.8)
        .distanceMax(500)
        .strength((d: any) => {
          const deg = nodeDegrees.get(d.id) || 1;
          return baseCharge - (deg * 60);
        }))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collide', d3.forceCollide<any>((d: any) => {
        const deg = nodeDegrees.get(d.id) || 1;
        return 42 + Math.min(deg, 8) * 5;
      }).iterations(2));

    simRef.current = simulation;

    // Link Group Layer
    const linkGroup = g.append('g').attr('class', 'links');
    
    // Link Lines
    const link = linkGroup.selectAll<SVGLineElement, any>('line')
      .data<any>(d3Links)
      .enter().append('line')
      .attr('stroke', '#64748B')
      .attr('stroke-opacity', 0.75)
      .attr('stroke-width', 2)
      .attr('class', d => {
        const isRetrieved = retrievedEdges.includes(d.id);
        const isSpotlighted = spotlightLinkId === d.id;
        const rating = contributionRatings[d.id];

        let classes = 'transition-all duration-200 cursor-pointer ';
        if (isSpotlighted) {
          classes += ' !stroke-cyan-300 !stroke-[4px] !opacity-100 filter-[drop-shadow(0_0_10px_rgba(6,182,212,1))]';
        } else if (isRetrieved) {
          classes += ' stroke-cyan-400 stroke-[3px] [stroke-dasharray:6,4] opacity-100 filter-[drop-shadow(0_0_6px_rgba(6,182,212,0.8))]';
        } else if (retrievedNodes.length > 0) {
          classes += ' opacity-20 ';
        }

        if (rating) {
          if (rating.level === 'high') {
            classes += ' !stroke-amber-400 !stroke-[4px] !opacity-100 ![stroke-dasharray:none] filter-[drop-shadow(0_0_10px_rgba(245,158,11,0.9))]';
          } else if (rating.level === 'medium') {
            classes += ' !stroke-yellow-300 !stroke-[3px] !opacity-90 ![stroke-dasharray:none]';
          } else if (rating.level === 'low') {
            classes += ' !stroke-amber-200/60 !stroke-[2px] !opacity-70 [stroke-dasharray:3,3]';
          }
        }
        return classes;
      })
      .on('mouseenter', (event, d) => {
        setHoveredLink(d);
        if (labelMode === 'smart') {
          d3.select(event.currentTarget).style('stroke', '#38BDF8').style('stroke-width', '3.5px');
          edgeText.filter(l => l.id === d.id).style('opacity', '1').style('font-weight', '800');
        }
      })
      .on('mouseleave', (event, d) => {
        setHoveredLink(null);
        if (labelMode === 'smart') {
          d3.select(event.currentTarget).style('stroke', '').style('stroke-width', '');
          edgeText.filter(l => l.id === d.id).style('opacity', '0');
        }
      });

    // Relationship Text Labels on Edges (Controlled by labelMode)
    const edgeTextGroup = g.append('g').attr('class', 'edge-labels');
    const edgeText = edgeTextGroup.selectAll<SVGTextElement, any>('text')
      .data<any>(d3Links)
      .enter().append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .attr('fill', '#38BDF8')
      .attr('stroke', '#0F1219')
      .attr('stroke-width', '3px')
      .attr('paint-order', 'stroke fill')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace')
      .attr('opacity', d => {
        if (labelMode === 'all') return 0.9;
        if (labelMode === 'retrieved') return retrievedEdges.includes(d.id) ? 1 : 0;
        if (labelMode === 'smart') return (spotlightLinkId === d.id) ? 1 : 0;
        return 0; // 'none'
      })
      .attr('pointer-events', 'none')
      .text(d => d.relation ? d.relation.toUpperCase() : '');

    // Node Group Layer
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const node = nodeGroup.selectAll<SVGGElement, any>('g')
      .data<any>(d3Nodes)
      .enter().append('g')
      .attr('class', 'node cursor-pointer group')
      .call(d3.drag<any, any>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('click', (event, d) => {
        setSpotlightNodeId(d.id);
        setSpotlightLinkId(null);
        if (onNodeClick) onNodeClick(d);
      })
      .on('mouseenter', (event, d) => {
        setHoveredNode(d);

        // Highlight connected links & nodes
        const connectedNodeIds = new Set<string>([d.id]);
        d3Links.forEach(l => {
          if (l.source.id === d.id) connectedNodeIds.add(l.target.id);
          if (l.target.id === d.id) connectedNodeIds.add(l.source.id);
        });

        // Dim non-connected
        node.style('opacity', n => connectedNodeIds.has(n.id) ? '1' : '0.12');
        link.style('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? '1' : '0.08');
        link.style('stroke', l => (l.source.id === d.id || l.target.id === d.id) ? '#38BDF8' : '');
        link.style('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? '3.5px' : '');

        // In smart mode, show labels for hovered node & its immediate neighbors
        if (labelMode === 'smart') {
          nodeText.style('opacity', n => connectedNodeIds.has(n.id) ? '1' : '0');
          edgeText.style('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? '1' : '0');
        }
      })
      .on('mouseleave', () => {
        setHoveredNode(null);

        // Reset styles
        node.style('opacity', '1');
        link.style('opacity', '');
        link.style('stroke', '');
        link.style('stroke-width', '');

        if (labelMode === 'smart') {
          nodeText.style('opacity', n => (spotlightNodeId === n.id) ? '1' : '0');
          edgeText.style('opacity', l => (spotlightLinkId === l.id) ? '1' : '0');
        }
      });

    // Node Outer Glow Ring
    node.append('circle')
      .attr('class', 'node-glow-ring')
      .attr('r', d => {
        const degree = d3Links.filter(l => l.source.id === d.id || l.target.id === d.id).length;
        return 15 + Math.min(degree, 6) * 2;
      })
      .attr('fill', 'none')
      .attr('stroke', d => TYPE_COLORS[d.type] || TYPE_COLORS.Other)
      .attr('stroke-width', d => (d.id === spotlightNodeId) ? 3.5 : 2)
      .attr('stroke-opacity', d => (d.id === spotlightNodeId) ? 0.8 : 0.25)
      .attr('class', 'transition-all duration-300');

    // Main Node Circle
    node.append('circle')
      .attr('r', d => {
        const degree = d3Links.filter(l => l.source.id === d.id || l.target.id === d.id).length;
        return (d.id === spotlightNodeId) ? 14 : (10 + Math.min(degree, 6) * 2);
      })
      .attr('fill', d => TYPE_COLORS[d.type] || TYPE_COLORS.Other)
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', d => (d.id === spotlightNodeId) ? 3.5 : 2)
      .attr('stroke-opacity', 0.9)
      .attr('class', d => {
        const isRetrieved = retrievedNodes.includes(d.id);
        const isSpotlighted = d.id === spotlightNodeId;
        const rating = d3Links
          .filter(l => l.source.id === d.id || l.target.id === d.id)
          .map(l => contributionRatings[l.id])
          .find(r => r && r.level !== 'none');

        let classes = 'transition-all duration-300 shadow-lg ';
        if (isSpotlighted) {
          classes += ' !stroke-cyan-300 !stroke-[3.5px] filter-[drop-shadow(0_0_12px_rgba(6,182,212,1))]';
        } else if (isRetrieved) {
          classes += ' !stroke-cyan-400 !stroke-[3.5px] filter-[drop-shadow(0_0_10px_rgba(6,182,212,0.9))]';
        }

        if (rating) {
          if (rating.level === 'high') {
            classes += ' !stroke-amber-400 !stroke-[4px] filter-[drop-shadow(0_0_12px_rgba(245,158,11,1))]';
          } else if (rating.level === 'medium') {
            classes += ' !stroke-yellow-300 !stroke-[3px] filter-[drop-shadow(0_0_8px_rgba(253,224,71,0.8))]';
          }
        }
        return classes;
      });

    // Node Type Symbol Badge in Center
    node.append('text')
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', '#0F1219')
      .attr('font-size', '10px')
      .attr('font-weight', '800')
      .attr('font-family', 'sans-serif')
      .attr('pointer-events', 'none')
      .text(d => d.type ? d.type.charAt(0).toUpperCase() : 'N');

    // High Contrast Node Text Labels (Visibility controlled by labelMode)
    const nodeText = node.append('text')
      .attr('dy', d => {
        const degree = d3Links.filter(l => l.source.id === d.id || l.target.id === d.id).length;
        const r = 10 + Math.min(degree, 6) * 2;
        return r + 14;
      })
      .attr('text-anchor', 'middle')
      .attr('fill', '#F8FAFC')
      .attr('stroke', '#0F1219')
      .attr('stroke-width', '3.5px')
      .attr('paint-order', 'stroke fill')
      .attr('font-size', '10.5px')
      .attr('font-weight', '600')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace')
      .attr('opacity', d => {
        if (labelMode === 'all') return 1;
        if (labelMode === 'retrieved') return retrievedNodes.includes(d.id) ? 1 : 0;
        if (labelMode === 'smart') return (d.id === spotlightNodeId) ? 1 : 0;
        return 0; // 'none'
      })
      .attr('class', d => {
        const isRetrieved = retrievedNodes.includes(d.id);
        const isSpotlighted = d.id === spotlightNodeId;
        if (isSpotlighted) return '!fill-cyan-300 !font-extrabold text-[12px]';
        if (isRetrieved) return '!fill-amber-300 !font-bold';
        return '';
      })
      .text(d => d.label.length > 22 ? d.label.slice(0, 20) + '…' : d.label);

    // Simulation Tick Listener
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      edgeText
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag handlers
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Container Resize Observer with animation frame to prevent loop notifications
    let animationFrameId: number | null = null;
    const observer = new ResizeObserver((entries) => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        if (!entries || entries.length === 0 || !containerRef.current) return;
        const newWidth = entries[0].contentRect.width;
        if (newWidth > 0) {
          svg.attr('width', newWidth);
          simulation.force('center', d3.forceCenter(newWidth / 2, height / 2));
          simulation.alpha(0.1).restart();
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
  }, [
    filteredNodes, 
    filteredLinks, 
    labelMode, 
    showGrid, 
    spacingMultiplier, 
    retrievedNodes, 
    retrievedEdges, 
    contributionRatings, 
    nodeDegrees, 
    spotlightNodeId, 
    spotlightLinkId
  ]);

  // Handle Zoom Control Buttons
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.3);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.7);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    setSpotlightNodeId(null);
    setSpotlightLinkId(null);
    d3.select(svgRef.current).transition().duration(400).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  // Connected neighbors for hovered or spotlighted node
  const activeFocusNode = hoveredNode || (spotlightNodeId ? nodes.find(n => n.id === spotlightNodeId) : null);
  const activeNodeNeighbors = useMemo(() => {
    if (!activeFocusNode) return [];
    const neighborMap: { node: Node; relation: string; direction: 'outgoing' | 'incoming' }[] = [];
    links.forEach(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      if (sId === activeFocusNode.id) {
        const targetNode = nodes.find(n => n.id === tId);
        if (targetNode) neighborMap.push({ node: targetNode, relation: l.relation, direction: 'outgoing' });
      } else if (tId === activeFocusNode.id) {
        const sourceNode = nodes.find(n => n.id === sId);
        if (sourceNode) neighborMap.push({ node: sourceNode, relation: l.relation, direction: 'incoming' });
      }
    });
    return neighborMap.slice(0, 6);
  }, [activeFocusNode, nodes, links]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden bg-panel-bg border border-border-dark rounded-xl shadow-2xl">
      {/* Top Floating Control Toolbar */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-card-bg/90 backdrop-blur-md border border-border-dark p-1.5 rounded-lg shadow-lg max-w-[calc(100%-24px)] flex-wrap justify-end">
        {/* Label Visibility Mode Selector (Solves Canvas Text Congestion) */}
        <div className="flex items-center bg-[#0B0D14] border border-border-dark rounded-md p-0.5 text-[10px] font-mono">
          <button
            onClick={() => setLabelMode('smart')}
            title="Smart Mode: Clean canvas with zero text clutter. Labels illuminate dynamically on hover & spotlight."
            className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
              labelMode === 'smart' 
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>SMART HOVER</span>
          </button>

          <button
            onClick={() => setLabelMode('none')}
            title="Clean Mode: Completely hides all text labels from nodes and edges."
            className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
              labelMode === 'none' 
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <EyeOff className="w-3 h-3 text-amber-400" />
            <span>NO TEXT</span>
          </button>

          <button
            onClick={() => setLabelMode('retrieved')}
            title="Query Path Only: Show text labels only for citations retrieved by GraphRAG."
            className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
              labelMode === 'retrieved' 
                ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Crosshair className="w-3 h-3 text-emerald-400" />
            <span>RETRIEVED ONLY</span>
          </button>

          <button
            onClick={() => setLabelMode('all')}
            title="Show All Text Labels"
            className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
              labelMode === 'all' 
                ? 'bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Eye className="w-3 h-3 text-blue-400" />
            <span>ALL</span>
          </button>
        </div>

        <div className="h-3.5 w-px bg-border-dark mx-0.5 hidden sm:block" />

        {/* Node Spacing Slider */}
        <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 border-r border-border-dark text-[10px] font-mono text-gray-400">
          <Maximize2 className="w-3 h-3 text-cyan-400" />
          <span>SPREAD</span>
          <input
            type="range"
            min="0.8"
            max="2.4"
            step="0.2"
            value={spacingMultiplier}
            onChange={(e) => setSpacingMultiplier(parseFloat(e.target.value))}
            className="w-12 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title="Adjust node repulsion & link length"
          />
        </div>

        {/* Zoom Controls */}
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
          onClick={handleResetZoom}
          title="Reset Camera / Fit View"
          className="p-1.5 text-gray-300 hover:text-white hover:bg-border-dark rounded transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh / Re-sync Graph"
            disabled={isLoading}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              isLoading 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'text-gray-300 hover:text-emerald-400 hover:bg-border-dark'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        )}

        <button
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Canvas Grid"
          className={`p-1.5 rounded transition-colors ${
            showGrid ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top Left: Interactive Entity & Edge Spotlight Finder / Quick Locator */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 max-w-sm">
        <div className="relative">
          <div className="flex items-center gap-1.5 bg-[#0B0D14]/90 backdrop-blur-md border border-cyan-500/40 px-2.5 py-1.5 rounded-lg shadow-xl text-xs font-mono text-gray-200 focus-within:border-cyan-400 transition-all">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Locate node or relation..."
              className="bg-transparent text-xs text-gray-100 placeholder-gray-500 focus:outline-none w-44 font-mono"
            />
            {searchQuery && (
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Locator Dropdown Results */}
          {isSearchOpen && (searchResults.matchedNodes.length > 0 || searchResults.matchedLinks.length > 0) && (
            <div className="absolute top-full mt-1.5 left-0 w-80 bg-[#0B0D14]/95 backdrop-blur-xl border border-cyan-500/30 rounded-xl shadow-2xl overflow-hidden z-30 font-mono text-xs max-h-80 overflow-y-auto divide-y divide-border-dark">
              {searchResults.matchedNodes.length > 0 && (
                <div className="p-1.5">
                  <div className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider flex items-center justify-between">
                    <span>Entities ({searchResults.matchedNodes.length})</span>
                    <span className="text-[9px] text-cyan-400">Click to jump &amp; pulse</span>
                  </div>
                  {searchResults.matchedNodes.map(n => (
                    <button
                      key={n.id}
                      onClick={() => zoomToNode(n.id)}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-cyan-500/10 rounded-lg flex items-center justify-between gap-2 group transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span 
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: TYPE_COLORS[n.type] || '#94A3B8' }}
                        />
                        <span className="text-gray-200 group-hover:text-cyan-300 font-bold truncate">
                          {n.label}
                        </span>
                      </div>
                      <span className="text-[9px] text-gray-400 border border-border-dark px-1.5 py-0.5 rounded uppercase">
                        {n.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.matchedLinks.length > 0 && (
                <div className="p-1.5">
                  <div className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider">
                    Relations ({searchResults.matchedLinks.length})
                  </div>
                  {searchResults.matchedLinks.map(l => {
                    const sLabel = typeof l.source === 'object' ? (l.source as any).label || (l.source as any).id : l.source;
                    const tLabel = typeof l.target === 'object' ? (l.target as any).label || (l.target as any).id : l.target;
                    return (
                      <button
                        key={l.id}
                        onClick={() => zoomToLink(l)}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-cyan-500/10 rounded-lg flex items-center justify-between gap-1 group transition-colors"
                      >
                        <div className="truncate text-[11px] text-gray-300 group-hover:text-cyan-300">
                          <span className="text-amber-400 font-semibold">{sLabel}</span>
                          <span className="text-cyan-400 mx-1">--[{l.relation}]--&gt;</span>
                          <span className="text-emerald-400 font-semibold">{tLabel}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Entity Type Filter Badges (Quick Filter Radar) */}
        <div className="flex items-center gap-1 flex-wrap bg-[#0B0D14]/80 backdrop-blur-md p-1 rounded-lg border border-border-dark text-[10px] font-mono">
          <button
            onClick={() => setSelectedTypeFilter('ALL')}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              selectedTypeFilter === 'ALL' ? 'bg-gray-700 text-white font-bold' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            ALL
          </button>
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <button
              key={type}
              onClick={() => setSelectedTypeFilter(prev => prev === type ? 'ALL' : (type as NodeType))}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                selectedTypeFilter === type ? 'ring-1 ring-white font-bold text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                backgroundColor: selectedTypeFilter === type ? `${color}33` : 'transparent',
                borderColor: color
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              <span>{type}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Floating Smart HUD / Spotlight Inspector for Located Entity */}
      {activeFocusNode && (
        <div className="absolute bottom-3 left-3 z-20 bg-[#0B0D14]/95 backdrop-blur-xl border border-cyan-500/40 p-3 rounded-xl shadow-2xl max-w-sm font-mono text-xs space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between gap-2 border-b border-border-dark pb-1.5">
            <div className="flex items-center gap-2 truncate">
              <span 
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: TYPE_COLORS[activeFocusNode.type] || '#94A3B8' }}
              />
              <span className="font-bold text-gray-100 truncate text-sm">
                {activeFocusNode.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span 
                className="px-1.5 py-0.5 text-[9px] font-extrabold rounded text-slate-950 uppercase shadow-sm"
                style={{ backgroundColor: TYPE_COLORS[activeFocusNode.type] || '#94A3B8' }}
              >
                {activeFocusNode.type}
              </span>
              {spotlightNodeId === activeFocusNode.id && (
                <button
                  onClick={() => setSpotlightNodeId(null)}
                  className="text-gray-400 hover:text-gray-200 p-0.5"
                  title="Clear Spotlight"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-gray-400 flex items-center justify-between">
            <span>Direct Relations: <strong className="text-cyan-400">{nodeDegrees.get(activeFocusNode.id) || 0}</strong></span>
            <span className="text-[10px] text-gray-500">ID: {activeFocusNode.id.slice(0, 12)}…</span>
          </div>

          {/* Quick-Jump neighbor pills */}
          {activeNodeNeighbors.length > 0 && (
            <div className="space-y-1 pt-1">
              <span className="text-[9px] uppercase tracking-wider text-gray-500 block">Connected Links:</span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {activeNodeNeighbors.map((nb, i) => (
                  <button
                    key={i}
                    onClick={() => zoomToNode(nb.node.id)}
                    className="flex items-center gap-1 bg-[#131826] hover:bg-cyan-500/20 border border-border-dark hover:border-cyan-500/50 px-2 py-0.5 rounded text-[10px] text-gray-300 hover:text-cyan-300 transition-colors"
                    title={`Jump to ${nb.node.label}`}
                  >
                    <span className="text-gray-500 text-[9px]">{nb.direction === 'outgoing' ? '→' : '←'} {nb.relation}</span>
                    <span className="font-bold text-gray-200">{nb.node.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Smart HUD for Hovered Edge Link */}
      {hoveredLink && !hoveredNode && (
        <div className="absolute bottom-3 left-3 z-20 bg-[#0B0D14]/95 backdrop-blur-xl border border-cyan-500/40 p-2.5 rounded-xl shadow-2xl font-mono text-xs space-y-1 animate-in fade-in duration-150">
          <span className="text-[9px] text-gray-400 block uppercase font-bold tracking-wider">Relation Edge</span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-amber-400 font-bold">
              {typeof hoveredLink.source === 'object' ? (hoveredLink.source as any).label || (hoveredLink.source as any).id : hoveredLink.source}
            </span>
            <span className="text-cyan-300 font-extrabold bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/30 text-[10px]">
              {hoveredLink.relation}
            </span>
            <ArrowRight className="w-3 h-3 text-cyan-400" />
            <span className="text-emerald-400 font-bold">
              {typeof hoveredLink.target === 'object' ? (hoveredLink.target as any).label || (hoveredLink.target as any).id : hoveredLink.target}
            </span>
          </div>
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 text-gray-500 font-mono">
          <p className="text-sm text-gray-300 font-bold">The knowledge graph is currently empty.</p>
          <p className="text-xs mt-1 text-gray-500">Upload a document or paste text above to extract entities and linkages.</p>
        </div>
      ) : null}

      <svg id="living-graph-svg" ref={svgRef} className="block w-full h-[520px] cursor-grab active:cursor-grabbing" />
    </div>
  );
};
