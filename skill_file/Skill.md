---
name: living-graph-rag
description: Autonomous GraphRAG Knowledge Base Curation, Multi-Hop Graph Traversal, Factual Contribution Auditing, and Human-in-the-Loop Conflict Resolution Agent.
---

# Living GraphRAG Autonomous Curation & Reasoning Skill Specification

> **A Universal, Domain-Agnostic Blueprint for Autonomous Knowledge-Graph Retrieval-Augmented Generation (GraphRAG), Dynamic Entity Resolution, Multi-Hop Reasoning, and Fact Attribution Auditing.**

---

## 1. Executive Overview & Domain-Agnostic Philosophy

Traditional Vector RAG systems suffer from three critical architectural flaws:
1. **Chunk-Boundary Blindness**: Inability to synthesize facts split across distinct document paragraphs or files.
2. **Ungrounded Hallucinations**: Language models generating unsupported claims with ambiguous provenance.
3. **Static Staleness & Silent Contradictions**: Inability to detect when newer documents directly contradict older records.

**The Living GraphRAG** architecture replaces opaque vector spaces with a **self-optimizing, auditable knowledge graph**. Every asserted claim is connected to source text chunks (`chunkIds`), every relationship is scored for factual confidence, and every generated response undergoes automated fact-attribution auditing.

### Universal Domain Adaptation
This blueprint is designed to operate across any knowledge domain by adapting entity ontologies and relationship verbs:
- **Enterprise IT / DevOps**: Entities (`Service`, `Database`, `Cluster`, `Team`, `Engineer`) | Relations (`deploys`, `depends on`, `owns`, `maintains`).
- **Biomedical / Healthcare**: Entities (`Disease`, `Drug`, `Gene`, `Protein`, `Trial`) | Relations (`inhibits`, `treats`, `expresses`, `contraindicated with`).
- **Legal & Compliance**: Entities (`Statute`, `Clause`, `Case`, `Jurisdiction`, `Entity`) | Relations (`supersedes`, `violates`, `governs`, `amends`).
- **Financial Intelligence**: Entities (`Company`, `Executive`, `Asset`, `Risk`, `Metric`) | Relations (`acquired`, `reported`, `audited by`, `invested in`).

---

## 2. Directory Structure & Architecture Breakdown

```
├── /data
│   └── database.json           # Atomic JSON disk storage for documents, chunks, nodes, links, conflicts
├── /server
│   ├── db.ts                   # Persistence layer, disk I/O, slugification, schema defaults & graph healing
│   ├── parsers.ts              # RFC 4180 CSV parser, PDF text extractor, Markdown normalizers & Tokenizer
│   ├── gemini.ts               # Google GenAI SDK, exponential retry logic, extractive answer synthesizers
│   ├── extraction.ts           # Autonomous curation tools, entity resolution, local heuristic extractors
│   ├── rag.ts                  # TF-IDF indexer, query vectorizer, cosine similarity & 1-hop graph walk
│   ├── telemetry.ts            # Agent performance metrics, throughput, confidence distributions
│   └── routes.ts               # Consolidated Express API Router mounting all endpoints
├── /server.ts                  # Main Node.js/Express server entry point + Vite development middleware
├── /src
│   ├── main.tsx                # React 18 DOM mount entry point
│   ├── App.tsx                 # Main UI workbench shell, navigation tabs & global state orchestration
│   ├── types.ts                # Universal TypeScript interfaces (Node, Link, Chunk, Document, Conflict)
│   └── components/
│       ├── GraphCanvas.tsx         # D3.js force-directed graph canvas (physics, zoom/pan, glowing seeds)
│       ├── DocumentIngestion.tsx   # Multi-modal file dropzone, format parser & live curation log terminal
│       ├── QueryWorkbench.tsx      # RAG query interface, multi-hop path visualizer & grounded LLM responses
│       ├── ConflictManager.tsx     # Contradiction queue, Stability Index gauge & automated scanner
│       ├── AgentTelemetry.tsx      # Throughput metrics, confidence score charts & extraction timers
│       ├── KnowledgeMatrix.tsx     # Searchable entity table browser with degree counts & deletion
│       └── FactAuditor.tsx         # Attribution matrix with 4-tier color badges & audit justifications
├── package.json                # Project dependencies, scripts (dev, build, start, lint)
├── tsconfig.json               # TypeScript compiler configuration
├── vite.config.ts              # Vite bundle and dev server configuration
├── Skill.md                    # This complete operational blueprint
└── Readme.md                   # User-facing summary, quickstart & API catalog
```

### Module Responsibility Breakdown
1. **`server/db.ts`**: Handles atomic reads and writes to `/data/database.json`. Provides slugification routines (`slugify("Maria Chen") -> "maria-chen"`) and auto-heals corrupted or empty graph states from default seed documents.
2. **`server/parsers.ts`**: Pure deterministic parsers. Implements RFC 4180 CSV parsing with quote escaping, multi-row detection, PDF stream extraction via `pdf-parse`, tabular-to-markdown formatters, and text tokenization with universal stopword pruning.
3. **`server/gemini.ts`**: Manages communication with the `@google/genai` SDK using `gemini-3.7-flash`. Contains exponential backoff retry mechanisms, API key header/env resolvers, and offline deterministic synthesis fallbacks.
4. **`server/extraction.ts`**: Houses the 6 Autonomous Curation Tools (`search_graph_entities`, `create_relationship`, `merge_entities`, etc.), single-pass AI extractor prompt runners, and fallback local regex extractors.
5. **`server/rag.ts`**: Implements the retrieval pipeline. Builds corpus-wide TF-IDF matrices, computes query cosine similarity, detects anchor seed nodes, and traverses 1-hop weighted relationship paths.
6. **`server/telemetry.ts`**: Calculates real-time system performance statistics: average extraction latency (ms), throughput (entities+edges / sec), confidence score distributions, and per-file audit breakdowns.
7. **`server/routes.ts`**: Exposes the clean REST API for ingestion, querying, conflict resolution, entity deletion, and metric reporting.

---

## 3. End-to-End Visual Flow Diagrams

### 3.1 Autonomous Multi-Modal Ingestion Flow
```
User Ingests File (CSV, TSV, PDF, TXT, MD)
                     │
                     ▼
  ┌─────────────────────────────────────┐
  │ Format Detection & Normalization    │
  │ • CSV/TSV: RFC 4180 Tabular Parser  │
  │ • PDF: In-Memory Stream Extractor   │
  │ • MD/TXT: Markdown Cleaner          │
  └──────────────────┬──────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────┐
  │ Semantic Chunking                   │
  │ • 3-Sentence Sliding Windows        │
  │ • Assign Unique Chunk IDs (D1-1...) │
  └──────────────────┬──────────────────┘
                     │
                     ▼
             Gemini API Key?
             /             \
       [Yes] /               \ [No / Offline / Quota]
           ▼                   ▼
  ┌──────────────────┐  ┌───────────────────────────────┐
  │ Single-Pass AI   │  │ Deterministic Heuristic       │
  │ Extraction       │  │ Extractor                     │
  │ (JSON Triples)   │  │ (Regex, Title-Case, Keywords) │
  └────────┬─────────┘  └───────────────┬───────────────┘
           │                            │
           └──────────────┬─────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────────┐
  │ Autonomous Curation Agent Optimization              │
  │ 1. search_graph_entities (Fuzzy Match & Deduplicate)│
  │ 2. merge_entities (Canonical Node & Remap Edges)    │
  │ 3. check_existing_relationships (Duplicate Avoidance│
  │ 4. flag_conflict (Isolate Contradictions)           │
  │ 5. create_relationship (Score Confidence & Chunk ID)│
  └───────────────────────┬─────────────────────────────┘
                          │
                          ▼
             Persistent Database Commit
             (/data/database.json)
                          │
                          ▼
             Live D3 Graph Force Simulation Update
```

---

### 3.2 GraphRAG Traversal, Grounded Generation & Fact-Auditing Flow
```
User Query (e.g. "Who leads the AI team and what model is used?")
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 1. Vectorize Query & Compute TF-IDF          │
  │ • Cosine similarity against document chunks  │
  │ • Label keyword overlap bonus (+0.4)         │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 2. Anchor Seed Node Discovery                │
  │ • Select Top K=3 nodes (Score > 0.05)        │
  │ • Generate Seed Retrieval Justifications     │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 3. 1-Hop Graph Walk Traversal                │
  │ • Weighting: Seed-to-Seed = 4x               │
  │ • Weighting: Active Keyword in Predicate = 3x│
  │ • Weighting: Adjacent First-Order Link = 1x  │
  │ • Cognitive Pruning (Max 9 nodes, 10 edges)  │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 4. Grounded Synthesis Prompt (Gemini 3.7)    │
  │ • Supply retrieved numbered facts:           │
  │   [1] Maria Chen — leads — Core AI Team      │
  │   [2] Core AI Team — deployed — Engine       │
  │   [3] Engine — uses — Gemini 3.7 Flash       │
  │ • Constraint: Answer ONLY from facts         │
  │ • Mandatory inline citations [1], [2][3]     │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 5. Factual Contribution Auditor              │
  │ • Rate each fact: High / Medium / Low / None │
  │ • Produce verifiable audit justifications    │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ UI Presentation                              │
  │ • Visual Graph: Highlight Subgraph & Seeds   │
  │ • Response Card with Clickable Citations     │
  │ • Fact Attribution Badge Matrix              │
  └──────────────────────────────────────────────┘
```

---

### 3.3 Automated Graph Integrity & Conflict Arbitration Flow
```
Automated Integrity Scan Triggered
(or on Ingestion of Contradictory Document)
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 1. Structural Single-Parent / Leadership Invariant
  │ • Check predicates: reports to, led by, etc. │
  │ • If Outgoing Edges > 1 to distinct targets  │
  │   ==> Trigger Conflict Flag                  │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 2. Cross-Document Version Divergence Check   │
  │ • Check version tags (v1 vs v2, roadmap)     │
  │ • Detect property divergence on same entity  │
  │   ==> Trigger Conflict Flag                  │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 3. Dispute Isolation                         │
  │ • Store in conflicts table (resolved: false) │
  │ • Update Graph Stability Index %             │
  │ • Prevent corrupt edges from polluting graph │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────┐
  │ 4. Human-in-the-Loop Arbitration             │
  │ • Administrator reviews dispute queue        │
  │ • Selects canonical truth or annotates fix   │
  │ • Conflict resolved -> Graph Stability rises │
  └──────────────────────────────────────────────┘
```

---

## 4. Complete Data Schemas & TypeScript Definitions

```typescript
// Shared Types across Server & Client

export type NodeType =
  | 'Person'
  | 'Organization'
  | 'Team'
  | 'Product'
  | 'Technology'
  | 'Feature'
  | 'Other';

export interface Node {
  id: string;              // Canonical slugified identifier (e.g., 'maria-chen')
  label: string;           // Display name (e.g., 'Maria Chen')
  type: NodeType;          // Categorical entity ontology
  chunkIds: string[];      // Traceable provenance back to source text chunks
  x?: number;              // D3 force simulation coordinates
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface Link {
  id: string;              // Composite key: `${sourceId}|${relation}|${targetId}`
  source: string | Node;   // Source entity identifier or D3 Node reference
  target: string | Node;   // Target entity identifier or D3 Node reference
  relation: string;        // Directed factual predicate (e.g., 'leads', 'built')
  chunkIds: string[];      // Source text chunk identifiers supporting this edge
  confidenceScore?: number;// Factual certainty score (0.00 to 1.00)
}

export interface Chunk {
  id: string;              // Unique chunk identifier: `${docId}-${chunkIndex}`
  docId: string;           // Parent document identifier
  text: string;            // Extracted text content of the chunk
}

export interface Document {
  id: string;              // Unique document identifier (e.g., 'D1', 'doc-123')
  name: string;            // File or record title
  content: string;         // Cleaned Markdown / plain-text representation
  status: 'pending' | 'processing' | 'done' | 'error';
  curationLogs: string[];  // Step-by-step audit logs generated during ingestion
  createdAt: string;       // ISO 8601 timestamp
  extractionTimeMs?: number;
  entitiesCreatedCount?: number;
  edgesCreatedCount?: number;
  avgConfidenceScore?: number;
}

export interface Conflict {
  id: string;              // Unique conflict identifier (e.g., 'C-1725000000')
  docId: string;           // Document triggering the contradiction
  docName: string;         // Document title
  entity: string;          // Entity experiencing the contradiction
  description: string;     // Explanation of the logical dispute
  timestamp: string;       // ISO 8601 timestamp
  resolved: boolean;       // Arbitration status
  resolution?: string;     // Notes from administrator arbitration
}

export interface FactContribution {
  id: number;              // Numeric 1-indexed reference matching citation [id]
  level: 'high' | 'medium' | 'low' | 'none'; // Attribution tier
  reason: string;          // One-sentence factual justification
}

export interface GraphQueryResult {
  seeds: string[];                     // Node IDs identified as direct entry anchors
  retrievedNodes: string[];            // Node IDs in the sub-graph
  retrievedEdges: string[];            // Link IDs traversed
  nodeReasons: Record<string, string>; // Explanations for why each node was selected
  edgeReasons: Record<string, string>; // Explanations for why each edge was traversed
  whyText: string;                     // Executive summary of retrieval traversal
}

export interface FileCurationMetric {
  docId: string;
  docName: string;
  extractionTimeMs: number;
  edgesCount: number;
  entitiesCount: number;
  confidenceScore: number;
  status: string;
  createdAt: string;
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

export interface DBStructure {
  documents: Document[];
  chunks: Chunk[];
  nodes: Node[];
  links: Link[];
  conflicts: Conflict[];
}
```

---

## 5. Mathematical Formulations & Core Algorithms

### 5.1 Identifier Normalization & Slugification
To prevent duplicate nodes caused by case differences, punctuation, or whitespace:
```typescript
Slug(s) = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
```
$$\text{Slug}(s) = s.\text{toLowerCase}().\text{replace}(/[\hat{}\text{a-z0-9}]+/g, \text{'-'}).\text{replace}(/\hat{}-|-\$/g, \text{''})$$

### 5.2 Term Frequency-Inverse Document Frequency (TF-IDF) & Vector Space
Given a corpus of chunks $C = \{c_1, c_2, \dots, c_N\}$:
1. **Document Frequency** $\text{DF}(t)$: Count of chunks containing token $t$.
2. **Inverse Document Frequency** $\text{IDF}(t)$:
   $$\text{IDF}(t) = \ln\left(\frac{N + 1}{\text{DF}(t) + 1}\right) + 1$$
3. **Chunk Vector Weight**:
   $$w(t, c) = \text{TF}(t, c) \times \text{IDF}(t)$$
4. **Unit Normalization**:
   $$\vec{V}(c) = \frac{\vec{w}(c)}{\|\vec{w}(c)\|_2} = \frac{\vec{w}(c)}{\sqrt{\sum_{t} w(t, c)^2}}$$
5. **Cosine Similarity**:
   $$\text{CosineSim}(\vec{V}(q), \vec{V}(c)) = \sum_{t \in q \cap c} V_q(t) \times V_c(t)$$

### 5.3 Query Anchor Seed Selection & 1-Hop Graph Walk Traversal
For a user query $q$:
1. Vectorize query $q \to \vec{V}(q)$.
2. Calculate node relevance score:
   $$\text{Score}(n) = \max_{c \in n.\text{chunkIds}} \left( \text{CosineSim}(\vec{V}(q), \vec{V}(c)) \right) + 0.4 \times \mathbb{I}(\text{Tokens}(n.\text{label}) \cap \text{Tokens}(q) \neq \emptyset)$$
3. **Anchor Seeds**: Select top $K=3$ nodes where $\text{Score}(n) > 0.05$.
4. **Edge Traversal Weighting**:
   $$W(e) = \begin{cases} 4 & \text{if } e.\text{source} \in \text{Seeds} \land e.\text{target} \in \text{Seeds} \\ 3 & \text{if } \text{Tokens}(e.\text{relation}) \cap \text{Tokens}(q) \neq \emptyset \\ 1 & \text{otherwise} \end{cases}$$
5. **Cognitive Subgraph Pruning**: Retain top edges by weight up to a maximum limit of **9 nodes** and **10 edges** to maintain high prompt relevance and visual clarity.

### 5.4 Agent Performance & Stability Metrics
- **Extraction Throughput**:
  $$T = \frac{\text{Total Entities} + \text{Total Edges}}{\sum \text{Extraction Time (seconds)}}$$
- **Graph Stability Index**:
  $$\text{Stability} = \left( 1 - \frac{\text{Unresolved Conflicts}}{\max(1, \text{Total Nodes} + \text{Total Edges})} \right) \times 100\%$$

---

## 6. Ingestion & Document Processing Engine

### 6.1 RFC 4180 CSV / TSV Parsing & Semantic Chunking
1. **Delimiter Sniffing**: Detect `,`, `\t`, or `;` by sampling the first 5 rows.
2. **Quoted Multi-line Support**: Correctly parse escaped double quotes (`""`) and multiline fields.
3. **Triple Extraction Mode**: If headers match `[source|subject]`, `[relation|predicate]`, `[target|object]`, directly instantiate knowledge graph triples.
4. **Tabular Record Mode**: If structured as a record table (e.g., `Name, Department, Role, TechStack`):
   - Designate primary column (e.g., `Name`) as central node.
   - Generate categorical attribute nodes for connected columns.
   - Establish typed links (e.g., `belongs to department`, `skilled in`).
5. **Markdown Table Conversion**: Convert raw CSV rows into GitHub-flavored Markdown for chunk storage.

### 6.2 PDF In-Memory Extraction & Markdown Normalization
1. Parse binary stream using `pdf-parse`.
2. Clean artifact line breaks and reconstruct paragraphs.
3. Convert plain text into Markdown sections with headers (`#`, `##`, `###`) and bold entity terms (`**Entity**`).
4. **Zero-Base64 Storage Policy**: Discard binary buffer immediately; store only clean Markdown to keep database lightweight.

### 6.3 Semantic Sliding-Window Chunking
- Split cleaned text by sentence boundary regex: `/[^.!?\n]+[.!?\n]*/g`.
- Filter out empty fragments (<4 characters).
- Group sentences into windows of **3 sentences** with consecutive chunk IDs (`${docId}-1`, `${docId}-2`).

### 6.4 Deterministic Local Entity & Relation Extractor (Zero-API Key Fallback)
1. **Entity Extraction**:
   - Extract Markdown bold terms: `/\*\*([^*]+)\*\*/g`.
   - Extract Title-Cased multi-word tokens: `/\b[A-Z][a-zA-Z0-9_\-']+(?:\s+[A-Z][a-zA-Z0-9_\-']+)*\b/g`.
   - Filter against universal English stopwords (`The`, `This`, `With`, `From`, `Have`, etc.).
2. **Ontology Classification**:
   - `Team`: matches `team`, `group`, `department`, `division`.
   - `Technology`: matches `database`, `cloud`, `model`, `api`, `pipeline`, `python`, `kafka`, `aws`, `gcp`, `docker`.
   - `Organization`: matches `inc`, `corp`, `analytics`, `company`, `ltd`, `ministry`, `university`.
   - `Feature`: matches `forecast`, `alert`, `detector`, `dashboard`, `rag`, `module`.
   - `Person`: matches `^[A-Z][a-z]+ [A-Z][a-z]+$`.
   - Default: `Other`.
3. **Relation Chaining**:
   - Link Primary Document Node to every extracted entity (`contains concept`).
   - Chain sequential entities within the same chunk (`associated with`).

---

## 7. Autonomous Curation Agent Tool Specifications

The Curation Agent maintains the graph dynamically using 6 core tools:

```json
[
  {
    "name": "search_graph_entities",
    "description": "Fuzzy search the graph database for existing entities matching the keyword or phrase to prevent duplicates.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "query": { "type": "STRING", "description": "Name or synonym to search for." }
      },
      "required": ["query"]
    }
  },
  {
    "name": "check_existing_relationships",
    "description": "Get all connections involving a specific entity to prevent duplicates and detect factual contradictions.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "entityId": { "type": "STRING", "description": "The slugified ID of the entity to analyze." }
      },
      "required": ["entityId"]
    }
  },
  {
    "name": "create_or_update_entity",
    "description": "Create a new entity node, or link an existing entity node to a text chunk.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "label": { "type": "STRING", "description": "The clear, readable name of the entity." },
        "type": { "type": "STRING", "description": "Person | Organization | Team | Product | Technology | Feature | Other" },
        "chunkId": { "type": "STRING", "description": "The text chunk ID this entity belongs to." }
      },
      "required": ["label", "type", "chunkId"]
    }
  },
  {
    "name": "create_relationship",
    "description": "Create a directed relationship triple (source -> relation -> target) between two entities.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "sourceId": { "type": "STRING", "description": "Slugified ID of the subject entity." },
        "relation": { "type": "STRING", "description": "Factual relation label (e.g. 'leads', 'built', 'uses')." },
        "targetId": { "type": "STRING", "description": "Slugified ID of the object entity." },
        "chunkId": { "type": "STRING", "description": "The text chunk ID where this fact was stated." },
        "confidenceScore": { "type": "NUMBER", "description": "Confidence score between 0.0 and 1.0." }
      },
      "required": ["sourceId", "relation", "targetId", "chunkId"]
    }
  },
  {
    "name": "merge_entities",
    "description": "Deduplicate and merge a secondary duplicate entity (sourceId) into a primary entity (targetId).",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "sourceId": { "type": "STRING", "description": "The duplicate entity ID to eliminate." },
        "targetId": { "type": "STRING", "description": "The primary entity ID to merge into." }
      },
      "required": ["sourceId", "targetId"]
    }
  },
  {
    "name": "flag_conflict",
    "description": "Flag a factual conflict or contradiction between new data and the existing graph database for human review.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "entityId": { "type": "STRING", "description": "The slugified entity ID experiencing the contradiction." },
        "description": { "type": "STRING", "description": "Full explanation of the contradiction." }
      },
      "required": ["entityId", "description"]
    }
  }
]
```

### Tool Execution & Edge Remapping Rules
- **Entity Update**: If an entity already exists, append the new `chunkId` to its `chunkIds` array without creating a duplicate node. Upgrade type if current type is `Other`.
- **Relationship Deduplication**: If a link with key `${sId}|${rel}|${tId}` already exists, merge `chunkIds` and update `confidenceScore = max(oldScore, newScore)`.
- **Entity Merging**: When `merge_entities(sourceId, targetId)` is called:
  1. Transfer all `chunkIds` from `sourceId` to `targetId`.
  2. For all edges where `source == sourceId`, update `source = targetId`.
  3. For all edges where `target == sourceId`, update `target = targetId`.
  4. Regenerate edge composite keys (`${source}|${relation}|${target}`).
  5. Delete `sourceId` from the node registry.

---

## 8. Prompt Engineering & Fact-Auditing Pipeline

### 8.1 Ingestion Extraction Prompt (JSON Structured Mode)
```
You are an expert Knowledge Graph Extraction Agent.
Extract all key entities and directed factual relationships from the following text chunks.

Return JSON format ONLY:
{
  "entities": [
    { "label": "Entity Name", "type": "Person|Organization|Team|Product|Technology|Feature|Other", "chunkId": "chunkId" }
  ],
  "relationships": [
    { "source": "Entity Name 1", "relation": "active verb phrase", "target": "Entity Name 2", "chunkId": "chunkId" }
  ]
}

Text Chunks:
${chunkDetails}
```

### 8.2 Grounded Answer Generation Prompt
```
QUESTION: ${query}

RETRIEVED KNOWLEDGE GRAPH RELATIONSHIPS:
[1] Maria Chen — leads — Core AI Team
[2] Core AI Team — deployed — Living Graph Engine
[3] Living Graph Engine — uses — Gemini 3.7 Flash

INSTRUCTIONS:
Write a factual, concise response (2-4 sentences) answering the question using ONLY the provided numbered facts.
Do not make up facts or use outside knowledge.
You MUST cite which facts supported your claims by appending bracketed numbers (e.g., [1] or [2][3]) immediately after the sentences that use them.
If the facts don't provide a complete answer, state that openly.
```

### 8.3 Fact Attribution Auditor Prompt
```
You are a factual audit agent verifying a generated response against the primary facts retrieved to construct it.
For each fact provided below, rate its absolute load-bearing contribution level to the generated answer as exactly one of: high, medium, low, none. Also provide a precise, one-sentence justification.

RETRIEVED FACTS:
${retrievedFacts.map((f, i) => `[ID: ${i + 1}] ${f}`).join('\n')}

GENERATED ANSWER:
${answer}

Response format MUST be raw JSON:
[
  { "id": 1, "level": "high", "reason": "Directly established the team leadership referenced in sentence 1." },
  { "id": 2, "level": "medium", "reason": "Provided contextual bridge connecting the team to the production deployment." }
]
```

### 8.4 Offline / Rate-Limit Deterministic Fallback Synthesis
When the AI API is unavailable:
1. **Extractive Synthesis**: Parse retrieved facts into subject-predicate groups. Synthesize coherent sentences:
   > *"According to the verified graph, [Subject] [Relation] [Target] [CitationID]."*
2. **Heuristic Ranking**:
   - `high`: Citation tag `[ID]` is directly present in the answer text, or token overlap $\ge 3$.
   - `medium`: Token overlap between fact and answer $\ge 1$.
   - `low`: Default context fact.

---

## 9. Complete REST API Specifications

| Method | Route | Request Payload | Response Object | Error Handling |
|---|---|---|---|---|
| `GET` | `/api/graph` | None | `{ documents, nodes, links, conflicts, metrics }` | 500 on disk failure |
| `POST` | `/api/documents` | `{ name: string, content: string }` | `{ status: "success", document: Document }` | 400 if content empty |
| `DELETE` | `/api/documents/:id` | None | `{ status: "success", remainingNodes, remainingLinks }` | 404 if doc not found |
| `DELETE` | `/api/nodes/:id` | None | `{ status: "success", message }` | 404 if node not found |
| `POST` | `/api/query` | `{ query: string }` | `GraphQueryResult` | 400 if query empty |
| `POST` | `/api/generate` | `{ query: string, retrievedFacts: string[] }` | `{ answer: string }` | Fallback to extractive |
| `POST` | `/api/rank` | `{ answer: string, retrievedFacts: string[] }` | `{ ratings: FactContribution[] }` | Fallback to heuristic |
| `POST` | `/api/conflicts/scan` | None | `{ status: "success", newConflictsCount, conflicts }` | 200 with report |
| `POST` | `/api/conflicts` | `{ entity: string, description: string }` | `{ status: "success", conflict }` | 400 if fields missing |
| `POST` | `/api/conflicts/:id/resolve` | `{ resolution: string }` | `{ status: "success", conflict }` | 404 if not found |
| `GET` | `/api/curation/metrics` | None | `AgentPerformanceMetrics` | 200 with metrics |
| `POST` | `/api/graph/reset` | None | `{ status: "success" }` | Resets to demo seeds |
| `POST` | `/api/graph/reindex` | None | `{ status: "success", nodes, links, metrics }` | Rebuilds from all docs |

---

## 10. Frontend Architecture & D3.js Force Visualization

### 10.1 D3 Force-Directed Canvas Parameters
- **Simulation Forces**:
  ```typescript
  d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d: any) => d.id).distance(90))
    .force("charge", d3.forceManyBody().strength(-280))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(36));
  ```
- **SVG Marker Arrows**: Defined in `<defs>` for directed link rendering with end-point offsets matching node radii.
- **Node Highlighting**: Query seeds rendered with double-ring glowing borders (`#3b82f6` / `#60a5fa`). Sub-graph nodes highlighted; non-retrieved nodes dimmed to 20% opacity.
- **Zoom & Pan**: `d3.zoom().scaleExtent([0.2, 4.0]).on("zoom", handleZoom)`.

### 10.2 UI Component Architecture & Tab Views
1. **Interactive Force Canvas (`GraphCanvas.tsx`)**:
   - Fullscreen SVG physics simulation, entity hover tooltips, drag controls, type filter chips, and zoom reset.
2. **Multi-Modal Document Ingestion (`DocumentIngestion.tsx`)**:
   - Drag-and-drop file upload zone (CSV, TSV, PDF, TXT, MD), live agent streaming activity terminal, document deletion, and re-indexing trigger.
3. **GraphRAG Query Workbench (`QueryWorkbench.tsx`)**:
   - Query input with preset example prompts, interactive traversal path visualizer, grounded response card with clickable citation badges, and prompt inspection modal.
4. **Factual Contribution Auditor (`FactAuditor.tsx`)**:
   - Fact contribution matrix with color badges (`high` = Emerald, `medium` = Amber, `low` = Blue, `none` = Slate) and detailed attribution reasoning.
5. **Conflict Manager & Integrity Scanner (`ConflictManager.tsx`)**:
   - Stability Index circular gauge, automated contradiction scanner button, manual conflict creation form, and dispute resolution cards.
6. **Knowledge Matrix & Entity Table (`KnowledgeMatrix.tsx`)**:
   - Filterable data table of all nodes, connected degree counters, chunk citation counts, and entity deletion controls.
7. **Telemetry & Health Dashboard (`AgentTelemetry.tsx`)**:
   - Throughput KPIs, confidence score distribution bar charts, per-file extraction latency breakdowns, and node/edge count ratios.

---

## 11. Verification & Step-by-Step Rebuild Checklist

When reconstructing this system in any new environment or domain:

1. **Initialize Directory & Types**: Create the `/server` and `/src` layout and declare universal TypeScript interfaces (Section 4).
2. **Build Parser & Chunking Layer**: Implement CSV delimiter sniffing, PDF-to-Markdown normalization, and 3-sentence sliding window chunking.
3. **Implement Storage & DB Layer**: Ensure atomic JSON disk writes, slugification rules, and auto-healing routines.
4. **Implement GraphRAG Math**: Code TF-IDF vectorization, Cosine Similarity, and 1-Hop Graph Walk Traversal with seed amplification.
5. **Set Up AI Routes & Fallbacks**: Implement Gemini 3.7 Flash generation with mandatory `[1][2]` citations, backed by deterministic extractive fallbacks.
6. **Mount D3 Force Canvas**: Configure zoom, drag physics, arrow markers, and sub-graph highlighting states.
7. **Verify End-to-End Flow**:
   - Ingest a multi-row CSV $\to$ verify entities and links appear on D3 canvas.
   - Run a Query $\to$ verify anchor seeds highlight and citations `[1]` match retrieved facts.
   - Trigger Conflict Scan $\to$ verify contradictory edges are caught in the dispute queue.
   - Verify all tests pass with `npm run build` and `npm run lint`.
