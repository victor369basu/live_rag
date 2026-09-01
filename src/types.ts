/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Document {
  id: string;
  name: string;
  content: string;
  status: 'pending' | 'done' | 'error';
  curationLogs: string[];
  extractionTimeMs?: number;
  edgesCreatedCount?: number;
  entitiesCreatedCount?: number;
  avgConfidenceScore?: number;
  createdAt?: string;
}

export type NodeType =
  | 'Person'
  | 'Organization'
  | 'Team'
  | 'Product'
  | 'Technology'
  | 'Feature'
  | 'Other';

export interface Node {
  id: string;
  label: string;
  type: NodeType;
  chunkIds: string[];
  // D3 force fields
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface Link {
  id: string;
  source: string | any; // string on server, Node object at runtime in browser
  target: string | any;
  relation: string;
  chunkIds: string[];
  confidenceScore?: number; // 0.0 - 1.0 confidence score
}

export interface Conflict {
  id: string;
  docId: string;
  docName: string;
  entity: string;
  description: string;
  timestamp: string;
  resolved: boolean;
  resolution?: string;
}

export interface GraphData {
  documents: Document[];
  nodes: Node[];
  links: Link[];
  conflicts: Conflict[];
  metrics?: AgentPerformanceMetrics;
}

export interface FileCurationMetric {
  docId: string;
  docName: string;
  extractionTimeMs: number;
  edgesCount: number;
  entitiesCount: number;
  confidenceScore: number;
  status: 'pending' | 'done' | 'error';
  createdAt?: string;
}

export interface AgentPerformanceMetrics {
  avgExtractionTimeMs: number;
  totalEdgesCreated: number;
  totalEntitiesCreated: number;
  overallConfidenceScore: number;
  highConfidenceEdgeCount: number;
  mediumConfidenceEdgeCount: number;
  lowConfidenceEdgeCount: number;
  filesProcessedCount: number;
  throughputPerSecond: number;
  fileMetrics: FileCurationMetric[];
}

export interface Chunk {
  id: string;
  docId: string;
  text: string;
}

export interface RetrievalResult {
  seeds: string[];
  retrievedNodes: string[];
  retrievedEdges: string[];
  nodeReasons: Record<string, string>;
  edgeReasons: Record<string, string>;
  whyText: string;
}

export interface FactContribution {
  id: number; // 1-indexed index of retrieved facts
  level: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}
