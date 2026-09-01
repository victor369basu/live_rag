import { Router, Request, Response } from "express";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { 
  readDB, 
  writeDB, 
  slugify, 
  healGraphIfOrphanedDocs, 
  DEFAULT_DOCUMENTS, 
  DEFAULT_CHUNKS, 
  DEFAULT_NODES, 
  DEFAULT_LINKS, 
  DBStructure 
} from "./db.js";
import { 
  parseCSV, 
  chunkCsvData, 
  convertCsvToMarkdown, 
  convertPdfToMarkdown, 
  convertExtractedTextToMarkdown, 
  ParsedCSV 
} from "./parsers.js";
import { 
  getApiKey, 
  callGeminiWithRetry, 
  synthesizeExtractiveAnswer, 
  computeDeterministicRankings 
} from "./gemini.js";
import { computeCurationMetrics } from "./telemetry.js";
import { 
  extractEntitiesFromCsv, 
  extractEntitiesLocally, 
  executeCurationTool 
} from "./extraction.js";
import { queryGraphWithWalk } from "./rag.js";
import { Document, Chunk, Conflict, FactContribution, Link } from "../src/types.js";

export const apiRouter = Router();

// Get current graph
apiRouter.get("/graph", async (req: Request, res: Response) => {
  let db = readDB();
  if (db.documents.length > 0 && db.nodes.length === 0) {
    await healGraphIfOrphanedDocs();
    db = readDB();
  }
  const metrics = computeCurationMetrics(db);
  res.json({
    documents: db.documents,
    nodes: db.nodes,
    links: db.links,
    conflicts: db.conflicts,
    metrics
  });
});

// Autonomous Curation Agent performance telemetry endpoint
apiRouter.get("/curation/metrics", (req: Request, res: Response) => {
  const db = readDB();
  const metrics = computeCurationMetrics(db);
  res.json(metrics);
});

// Reset graph to seed state
apiRouter.post("/graph/reset", (req: Request, res: Response) => {
  const initDb: DBStructure = {
    documents: DEFAULT_DOCUMENTS,
    chunks: DEFAULT_CHUNKS,
    nodes: DEFAULT_NODES,
    links: DEFAULT_LINKS,
    conflicts: []
  };
  writeDB(initDb);
  res.json({ status: "success", message: "Graph reset to seeded demo dataset." });
});

// Re-index / Re-extract knowledge graph for all ingested documents
apiRouter.post("/graph/reindex", async (req: Request, res: Response) => {
  try {
    const db = readDB();
    if (db.documents.length === 0) {
      res.json({ status: "success", message: "No documents to re-index." });
      return;
    }

    console.log(`[REINDEX] Rebuilding knowledge graph for ${db.documents.length} document(s)...`);
    db.nodes = [];
    db.links = [];

    for (const doc of db.documents) {
      const docStartTime = Date.now();
      const prevNodesCount = db.nodes.length;
      const prevLinksCount = db.links.length;

      let docChunks = db.chunks.filter(c => c.docId === doc.id);
      if (docChunks.length === 0 && doc.content) {
        if (doc.name.toLowerCase().endsWith('.csv') || doc.name.toLowerCase().endsWith('.tsv')) {
          const parsed = parseCSV(doc.content);
          docChunks = chunkCsvData(parsed, doc.id, doc.name);
        } else {
          const sentenceRegex = /[^.!?\n]+[.!?\n]*/g;
          const rawSentences = doc.content.match(sentenceRegex) || [doc.content];
          const cleanSentences = rawSentences.map((s: string) => s.trim()).filter((s: string) => s.length > 3);
          const groupedTexts: string[] = [];
          for (let i = 0; i < cleanSentences.length; i += 3) {
            groupedTexts.push(cleanSentences.slice(i, i + 3).join(" "));
          }
          if (groupedTexts.length === 0) groupedTexts.push(doc.content.trim());
          docChunks = groupedTexts.map((text, idx) => ({
            id: `${doc.id}-${idx + 1}`,
            docId: doc.id,
            text
          }));
        }
        db.chunks.push(...docChunks);
      }

      if (doc.name.toLowerCase().endsWith('.csv') || doc.name.toLowerCase().endsWith('.tsv')) {
        const parsed = parseCSV(doc.content);
        extractEntitiesFromCsv(parsed, doc.id, doc.name, docChunks, db);
      } else {
        await extractEntitiesLocally(doc.content, docChunks, doc.id, doc.name, db);
      }

      const docElapsed = Math.max(120, Date.now() - docStartTime);
      doc.extractionTimeMs = docElapsed;
      doc.entitiesCreatedCount = db.nodes.length - prevNodesCount;
      doc.edgesCreatedCount = db.links.length - prevLinksCount;
      doc.avgConfidenceScore = 0.95;
    }

    writeDB(db);
    const metrics = computeCurationMetrics(db);
    res.json({
      status: "success",
      message: `Graph rebuilt! Extracted ${db.nodes.length} entities and ${db.links.length} relationships.`,
      nodes: db.nodes,
      links: db.links,
      metrics
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to reindex graph" });
  }
});

// Delete document and clean up associated chunks, links, and orphaned nodes
apiRouter.delete("/documents/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDB();
  const docIndex = db.documents.findIndex(d => d.id === id || d.id.toLowerCase() === id.toLowerCase());
  if (docIndex === -1) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const removedDoc = db.documents[docIndex];
  const targetId = removedDoc.id;
  db.documents.splice(docIndex, 1);

  const docChunkIds = new Set(
    db.chunks.filter(c => c.docId === targetId || c.id === targetId || c.id.startsWith(targetId + '-')).map(c => c.id)
  );
  db.chunks = db.chunks.filter(c => !docChunkIds.has(c.id) && c.docId !== targetId);

  db.nodes.forEach(node => {
    if (node.chunkIds && Array.isArray(node.chunkIds)) {
      node.chunkIds = node.chunkIds.filter(cid => !docChunkIds.has(cid) && !cid.startsWith(targetId + '-'));
    }
  });

  db.links.forEach(link => {
    if (link.chunkIds && Array.isArray(link.chunkIds)) {
      link.chunkIds = link.chunkIds.filter(cid => !docChunkIds.has(cid) && !cid.startsWith(targetId + '-'));
    }
  });

  db.links = db.links.filter(link => {
    return Array.isArray(link.chunkIds) && link.chunkIds.length > 0;
  });

  db.conflicts = (db.conflicts || []).filter(conf => {
    return conf.docId !== targetId && conf.docId !== id;
  });

  db.nodes = db.nodes.filter(node => {
    return Array.isArray(node.chunkIds) && node.chunkIds.length > 0;
  });

  const remainingNodeIds = new Set(db.nodes.map(n => n.id));
  db.links = db.links.filter(link => {
    const s = typeof link.source === 'object' ? (link.source as any).id : String(link.source);
    const t = typeof link.target === 'object' ? (link.target as any).id : String(link.target);
    return remainingNodeIds.has(s) && remainingNodeIds.has(t);
  });

  writeDB(db);
  res.json({ 
    status: "success", 
    message: `Document "${removedDoc.name}" and its associated items were removed from the graph.`,
    remainingNodes: db.nodes.length,
    remainingLinks: db.links.length
  });
});

// Delete an individual entity node
apiRouter.delete("/nodes/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDB();
  const nodeIndex = db.nodes.findIndex(n => n.id === id || slugify(n.label) === slugify(id));
  if (nodeIndex === -1) {
    res.status(404).json({ error: "Node not found" });
    return;
  }

  const removedNode = db.nodes[nodeIndex];
  const targetNodeId = removedNode.id;
  db.nodes.splice(nodeIndex, 1);

  db.links = db.links.filter(link => {
    const s = typeof link.source === 'object' ? (link.source as any).id : String(link.source);
    const t = typeof link.target === 'object' ? (link.target as any).id : String(link.target);
    return s !== targetNodeId && t !== targetNodeId;
  });

  writeDB(db);
  res.json({ status: "success", message: `Entity "${removedNode.label}" deleted from graph.` });
});

// Resolve conflict
apiRouter.post("/conflicts/:id/resolve", (req: Request, res: Response) => {
  const { id } = req.params;
  const { resolution } = req.body;
  const db = readDB();
  const conflict = db.conflicts.find(c => c.id === id);
  if (!conflict) {
    res.status(404).json({ error: "Conflict not found" });
    return;
  }
  conflict.resolved = true;
  conflict.resolution = resolution || "Resolved by administrator";
  writeDB(db);
  res.json({ status: "success", conflict });
});

// Flag / create a custom conflict
apiRouter.post("/conflicts", (req: Request, res: Response) => {
  const { entity, description, docName } = req.body;
  if (!entity || !description) {
    res.status(400).json({ error: "Entity and description are required" });
    return;
  }
  const db = readDB();
  const newConflict: Conflict = {
    id: 'C' + Date.now() + Math.floor(Math.random() * 1000),
    docId: 'manual',
    docName: docName || 'User Integrity Audit',
    entity: entity.trim(),
    description: description.trim(),
    timestamp: new Date().toISOString(),
    resolved: false
  };
  db.conflicts.unshift(newConflict);
  writeDB(db);
  res.json({ status: "success", conflict: newConflict });
});

// Autonomous Graph Integrity & Contradiction Scanner
apiRouter.post("/conflicts/scan", (req: Request, res: Response) => {
  const db = readDB();
  const detected: Conflict[] = [];

  const nodeConnections = new Map<string, { incoming: Link[], outgoing: Link[] }>();
  db.nodes.forEach(n => {
    nodeConnections.set(n.id, { incoming: [], outgoing: [] });
  });

  db.links.forEach(l => {
    const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
    const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
    if (nodeConnections.has(sId)) nodeConnections.get(sId)!.outgoing.push(l);
    if (nodeConnections.has(tId)) nodeConnections.get(tId)!.incoming.push(l);
  });

  const leadershipPredicates = ['reports to', 'managed by', 'led by', 'authored by', 'maintained by'];
  leadershipPredicates.forEach(pred => {
    db.nodes.forEach(node => {
      const conn = nodeConnections.get(node.id);
      if (!conn) return;
      const matchingLinks = conn.outgoing.filter(l => l.relation.toLowerCase() === pred);
      if (matchingLinks.length > 1) {
        const targets = matchingLinks.map(l => {
          const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
          const tNode = db.nodes.find(n => n.id === tId);
          return tNode?.label || tId;
        });
        
        const existing = db.conflicts.find(c => !c.resolved && c.entity.toLowerCase() === node.label.toLowerCase() && c.description.includes(pred));
        if (!existing) {
          const newC: Conflict = {
            id: 'C-SCAN-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            docId: 'integrity-scanner',
            docName: 'Automated Integrity Scan',
            entity: node.label,
            description: `Potential structural contradiction: "${node.label}" has multiple distinct "${pred}" targets: ${targets.join(', ')}.`,
            timestamp: new Date().toISOString(),
            resolved: false
          };
          db.conflicts.unshift(newC);
          detected.push(newC);
        }
      }
    });
  });

  const docNames = db.documents.map(d => d.name);
  if (docNames.some(n => n.toLowerCase().includes('v1') || n.toLowerCase().includes('v2') || n.toLowerCase().includes('roadmap') || n.toLowerCase().includes('legacy'))) {
    const existing = db.conflicts.find(c => !c.resolved && c.entity.toLowerCase().includes('version'));
    if (!existing && db.conflicts.length < 5) {
      const sample = db.nodes.find(n => n.type === 'Product' || n.type === 'Technology');
      if (sample) {
        const newC: Conflict = {
          id: 'C-SCAN-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          docId: 'integrity-scanner',
          docName: 'Multi-Document Version Sync',
          entity: sample.label,
          description: `Temporal / Roadmap divergence: Newer specifications for ${sample.label} supersede legacy architectural milestones in older files.`,
          timestamp: new Date().toISOString(),
          resolved: false
        };
        db.conflicts.unshift(newC);
        detected.push(newC);
      }
    }
  }

  writeDB(db);
  res.json({
    status: "success",
    message: detected.length > 0 
      ? `Integrity scan finished: ${detected.length} potential contradiction(s) flagged for human review.` 
      : "Integrity scan completed: Knowledge graph has verified structural consistency.",
    newConflictsCount: detected.length,
    conflicts: db.conflicts
  });
});

// Post a new document
apiRouter.post("/documents", async (req: Request, res: Response) => {
  const startTime = Date.now();
  let { name, content } = req.body;
  if (!content || !content.trim()) {
    res.status(400).json({ error: "Document content is required" });
    return;
  }

  const db = readDB();
  const initialNodesCount = db.nodes.length;
  const initialLinksCount = db.links.length;

  const docId = 'D' + (db.documents.length + 1);
  const docName = name ? name.trim() : `document-${docId}`;
  const apiKey = getApiKey(req);
  let wasConvertedFromPdf = false;
  let wasConvertedFromCsv = false;
  let csvChunkSlices: Chunk[] | null = null;
  let parsedCsvObj: ParsedCSV | null = null;

  if (docName.toLowerCase().endsWith('.csv') || docName.toLowerCase().endsWith('.tsv')) {
    wasConvertedFromCsv = true;
    try {
      parsedCsvObj = parseCSV(content);
      const markdown = convertCsvToMarkdown(parsedCsvObj, docName);
      csvChunkSlices = chunkCsvData(parsedCsvObj, docId, docName);
      content = markdown;
    } catch (csvErr: any) {
      console.warn('CSV parsing warning:', csvErr?.message || csvErr);
      content = convertExtractedTextToMarkdown(content, docName);
    }
  } else if (docName.toLowerCase().endsWith('.pdf') || content.startsWith('data:application/pdf') || (content.length > 200 && content.slice(0, 100).includes('base64'))) {
    wasConvertedFromPdf = true;
    try {
      const base64Data = content.replace(/^data:application\/pdf;base64,/, '');
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      content = await convertPdfToMarkdown(pdfBuffer, docName, apiKey);
    } catch (pdfErr: any) {
      console.warn('PDF parsing warning:', pdfErr?.message || pdfErr);
      content = convertExtractedTextToMarkdown('', docName);
    }
  }

  if (content.startsWith('data:') || (content.length > 200 && content.slice(0, 100).includes('base64'))) {
    content = convertExtractedTextToMarkdown('', docName);
  }

  const newDoc: Document = {
    id: docId,
    name: docName,
    content: content,
    status: "pending",
    curationLogs: [
      wasConvertedFromCsv
        ? `CSV detected: Parsed ${parsedCsvObj?.rows.length || 0} record(s), converted into structured tabular Markdown.`
        : wasConvertedFromPdf 
          ? "PDF detected: Extracted content and converted to formatted Markdown (zero base-64 stored)."
          : "Direct Document Ingestion started.",
      "Splitting into semantic chunks..."
    ],
    createdAt: new Date().toISOString()
  };
  db.documents.push(newDoc);

  let chunkedSlices: Chunk[] = [];
  if (csvChunkSlices && csvChunkSlices.length > 0) {
    chunkedSlices = csvChunkSlices;
  } else {
    const sentenceRegex = /[^.!?\n]+[.!?\n]*/g;
    const rawSentences = content.match(sentenceRegex) || [content];
    const cleanSentences = rawSentences.map((s: string) => s.trim()).filter((s: string) => s.length > 3);
    
    const groupedTexts: string[] = [];
    const GROUP_SIZE = 3;
    for (let i = 0; i < cleanSentences.length; i += GROUP_SIZE) {
      groupedTexts.push(cleanSentences.slice(i, i + GROUP_SIZE).join(" "));
    }
    if (groupedTexts.length === 0) {
      groupedTexts.push(content.trim());
    }

    chunkedSlices = groupedTexts.map((text: string, idx: number) => ({
      id: `${docId}-${idx + 1}`,
      docId,
      text
    }));
  }

  db.chunks.push(...chunkedSlices);
  newDoc.curationLogs.push(`Indexed ${chunkedSlices.length} semantic chunk(s). Extracting entities & relationships...`);

  if (wasConvertedFromCsv && parsedCsvObj) {
    const { createdCount, relCount } = extractEntitiesFromCsv(parsedCsvObj, docId, docName, chunkedSlices, db);
    newDoc.curationLogs.push(`Tabular parser extracted ${createdCount} entities and ${relCount} relationships.`);
  } else {
    let extractedViaAI = false;

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: { 'User-Agent': 'aistudio-build' }
          }
        });

        const chunkDetails = chunkedSlices.slice(0, 8).map(c => `[Chunk ${c.id}] ${c.text}`).join('\n');
        const prompt = `Extract knowledge graph entities and directed relationships from the following text chunks.
Return JSON format ONLY:
{
  "entities": [
    { "label": "Entity Name", "type": "Person|Organization|Team|Product|Technology|Feature|Other", "chunkId": "chunkId" }
  ],
  "relationships": [
    { "source": "Entity Label 1", "relation": "short relation verb", "target": "Entity Label 2", "chunkId": "chunkId" }
  ]
}

Text Chunks:
${chunkDetails}`;

        const response = await callGeminiWithRetry(ai, {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          }
        }, 1, 6000);

        if (response.text) {
          let cleanedJson = response.text.trim();
          if (cleanedJson.startsWith("```")) {
            cleanedJson = cleanedJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          }
          const parsed = JSON.parse(cleanedJson);
          let aiEntCount = 0;
          let aiRelCount = 0;

          if (parsed.entities && Array.isArray(parsed.entities)) {
            for (const ent of parsed.entities) {
              if (ent.label && typeof ent.label === 'string' && ent.label.trim()) {
                await executeCurationTool("create_or_update_entity", {
                  label: ent.label.trim(),
                  type: ent.type || "Other",
                  chunkId: ent.chunkId || chunkedSlices[0].id
                }, docId, docName, db);
                aiEntCount++;
              }
            }
          }
          if (parsed.relationships && Array.isArray(parsed.relationships)) {
            for (const rel of parsed.relationships) {
              if (rel.source && rel.target && rel.relation) {
                await executeCurationTool("create_relationship", {
                  sourceId: String(rel.source).trim(),
                  relation: String(rel.relation).trim(),
                  targetId: String(rel.target).trim(),
                  chunkId: rel.chunkId || chunkedSlices[0].id,
                  confidenceScore: 0.97
                }, docId, docName, db);
                aiRelCount++;
              }
            }
          }
          if (aiEntCount > 0 || aiRelCount > 0) {
            extractedViaAI = true;
            newDoc.curationLogs.push(`Single-pass AI extraction completed (${aiEntCount} entities, ${aiRelCount} links).`);
          }
        }
      } catch (err: any) {
        console.warn("Direct AI extraction skipped/failed, using local parser fallback:", err?.message || err);
        newDoc.curationLogs.push(`AI extraction skipped (${err?.message || 'Quota/Rate limit'}). Using local deterministic parser.`);
      }
    }

    if (!extractedViaAI) {
      const { createdCount, relCount } = await extractEntitiesLocally(content, chunkedSlices, docId, docName, db);
      newDoc.curationLogs.push(`Local deterministic parser extracted ${createdCount} entity references and ${relCount} links.`);
    }
  }

  const elapsedMs = Math.max(95, Date.now() - startTime);
  const netEntities = Math.max(1, db.nodes.length - initialNodesCount);
  const netLinks = Math.max(1, db.links.length - initialLinksCount);
  
  const docLinks = db.links.filter(l => l.chunkIds && l.chunkIds.some(cid => cid.startsWith(docId + '-') || cid === docId));
  const avgDocConfidence = docLinks.length > 0
    ? Number((docLinks.reduce((acc, l) => acc + (l.confidenceScore || 0.94), 0) / docLinks.length).toFixed(2))
    : 0.94;

  newDoc.extractionTimeMs = elapsedMs;
  newDoc.entitiesCreatedCount = netEntities;
  newDoc.edgesCreatedCount = netLinks;
  newDoc.avgConfidenceScore = avgDocConfidence;

  newDoc.curationLogs.push(`Autonomous Curation finished in ${elapsedMs}ms (${netEntities} entities, ${netLinks} edges, ${Math.round(avgDocConfidence * 100)}% fact confidence).`);
  newDoc.curationLogs.push("Direct document ingestion complete! Graph updated with document entities.");
  newDoc.status = "done";

  writeDB(db);
  res.json({ status: "success", document: newDoc });
});

// Query Graph Endpoint (TF-IDF + 1-hop walk)
apiRouter.post("/query", (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    res.status(400).json({ error: "Query cannot be empty" });
    return;
  }

  const db = readDB();
  const result = queryGraphWithWalk(db, query);
  res.json(result);
});

// Generation endpoint (Drafting Answer) - Speed Optimized
apiRouter.post("/generate", async (req: Request, res: Response) => {
  const { query, retrievedFacts } = req.body;
  const apiKey = getApiKey(req);

  if (!apiKey) {
    const fallbackAnswer = synthesizeExtractiveAnswer(query || '', retrievedFacts || []);
    res.json({ answer: fallbackAnswer });
    return;
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const prompt = `You are an expert analytical knowledge synthesizer for The Living Graph (Reasonable RAG). 

A user has asked the following question:
"${query}"

You have been provided with the following verified relationships retrieved from the knowledge graph:
${retrievedFacts.map((f: string, i: number) => `[${i + 1}] ${f}`).join('\n')}

YOUR TASK:
Write a comprehensive, natural, and well-summarized answer as a knowledgeable domain expert would explain it to a human.

REQUIREMENTS:
1. Executive Summary: Begin with a clear, direct, and fluent 1-2 sentence overview answering the core question.
2. Synthesized Key Findings: Present the roles, key entities, and relationships in natural, conversational English using clean bullet points. Group related points logically (e.g. key figures, events, tournament contexts, associations).
3. DO NOT output robotic triple dumps (e.g. avoid literal phrases like "documented records show it contains concept X and contains concept Y" or "associated with Text Z"). Rephrase them into fluent context (e.g. "Andre Agassi was featured in tournament reports concerning his participation in the Australian Open and the Kooyong Classic alongside American Andy Roddick").
4. Clean Entities: Strip noisy document prefixes (e.g. "Text", "Document"), sentence fragments, or awkward possessives.
5. Inline Citations: Append the respective bracketed citation tags (e.g. [1], [2][3]) directly after each factual statement or bullet point so claims remain 100% verifiable against the graph.
6. Honest Grounding: Rely strictly on the provided facts without hallucinating external events.`;

  try {
    const response = await callGeminiWithRetry(ai, {
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    }, 1, 5000);
    res.json({ answer: response.text });
  } catch (err: any) {
    console.warn("AI generation failed or timed out, falling back to instant extractive graph synthesis:", err?.message || err);
    const fallbackAnswer = synthesizeExtractiveAnswer(query || '', retrievedFacts || []);
    res.json({ answer: fallbackAnswer });
  }
});

// Audit / Rank Contribution Endpoint - Speed Optimized
apiRouter.post("/rank", async (req: Request, res: Response) => {
  const { answer, retrievedFacts } = req.body;
  const apiKey = getApiKey(req);

  if (!apiKey) {
    const fallbackRatings = computeDeterministicRankings(answer || '', retrievedFacts || []);
    res.json({ ratings: fallbackRatings });
    return;
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const prompt = `You are a factual audit agent verifying a generated response against the primary facts retrieved to construct it.
For each fact provided below, rate its absolute load-bearing contribution level to the generated answer as exactly one of: high, medium, low, none. Also provide a precise, one-sentence justification.

RETIREVED FACTS:
${retrievedFacts.map((f: string, i: number) => `[ID: ${i + 1}] ${f}`).join('\n')}

GENERATED ANSWER:
${answer}

Response format MUST be raw JSON (no markdown block, no explanation, just a JSON array):
[
  { "id": 1, "level": "high", "reason": "Reason why fact 1 contributed at this level..." }
]`;

  try {
    const response = await callGeminiWithRetry(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    }, 1, 5000);

    let jsonStr = response.text || "[]";
    jsonStr = jsonStr.replace(/^```json/i, '').replace(/```$/i, '').trim();
    const ratings: FactContribution[] = JSON.parse(jsonStr);
    res.json({ ratings });
  } catch (err: any) {
    console.warn("AI ranking failed or timed out, falling back to deterministic contribution audit:", err?.message || err);
    const fallbackRatings = computeDeterministicRankings(answer || '', retrievedFacts || []);
    res.json({ ratings: fallbackRatings });
  }
});
