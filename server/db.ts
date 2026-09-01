import fs from "fs";
import path from "path";
import { Document, Node, Link, Conflict, Chunk } from "../src/types.js";

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'graph.json');

// Ensure database directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface DBStructure {
  documents: Document[];
  chunks: Chunk[];
  nodes: Node[];
  links: Link[];
  conflicts: Conflict[];
}

export const DEFAULT_DOCUMENTS: Document[] = [
  {
    id: "D1",
    name: "company-overview.txt",
    content: "Northwind Analytics was founded in 2019 by Maria Chen. The company built a product called PulseBoard, a real-time dashboard for retail analytics. Maria Chen serves as CEO and leads the Product team.",
    status: "done",
    curationLogs: ["System Seed: Initial overview document ingested and verified."],
    extractionTimeMs: 420,
    edgesCreatedCount: 3,
    entitiesCreatedCount: 4,
    avgConfidenceScore: 0.96,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: "D2",
    name: "team-structure.txt",
    content: "The Product team, led by Maria Chen, works closely with the Engineering team headed by Raj Patel. Raj Patel's team built PulseBoard using the Aurora database and deployed it on Kestrel Cloud.",
    status: "done",
    curationLogs: ["System Seed: Team structure mappings and technology stacks cataloged."],
    extractionTimeMs: 510,
    edgesCreatedCount: 5,
    entitiesCreatedCount: 5,
    avgConfidenceScore: 0.94,
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  {
    id: "D3",
    name: "release-notes.txt",
    content: "In 2023, Northwind Analytics released PulseBoard 2.0, adding a forecasting module built by engineer Sofia Alvarez. Sofia Alvarez reports to Raj Patel and previously worked on the Aurora database integration.",
    status: "done",
    curationLogs: ["System Seed: Release notes and staff feature contributions analyzed."],
    extractionTimeMs: 480,
    edgesCreatedCount: 5,
    entitiesCreatedCount: 5,
    avgConfidenceScore: 0.95,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
  }
];

export const DEFAULT_CHUNKS: Chunk[] = [
  { id: "D1-1", docId: "D1", text: "Northwind Analytics was founded in 2019 by Maria Chen." },
  { id: "D1-2", docId: "D1", text: "The company built a product called PulseBoard, a real-time dashboard for retail analytics." },
  { id: "D1-3", docId: "D1", text: "Maria Chen serves as CEO and leads the Product team." },
  { id: "D2-1", docId: "D2", text: "The Product team, led by Maria Chen, works closely with the Engineering team headed by Raj Patel." },
  { id: "D2-2", docId: "D2", text: "Raj Patel's team built PulseBoard using the Aurora database and deployed it on Kestrel Cloud." },
  { id: "D3-1", docId: "D3", text: "In 2023, Northwind Analytics released PulseBoard 2.0, adding a forecasting module built by engineer Sofia Alvarez." },
  { id: "D3-2", docId: "D3", text: "Sofia Alvarez reports to Raj Patel and previously worked on the Aurora database integration." }
];

export const DEFAULT_NODES: Node[] = [
  { id: "maria-chen", label: "Maria Chen", type: "Person", chunkIds: ["D1-1", "D1-3", "D2-1"] },
  { id: "northwind-analytics", label: "Northwind Analytics", type: "Organization", chunkIds: ["D1-1", "D3-1"] },
  { id: "pulseboard", label: "PulseBoard", type: "Product", chunkIds: ["D1-2", "D2-2"] },
  { id: "product-team", label: "Product Team", type: "Team", chunkIds: ["D1-3", "D2-1"] },
  { id: "engineering-team", label: "Engineering Team", type: "Team", chunkIds: ["D2-1", "D2-2"] },
  { id: "raj-patel", label: "Raj Patel", type: "Person", chunkIds: ["D2-1", "D2-2", "D3-2"] },
  { id: "aurora-database", label: "Aurora Database", type: "Technology", chunkIds: ["D2-2", "D3-2"] },
  { id: "kestrel-cloud", label: "Kestrel Cloud", type: "Technology", chunkIds: ["D2-2"] },
  { id: "pulseboard-2-0", label: "PulseBoard 2.0", type: "Product", chunkIds: ["D3-1"] },
  { id: "sofia-alvarez", label: "Sofia Alvarez", type: "Person", chunkIds: ["D3-1", "D3-2"] },
  { id: "forecasting-module", label: "Forecasting Module", type: "Feature", chunkIds: ["D3-1"] }
];

export const DEFAULT_LINKS: Link[] = [
  { id: "maria-chen|founded|northwind-analytics", source: "maria-chen", target: "northwind-analytics", relation: "founded", chunkIds: ["D1-1"], confidenceScore: 0.98 },
  { id: "northwind-analytics|built|pulseboard", source: "northwind-analytics", target: "pulseboard", relation: "built", chunkIds: ["D1-2"], confidenceScore: 0.96 },
  { id: "maria-chen|leads|product-team", source: "maria-chen", target: "product-team", relation: "leads", chunkIds: ["D1-3"], confidenceScore: 0.95 },
  { id: "product-team|works closely with|engineering-team", source: "product-team", target: "engineering-team", relation: "works closely with", chunkIds: ["D2-1"], confidenceScore: 0.92 },
  { id: "raj-patel|leads|engineering-team", source: "raj-patel", target: "engineering-team", relation: "leads", chunkIds: ["D2-1"], confidenceScore: 0.97 },
  { id: "engineering-team|built|pulseboard", source: "engineering-team", target: "pulseboard", relation: "built", chunkIds: ["D2-2"], confidenceScore: 0.95 },
  { id: "pulseboard|uses|aurora-database", source: "pulseboard", target: "aurora-database", relation: "uses", chunkIds: ["D2-2"], confidenceScore: 0.94 },
  { id: "pulseboard|deployed on|kestrel-cloud", source: "pulseboard", target: "kestrel-cloud", relation: "deployed on", chunkIds: ["D2-2"], confidenceScore: 0.93 },
  { id: "northwind-analytics|released|pulseboard-2-0", source: "northwind-analytics", target: "pulseboard-2-0", relation: "released", chunkIds: ["D3-1"], confidenceScore: 0.97 },
  { id: "sofia-alvarez|built|forecasting-module", source: "sofia-alvarez", target: "forecasting-module", relation: "built", chunkIds: ["D3-1"], confidenceScore: 0.96 },
  { id: "pulseboard-2-0|includes|forecasting-module", source: "pulseboard-2-0", target: "forecasting-module", relation: "includes", chunkIds: ["D3-1"], confidenceScore: 0.95 },
  { id: "sofia-alvarez|reports to|raj-patel", source: "sofia-alvarez", target: "raj-patel", relation: "reports to", chunkIds: ["D3-2"], confidenceScore: 0.96 },
  { id: "sofia-alvarez|worked on|aurora-database", source: "sofia-alvarez", target: "aurora-database", relation: "worked on", chunkIds: ["D3-2"], confidenceScore: 0.93 }
];

export function readDB(): DBStructure {
  if (fs.existsSync(DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
      console.error("Database file corrupted, reinitializing", e);
    }
  }
  const initDb: DBStructure = {
    documents: DEFAULT_DOCUMENTS,
    chunks: DEFAULT_CHUNKS,
    nodes: DEFAULT_NODES,
    links: DEFAULT_LINKS,
    conflicts: []
  };
  writeDB(initDb);
  return initDb;
}

export function writeDB(data: DBStructure) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function slugify(label: string): string {
  if (!label) return '';
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function healGraphIfOrphanedDocs(targetDb?: DBStructure): boolean {
  const db = targetDb || readDB();
  let changed = false;
  if (!db.documents) db.documents = [];
  if (!db.chunks) db.chunks = [];
  if (!db.nodes) db.nodes = [];
  if (!db.links) db.links = [];
  if (!db.conflicts) db.conflicts = [];

  // Ensure default entities exist if database is completely empty but documents exist
  if (db.documents.length > 0 && db.nodes.length === 0) {
    db.nodes = DEFAULT_NODES;
    db.links = DEFAULT_LINKS;
    changed = true;
  }
  if (changed && !targetDb) {
    writeDB(db);
  }
  return changed;
}
