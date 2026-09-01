/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Node, Link } from '../../types';
import { CommunityInfo, ConstellationNode, ConstellationLink } from './types';

// Vibrant celestial community color palette matching high-density network visualizers
export const COMMUNITY_PALETTE = [
  '#4F75FF', // Sapphire Blue (Community 0)
  '#F59E0B', // Amber Orange (Community 1)
  '#EF4444', // Coral Red (Community 2)
  '#10B981', // Emerald Teal (Community 3)
  '#22C55E', // Vivid Green (Community 4)
  '#EAB308', // Sunflower Gold (Community 5)
  '#A855F7', // Amethyst Purple (Community 6)
  '#EC4899', // Nebula Rose Pink (Community 7)
  '#06B6D4', // Cyber Cyan (Community 8)
  '#F97316', // Bright Tangerine (Community 9)
  '#8B5CF6', // Electric Indigo (Community 10)
  '#14B8A6', // Aqua Turquoise (Community 11)
  '#6366F1', // Royal Periwinkle (Community 12)
  '#D946EF', // Deep Magenta (Community 13)
];

/**
 * Detects communities using fast modularity label propagation
 * and builds orbital/core graph layout metadata.
 */
export function computeCommunitiesAndLayout(
  nodes: Node[],
  links: Link[]
): {
  communities: CommunityInfo[];
  constellationNodes: ConstellationNode[];
  constellationLinks: ConstellationLink[];
} {
  if (nodes.length === 0) {
    return { communities: [], constellationNodes: [], constellationLinks: [] };
  }

  // 1. Build adjacency & degree map
  const adjacency = new Map<string, Set<string>>();
  const degreeMap = new Map<string, number>();

  nodes.forEach(n => {
    adjacency.set(n.id, new Set());
    degreeMap.set(n.id, 0);
  });

  links.forEach(l => {
    const sId = typeof l.source === 'object' ? l.source.id : l.source;
    const tId = typeof l.target === 'object' ? l.target.id : l.target;

    if (adjacency.has(sId) && adjacency.has(tId)) {
      adjacency.get(sId)!.add(tId);
      adjacency.get(tId)!.add(sId);
      degreeMap.set(sId, (degreeMap.get(sId) || 0) + 1);
      degreeMap.set(tId, (degreeMap.get(tId) || 0) + 1);
    }
  });

  // 2. Fast Label Propagation for Community Detection
  const communityAssignment = new Map<string, number>();
  
  // Initial assignment: each node has unique id
  nodes.forEach((n, idx) => communityAssignment.set(n.id, idx));

  const maxIterations = 6;
  let iterations = 0;
  const nodeIds = nodes.map(n => n.id);

  // Run label propagation with randomized order
  while (iterations < maxIterations) {
    let changeCount = 0;
    iterations++;

    // In-place Fisher-Yates shuffle of node IDs
    for (let i = nodeIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = nodeIds[i];
      nodeIds[i] = nodeIds[j];
      nodeIds[j] = temp;
    }

    for (const nodeId of nodeIds) {
      const neighbors = adjacency.get(nodeId);
      if (!neighbors || neighbors.size === 0) continue;

      // Count neighbor community labels weighted by connection
      const labelCounts = new Map<number, number>();
      for (const neighborId of neighbors) {
        const neighborLabel = communityAssignment.get(neighborId);
        if (neighborLabel !== undefined) {
          labelCounts.set(neighborLabel, (labelCounts.get(neighborLabel) || 0) + 1);
        }
      }

      // Find max frequency label
      let maxCount = -1;
      let dominantLabel = communityAssignment.get(nodeId)!;

      labelCounts.forEach((count, label) => {
        if (count > maxCount) {
          maxCount = count;
          dominantLabel = label;
        }
      });

      if (dominantLabel !== communityAssignment.get(nodeId)) {
        communityAssignment.set(nodeId, dominantLabel);
        changeCount++;
      }
    }

    // Early exit if convergence reached or minimal changes
    if (changeCount === 0 || changeCount < Math.max(1, nodeIds.length * 0.02)) {
      break;
    }
  }

  // 3. Normalize community indices to 0, 1, 2, ... sorted by size descending
  const communityGroups = new Map<number, string[]>();
  communityAssignment.forEach((commId, nodeId) => {
    if (!communityGroups.has(commId)) communityGroups.set(commId, []);
    communityGroups.get(commId)!.push(nodeId);
  });

  // Sort groups by size descending
  const sortedRawGroups = Array.from(communityGroups.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  const normalizedMapping = new Map<string, number>();
  const communities: CommunityInfo[] = [];

  sortedRawGroups.forEach(([rawId, memberIds], newIdx) => {
    memberIds.forEach(id => normalizedMapping.set(id, newIdx));

    // Calculate internal edge count
    const memberSet = new Set(memberIds);
    let edgeCount = 0;
    links.forEach(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      if (memberSet.has(sId) && memberSet.has(tId)) {
        edgeCount++;
      }
    });

    // Top hub entities in community
    const topEntities = memberIds
      .map(id => ({ id, node: nodes.find(n => n.id === id), deg: degreeMap.get(id) || 0 }))
      .sort((a, b) => b.deg - a.deg)
      .slice(0, 3)
      .map(x => x.node?.label || x.id);

    const color = COMMUNITY_PALETTE[newIdx % COMMUNITY_PALETTE.length];

    communities.push({
      id: newIdx,
      name: `Community ${newIdx}`,
      color,
      nodeIds: memberIds,
      nodeCount: memberIds.length,
      edgeCount,
      topEntities
    });
  });

  // 4. Identify Satellite vs Core nodes for the Orbital Constellation
  // Nodes with degree <= 1 or in small peripheral components are distributed on the outer ring
  const satellites: string[] = [];
  const constellationNodes: ConstellationNode[] = nodes.map(n => {
    const commId = normalizedMapping.get(n.id) ?? 0;
    const deg = degreeMap.get(n.id) || 0;
    const isSatellite = deg <= 1;

    if (isSatellite) satellites.push(n.id);

    return {
      ...n,
      communityId: commId,
      communityColor: COMMUNITY_PALETTE[commId % COMMUNITY_PALETTE.length],
      degree: deg,
      isSatellite
    };
  });

  // Assign smooth orbital angles to satellites
  const totalSatellites = satellites.length;
  satellites.forEach((satId, idx) => {
    const node = constellationNodes.find(n => n.id === satId);
    if (node) {
      // Golden ratio angle or even distribution with slight jitter
      node.orbitalAngle = (idx / totalSatellites) * Math.PI * 2;
      // Dual concentric ring layer for depth
      const ringOffset = (idx % 2) * 22;
      node.orbitalRadius = 280 + ringOffset;
    }
  });

  // 5. Constellation Links with inter-community flag
  const constellationLinks: ConstellationLink[] = links.map(l => {
    const sId = typeof l.source === 'object' ? l.source.id : l.source;
    const tId = typeof l.target === 'object' ? l.target.id : l.target;
    const sComm = normalizedMapping.get(sId);
    const tComm = normalizedMapping.get(tId);

    return {
      ...l,
      isInterCommunity: sComm !== undefined && tComm !== undefined && sComm !== tComm
    };
  });

  return {
    communities,
    constellationNodes,
    constellationLinks
  };
}
