import { Type, FunctionDeclaration } from "@google/genai";
import { DBStructure, readDB, writeDB, slugify } from "./db.js";
import { Document, Chunk, Node, Link, Conflict, NodeType } from "../src/types.js";
import { ParsedCSV, classifyTypeByHeader, classifyTypeByValue, getRelationVerbForHeader, convertPdfToMarkdown, convertExtractedTextToMarkdown, parseCSV, chunkCsvData } from "./parsers.js";

export const searchGraphEntitiesDecl: FunctionDeclaration = {
  name: "search_graph_entities",
  description: "Fuzzy search the graph database for existing entities matching the keyword or phrase. Use this before creating any new entity, to check if it already exists under a slightly different spelling, capitalization, or format.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "Name or synonym to search for." }
    },
    required: ["query"]
  }
};

export const checkExistingRelationshipsDecl: FunctionDeclaration = {
  name: "check_existing_relationships",
  description: "Get all connections involving a specific entity to prevent duplicates and detect factual contradictions.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      entityId: { type: Type.STRING, description: "The slugified ID of the entity to analyze." }
    },
    required: ["entityId"]
  }
};

export const createOrUpdateEntityDecl: FunctionDeclaration = {
  name: "create_or_update_entity",
  description: "Create a new entity node, or link an existing entity node to a text chunk.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      label: { type: Type.STRING, description: "The clear, readable name of the entity." },
      type: { 
        type: Type.STRING, 
        description: "Must be exactly one of: Person, Organization, Team, Product, Technology, Feature, Other" 
      },
      chunkId: { type: Type.STRING, description: "The text chunk ID this entity belongs to." }
    },
    required: ["label", "type", "chunkId"]
  }
};

export const createRelationshipDecl: FunctionDeclaration = {
  name: "create_relationship",
  description: "Create a directed relationship triple (source -> relation -> target) between two entities.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      sourceId: { type: Type.STRING, description: "Slugified ID of the subject entity." },
      relation: { type: Type.STRING, description: "Factual relation label (e.g. 'leads', 'built', 'uses')." },
      targetId: { type: Type.STRING, description: "Slugified ID of the object entity." },
      chunkId: { type: Type.STRING, description: "The text chunk ID where this fact was stated." }
    },
    required: ["sourceId", "relation", "targetId", "chunkId"]
  }
};

export const mergeEntitiesDecl: FunctionDeclaration = {
  name: "merge_entities",
  description: "Deduplicate and merge a secondary duplicate entity (sourceId) into a primary entity (targetId).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      sourceId: { type: Type.STRING, description: "The duplicate entity ID to eliminate." },
      targetId: { type: Type.STRING, description: "The primary entity ID to merge into." }
    },
    required: ["sourceId", "targetId"]
  }
};

export const flagConflictDecl: FunctionDeclaration = {
  name: "flag_conflict",
  description: "Flag a factual conflict or contradiction between new data and the existing graph database for human review.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      entityId: { type: Type.STRING, description: "The slugified entity ID experiencing the contradiction." },
      description: { type: Type.STRING, description: "Full explanation of the contradiction." }
    },
    required: ["entityId", "description"]
  }
};

export const TOOLS_LIST = [
  searchGraphEntitiesDecl,
  checkExistingRelationshipsDecl,
  createOrUpdateEntityDecl,
  createRelationshipDecl,
  mergeEntitiesDecl,
  flagConflictDecl
];

export const CURATION_AGENT_SYSTEM_PROMPT = `You are the DeepCuration Autonomous Knowledge-Base Curation Agent. Your job is to curate, update, and self-optimize a persistent GraphRAG database using new text chunks.
You operate step-by-step using tools. For any text chunk you analyze, you MUST:
1. Search the graph to see if the entities mentioned already exist (use 'search_graph_entities').
2. If near-duplicates are found, merge them (use 'merge_entities') into the canonical node.
3. Check existing relationships (use 'check_existing_relationships') to prevent duplicate connections and detect contradictions.
4. If a clear factual contradiction is found, flag it (use 'flag_conflict').
5. Otherwise, create or update entities ('create_or_update_entity') and link them with factual relationships ('create_relationship').`;

export async function executeCurationTool(
  name: string, 
  args: any, 
  docId: string, 
  docName: string,
  targetDb?: DBStructure
): Promise<any> {
  const db = targetDb || readDB();
  const shouldPersist = !targetDb;

  switch (name) {
    case "search_graph_entities": {
      const q = (args.query || '').toLowerCase().trim();
      if (!q) return { results: [] };
      const results = db.nodes.filter(n => 
        n.label.toLowerCase().includes(q) || 
        n.type.toLowerCase().includes(q) ||
        slugify(n.label).includes(q)
      );
      return { results };
    }

    case "check_existing_relationships": {
      const entityId = slugify(args.entityId || '');
      const relationships = db.links.filter(l => 
        slugify(typeof l.source === 'object' ? (l.source as any).id : l.source) === entityId || 
        slugify(typeof l.target === 'object' ? (l.target as any).id : l.target) === entityId ||
        l.source === entityId ||
        l.target === entityId
      );
      return { entityId, relationships };
    }

    case "create_or_update_entity": {
      const { label, type, chunkId } = args;
      const key = slugify(label);
      if (!key) throw new Error("Invalid entity label");

      let existing = db.nodes.find(n => n.id === key);
      if (existing) {
        if (!existing.chunkIds.includes(chunkId)) {
          existing.chunkIds.push(chunkId);
        }
        if (existing.type === "Other" && type && type !== "Other") {
          existing.type = type as NodeType;
        }
        if (shouldPersist) writeDB(db);
        return { status: "updated", node: existing };
      } else {
        const newNode: Node = {
          id: key,
          label: String(label).trim(),
          type: (type || "Other") as NodeType,
          chunkIds: [chunkId]
        };
        db.nodes.push(newNode);
        if (shouldPersist) writeDB(db);
        return { status: "created", node: newNode };
      }
    }

    case "create_relationship": {
      const { sourceId, relation, targetId, chunkId, confidenceScore } = args;
      const sId = slugify(sourceId);
      const tId = slugify(targetId);
      const rel = relation.trim().toLowerCase();

      let sourceNode = db.nodes.find(n => n.id === sId);
      let targetNode = db.nodes.find(n => n.id === tId);

      if (!sourceNode && sourceId) {
        sourceNode = {
          id: sId,
          label: String(sourceId).trim(),
          type: "Other",
          chunkIds: [chunkId]
        };
        db.nodes.push(sourceNode);
      }

      if (!targetNode && targetId) {
        targetNode = {
          id: tId,
          label: String(targetId).trim(),
          type: "Other",
          chunkIds: [chunkId]
        };
        db.nodes.push(targetNode);
      }

      if (!sourceNode || !targetNode) {
        throw new Error(`Subject/Object reference invalid.`);
      }

      const key = `${sId}|${rel}|${tId}`;
      let existingLink = db.links.find(l => l.id === key);

      const score = typeof confidenceScore === 'number' && confidenceScore > 0 && confidenceScore <= 1
        ? confidenceScore
        : (relation.length > 3 && sourceNode.label.length > 2 && targetNode.label.length > 2 ? 0.96 : 0.91);

      if (existingLink) {
        if (!existingLink.chunkIds.includes(chunkId)) {
          existingLink.chunkIds.push(chunkId);
        }
        if (!existingLink.confidenceScore) {
          existingLink.confidenceScore = score;
        }
        if (shouldPersist) writeDB(db);
        return { status: "updated", link: existingLink };
      } else {
        const newLink: Link = {
          id: key,
          source: sId,
          target: tId,
          relation: relation.trim(),
          chunkIds: [chunkId],
          confidenceScore: score
        };
        db.links.push(newLink);
        if (shouldPersist) writeDB(db);
        return { status: "created", link: newLink };
      }
    }

    case "merge_entities": {
      const sourceId = slugify(args.sourceId || '');
      const targetId = slugify(args.targetId || '');

      if (sourceId === targetId) return { status: "ignored", reason: "Cannot merge an entity into itself" };

      const sourceNode = db.nodes.find(n => n.id === sourceId);
      const targetNode = db.nodes.find(n => n.id === targetId);

      if (!sourceNode || !targetNode) {
        throw new Error("Merge failed: sourceId or targetId does not exist.");
      }

      sourceNode.chunkIds.forEach(cid => {
        if (!targetNode.chunkIds.includes(cid)) {
          targetNode.chunkIds.push(cid);
        }
      });

      let remapCount = 0;
      db.links.forEach(l => {
        let changed = false;
        const currentSrc = slugify(typeof l.source === 'object' ? (l.source as any).id : l.source);
        const currentTgt = slugify(typeof l.target === 'object' ? (l.target as any).id : l.target);

        if (currentSrc === sourceId) {
          l.source = targetId;
          changed = true;
        }
        if (currentTgt === sourceId) {
          l.target = targetId;
          changed = true;
        }

        if (changed) {
          l.id = `${slugify(typeof l.source === 'object' ? (l.source as any).id : l.source)}|${l.relation.trim().toLowerCase()}|${slugify(typeof l.target === 'object' ? (l.target as any).id : l.target)}`;
          remapCount++;
        }
      });

      db.nodes = db.nodes.filter(n => n.id !== sourceId);
      if (shouldPersist) writeDB(db);

      return { status: "merged", deletedId: sourceId, remappedConnectionsCount: remapCount };
    }

    case "flag_conflict": {
      const { entityId, description } = args;
      const eId = slugify(entityId || '');

      const newConflict: Conflict = {
        id: 'C' + Date.now() + Math.floor(Math.random() * 1000),
        docId,
        docName,
        entity: args.entityId || eId,
        description,
        timestamp: new Date().toISOString(),
        resolved: false
      };
      db.conflicts.push(newConflict);
      if (shouldPersist) writeDB(db);

      return { status: "conflict_flagged", conflict: newConflict };
    }

    default:
      throw new Error(`Unknown tool instruction '${name}'`);
  }
}

export function extractEntitiesFromCsv(
  parsed: ParsedCSV, 
  docId: string, 
  docName: string, 
  chunks: Chunk[], 
  db: DBStructure
): { createdCount: number; relCount: number } {
  const { headers, rows } = parsed;
  let createdCount = 0;
  let relCount = 0;

  if (headers.length === 0 || rows.length === 0) {
    return { createdCount: 0, relCount: 0 };
  }

  const primaryDocLabel = docName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
  const primaryDocId = slugify(primaryDocLabel);

  if (primaryDocLabel) {
    let docNode = db.nodes.find(n => n.id === primaryDocId);
    if (!docNode) {
      db.nodes.push({
        id: primaryDocId,
        label: primaryDocLabel,
        type: "Product",
        chunkIds: [chunks[0]?.id || docId]
      });
      createdCount++;
    } else {
      if (!docNode.chunkIds.includes(chunks[0]?.id || docId)) {
        docNode.chunkIds.push(chunks[0]?.id || docId);
      }
    }
  }

  const normHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const srcIdx = normHeaders.findIndex(h => ['source', 'subject', 'head', 'from', 'entity1', 'entity', 'node1'].includes(h));
  const relIdx = normHeaders.findIndex(h => ['relation', 'relationship', 'predicate', 'verb', 'link', 'action', 'type'].includes(h));
  const tgtIdx = normHeaders.findIndex(h => ['target', 'object', 'tail', 'to', 'entity2', 'value', 'node2'].includes(h));
  const typeIdx = normHeaders.findIndex(h => ['type', 'category', 'nodetype', 'entitytype'].includes(h));

  const isExplicitTripleCSV = srcIdx !== -1 && relIdx !== -1 && tgtIdx !== -1;

  if (isExplicitTripleCSV) {
    const tripleRows = rows.slice(0, 60);
    tripleRows.forEach((row, rIdx) => {
      const sourceVal = row[srcIdx]?.trim();
      const relVal = row[relIdx]?.trim();
      const targetVal = row[tgtIdx]?.trim();
      const typeVal = typeIdx !== -1 ? row[typeIdx]?.trim() : '';

      if (!sourceVal || !targetVal) return;

      const chunkIdx = Math.floor(rIdx / 5);
      const chunkId = chunks[chunkIdx]?.id || chunks[0]?.id || docId;

      const sId = slugify(sourceVal);
      if (sId) {
        let sNode = db.nodes.find(n => n.id === sId);
        if (!sNode) {
          db.nodes.push({
            id: sId,
            label: sourceVal,
            type: classifyTypeByValue(sourceVal, typeVal),
            chunkIds: [chunkId]
          });
          createdCount++;
        } else if (!sNode.chunkIds.includes(chunkId)) {
          sNode.chunkIds.push(chunkId);
        }
      }

      const tId = slugify(targetVal);
      if (tId) {
        let tNode = db.nodes.find(n => n.id === tId);
        if (!tNode) {
          db.nodes.push({
            id: tId,
            label: targetVal,
            type: classifyTypeByValue(targetVal, ''),
            chunkIds: [chunkId]
          });
          createdCount++;
        } else if (!tNode.chunkIds.includes(chunkId)) {
          tNode.chunkIds.push(chunkId);
        }
      }

      if (sId && tId) {
        const linkRel = relVal || 'connected to';
        const linkKey = `${sId}|${linkRel.toLowerCase().trim()}|${tId}`;
        let existingLink = db.links.find(l => l.id === linkKey);
        if (!existingLink) {
          db.links.push({
            id: linkKey,
            source: sId,
            target: tId,
            relation: linkRel,
            chunkIds: [chunkId],
            confidenceScore: 0.96
          });
          relCount++;
        } else if (!existingLink.chunkIds.includes(chunkId)) {
          existingLink.chunkIds.push(chunkId);
        }
      }
    });

    return { createdCount, relCount };
  }

  const primaryColIdx = Math.max(0, normHeaders.findIndex(h => ['name', 'title', 'id', 'item', 'entity', 'product', 'person'].includes(h)));
  const categoricalColIndices: number[] = [];
  headers.forEach((h, idx) => {
    if (idx === primaryColIdx) return;
    const lower = h.toLowerCase();
    if (['department', 'dept', 'team', 'company', 'org', 'role', 'title', 'category', 'genre', 'technology', 'tech', 'location', 'project', 'vendor'].some(kw => lower.includes(kw))) {
      categoricalColIndices.push(idx);
    }
  });

  const sampleRows = rows.slice(0, 40);

  sampleRows.forEach((row, rIdx) => {
    const primaryLabel = row[primaryColIdx]?.trim();
    if (!primaryLabel || primaryLabel.length < 2) return;

    const primaryKey = slugify(primaryLabel);
    if (!primaryKey) return;

    const chunkIdx = Math.floor(rIdx / 5);
    const chunkId = chunks[chunkIdx]?.id || chunks[0]?.id || docId;

    const primaryColHeader = headers[primaryColIdx] || '';
    const primaryType = classifyTypeByHeader(primaryColHeader, primaryLabel);

    let primaryNode = db.nodes.find(n => n.id === primaryKey);
    if (!primaryNode) {
      db.nodes.push({
        id: primaryKey,
        label: primaryLabel,
        type: primaryType,
        chunkIds: [chunkId]
      });
      createdCount++;
    } else {
      if (!primaryNode.chunkIds.includes(chunkId)) {
        primaryNode.chunkIds.push(chunkId);
      }
      if (primaryNode.type === 'Other' && primaryType !== 'Other') {
        primaryNode.type = primaryType;
      }
    }

    if (primaryDocId && primaryKey !== primaryDocId) {
      const docLinkKey = `${primaryDocId}|contains record|${primaryKey}`;
      let existingDocLink = db.links.find(l => l.id === docLinkKey);
      if (!existingDocLink) {
        db.links.push({
          id: docLinkKey,
          source: primaryDocId,
          target: primaryKey,
          relation: "contains record",
          chunkIds: [chunkId],
          confidenceScore: 0.95
        });
        relCount++;
      }
    }

    const targetCols = categoricalColIndices.length > 0 ? categoricalColIndices : [1, 2, 3].filter(idx => idx < headers.length);

    targetCols.forEach(cIdx => {
      if (cIdx === primaryColIdx) return;
      const header = headers[cIdx];
      const attrVal = row[cIdx]?.trim();
      if (!attrVal || attrVal.length < 2) return;
      if (/^\d+(\.\d+)?$/.test(attrVal)) return;

      const attrKey = slugify(attrVal);
      if (!attrKey || attrKey === primaryKey) return;

      const attrType = classifyTypeByHeader(header, attrVal);

      let attrNode = db.nodes.find(n => n.id === attrKey);
      if (!attrNode) {
        db.nodes.push({
          id: attrKey,
          label: attrVal,
          type: attrType,
          chunkIds: [chunkId]
        });
        createdCount++;
      } else {
        if (!attrNode.chunkIds.includes(chunkId)) {
          attrNode.chunkIds.push(chunkId);
        }
        if (attrNode.type === 'Other' && attrType !== 'Other') {
          attrNode.type = attrType;
        }
      }

      const relationVerb = getRelationVerbForHeader(header);
      const linkKey = `${primaryKey}|${relationVerb.toLowerCase()}|${attrKey}`;
      let existingLink = db.links.find(l => l.id === linkKey);
      if (!existingLink) {
        db.links.push({
          id: linkKey,
          source: primaryKey,
          target: attrKey,
          relation: relationVerb,
          chunkIds: [chunkId],
          confidenceScore: 0.96
        });
        relCount++;
      } else if (!existingLink.chunkIds.includes(chunkId)) {
        existingLink.chunkIds.push(chunkId);
      }
    });
  });

  return { createdCount, relCount };
}

export function cleanEntityLabel(raw: string): string | null {
  if (!raw) return null;
  let label = raw.trim();

  // Strip markdown, bold, html, quotes, brackets
  label = label.replace(/\*\*+/g, '').replace(/__+/g, '').replace(/^["'\[\(]+|["'\]\)]+$/g, '').trim();

  // Strip prefixes like "Text ", "Document ", "File ", "Page "
  label = label.replace(/^(?:Text|Document|File|Page|Section|Chapter)\s+/i, '').trim();

  // Strip possessive endings ('s, ’s)
  label = label.replace(/['’]s$/i, '').trim();

  // Strip trailing/leading punctuation
  label = label.replace(/^[^\w\s]+|[^\w\s]+$/g, '').trim();

  // Filter out invalid length
  if (label.length < 2 || label.length > 35) return null;

  // Filter pure numbers
  if (/^\d+$/.test(label)) return null;

  // Filter sentence fragments and clauses
  const lower = label.toLowerCase();
  const badFragments = [
    'was put', 'put in', 'in doubt', 'doubt after', 'in the', 'is a', 'are the',
    'was a', 'were the', 'has been', 'have been', 'contains concept', 'according to',
    'regarding', 'fear for', 'due to', 'instead of', 'with the', 'from the', 'and the',
    'because of', 'as well as'
  ];
  if (badFragments.some(f => lower.includes(f))) return null;

  return label;
}

export async function extractEntitiesLocally(
  content: string, 
  chunkedSlices: Chunk[], 
  docId: string, 
  docName: string,
  targetDb?: DBStructure
) {
  const db = targetDb || readDB();
  let createdCount = 0;
  let relCount = 0;

  let primaryDocLabel = docName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
  // If docName is an entire sentence, extract just the concise title/subject
  if (primaryDocLabel.length > 35) {
    primaryDocLabel = primaryDocLabel.split(/[:\-\.\?,;]|\b(?:was|is|in|for|with|by|after|that)\b/i)[0].trim();
    if (primaryDocLabel.length > 35) {
      primaryDocLabel = primaryDocLabel.slice(0, 35).trim();
    }
  }
  primaryDocLabel = cleanEntityLabel(primaryDocLabel) || primaryDocLabel;
  const primaryDocId = slugify(primaryDocLabel);

  if (primaryDocLabel && primaryDocLabel.length > 1) {
    try {
      await executeCurationTool("create_or_update_entity", {
        label: primaryDocLabel,
        type: "Product",
        chunkId: chunkedSlices[0]?.id || docId
      }, docId, docName, db);
      createdCount++;
    } catch (e) {}
  }

  const stopWords = new Set([
    'The', 'This', 'That', 'With', 'From', 'Have', 'When', 'Where', 'What', 'Your', 'Their',
    'Note', 'Important', 'Using', 'After', 'Before', 'Each', 'Some', 'Many', 'Most', 'Also',
    'First', 'Then', 'Only', 'Over', 'Under', 'More', 'Less', 'Been', 'Will', 'Would', 'Could',
    'Should', 'Must', 'Does', 'Done', 'Here', 'There', 'Document', 'File', 'Page', 'And', 'For', 'Are', 'Not'
  ]);

  for (const chunk of chunkedSlices) {
    const boldTokens = (chunk.text.match(/\*\*([^*]+)\*\*/g) || [])
      .map(b => cleanEntityLabel(b.replace(/\*\*/g, '')))
      .filter((b): b is string => Boolean(b) && !stopWords.has(b));

    const capitalizedWords = (chunk.text.match(/\b[A-Z][a-zA-Z0-9_\-']+(?:\s+[A-Z][a-zA-Z0-9_\-']+)*\b/g) || [])
      .map(w => cleanEntityLabel(w))
      .filter((w): w is string => Boolean(w) && !stopWords.has(w));

    let candidateEntities = Array.from(
      new Set([
        ...boldTokens,
        ...capitalizedWords
      ])
    );

    if (candidateEntities.length < 2) {
      const words = chunk.text.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
      const freq: Record<string, number> = {};
      words.forEach(w => {
        const wordClean = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        if (!stopWords.has(wordClean)) {
          freq[wordClean] = (freq[wordClean] || 0) + 1;
        }
      });
      const topWords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([w]) => cleanEntityLabel(w))
        .filter((w): w is string => Boolean(w));
      candidateEntities = Array.from(new Set([...candidateEntities, ...topWords]));
    }

    const extractedLabels: string[] = [];
    for (const ent of candidateEntities) {
      try {
        let type: NodeType = "Other";
        const lCase = ent.toLowerCase();
        if (lCase.includes('team') || lCase.includes('group') || lCase.includes('department')) type = "Team";
        else if (lCase.includes('database') || lCase.includes('cloud') || lCase.includes('model') || lCase.includes('api') || lCase.includes('pipeline') || lCase.includes('python') || lCase.includes('sagemaker') || lCase.includes('kafka') || lCase.includes('aws') || lCase.includes('gcp') || lCase.includes('docker') || lCase.includes('tensorflow') || lCase.includes('pytorch')) type = "Technology";
        else if (lCase.includes('inc') || lCase.includes('corp') || lCase.includes('analytics') || lCase.includes('company') || lCase.includes('ltd') || lCase.includes('ministry') || lCase.includes('accenture') || lCase.includes('lumiq') || lCase.includes('securelayer7') || lCase.includes('university') || lCase.includes('college') || lCase.includes('school')) type = "Organization";
        else if (lCase.includes('forecast') || lCase.includes('alert') || lCase.includes('twin') || lCase.includes('search') || lCase.includes('detector') || lCase.includes('system') || lCase.includes('module') || lCase.includes('dashboard') || lCase.includes('solution') || lCase.includes('rag')) type = "Feature";
        else if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(ent)) type = "Person";

        await executeCurationTool("create_or_update_entity", { label: ent, type, chunkId: chunk.id }, docId, docName, db);
        extractedLabels.push(ent);
        createdCount++;
      } catch (e) {}
    }

    if (primaryDocLabel && primaryDocLabel.length > 1) {
      for (const ent of extractedLabels) {
        if (slugify(ent) !== primaryDocId) {
          try {
            await executeCurationTool("create_relationship", {
              sourceId: primaryDocLabel,
              relation: "contains concept",
              targetId: ent,
              chunkId: chunk.id
            }, docId, docName, db);
            relCount++;
          } catch (e) {}
        }
      }
    }

    for (let i = 0; i < extractedLabels.length - 1; i++) {
      try {
        await executeCurationTool("create_relationship", {
          sourceId: extractedLabels[i],
          relation: "associated with",
          targetId: extractedLabels[i + 1],
          chunkId: chunk.id
        }, docId, docName, db);
        relCount++;
      } catch (e) {}
    }
  }

  if (!targetDb) {
    writeDB(db);
  }

  return { createdCount, relCount };
}

export async function sanitizeDatabaseDocuments() {
  const db = readDB();
  let modified = false;

  for (const doc of db.documents) {
    if (doc.content && (doc.content.startsWith('data:application/pdf') || (doc.content.length > 200 && doc.content.slice(0, 100).includes('base64')))) {
      try {
        const base64Data = doc.content.replace(/^data:application\/pdf;base64,/, '');
        const pdfBuffer = Buffer.from(base64Data, 'base64');
        const markdown = await convertPdfToMarkdown(pdfBuffer, doc.name, process.env.GEMINI_API_KEY);
        doc.content = markdown;
        doc.curationLogs = doc.curationLogs || [];
        doc.curationLogs.push("Sanitizer: Converted raw PDF base-64 into clean Markdown format.");
        
        const existingChunks = db.chunks.filter(c => c.docId !== doc.id);
        const sentenceRegex = /[^.!?\n]+[.!?\n]*/g;
        const rawSentences = markdown.match(sentenceRegex) || [markdown];
        const cleanSentences = rawSentences.map((s: string) => s.trim()).filter((s: string) => s.length > 3);
        const groupedTexts: string[] = [];
        const GROUP_SIZE = 3;
        for (let i = 0; i < cleanSentences.length; i += GROUP_SIZE) {
          groupedTexts.push(cleanSentences.slice(i, i + GROUP_SIZE).join(" "));
        }
        if (groupedTexts.length === 0) groupedTexts.push(markdown.trim());
        const newChunks: Chunk[] = groupedTexts.map((text: string, idx: number) => ({
          id: `${doc.id}-${idx + 1}`,
          docId: doc.id,
          text
        }));
        db.chunks = [...existingChunks, ...newChunks];
        modified = true;
      } catch (err: any) {
        console.error(`[Sanitizer] Error converting document ${doc.id}:`, err?.message || err);
        doc.content = convertExtractedTextToMarkdown('', doc.name);
        modified = true;
      }
    }
  }

  // Clean existing graph nodes that have noisy or excessively long sentence labels
  for (const node of db.nodes) {
    let cleanLabel = cleanEntityLabel(node.label);
    if (!cleanLabel && node.label.length > 35) {
      cleanLabel = node.label.split(/[:\-\.\?,;]|\b(?:was|is|in|for|with|by|after|that)\b/i)[0].trim();
      if (cleanLabel.length > 35) cleanLabel = cleanLabel.slice(0, 35).trim();
    }
    if (cleanLabel && cleanLabel !== node.label) {
      node.label = cleanLabel;
      modified = true;
    }
  }

  if (modified) {
    writeDB(db);
  }
}
