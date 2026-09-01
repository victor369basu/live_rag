/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Node, Link, Document } from '../../types';

export interface CommunityInfo {
  id: number;
  name: string;
  color: string;
  nodeIds: string[];
  nodeCount: number;
  edgeCount: number;
  topEntities: string[];
  summaryReport?: string;
  isExpanded?: boolean;
}

export interface ConstellationNode extends Node {
  communityId: number;
  communityColor: string;
  degree: number;
  isSatellite: boolean;
  orbitalAngle?: number;
  orbitalRadius?: number;
}

export interface ConstellationLink extends Link {
  isInterCommunity?: boolean;
}

export interface CommunityConstellationProps {
  nodes: Node[];
  links: Link[];
  documents?: Document[];
  onNodeSelect?: (node: Node) => void;
  selectedNodeId?: string | null;
}
