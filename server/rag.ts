import { Chunk, Link } from "../src/types.js";
import { DBStructure } from "./db.js";
import { tokenize } from "./parsers.js";

export interface IndexData {
  idf: Record<string, number>;
  vectors: Record<string, Record<string, number>>;
}

export function buildTfIdfIndex(chunks: Chunk[]): IndexData {
  const N = chunks.length || 1;
  const df: Record<string, number> = {};
  const tokensByChunk = chunks.map(c => tokenize(c.text));

  tokensByChunk.forEach(toks => {
    new Set(toks).forEach(t => {
      df[t] = (df[t] || 0) + 1;
    });
  });

  const idf: Record<string, number> = {};
  Object.keys(df).forEach(t => {
    idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1;
  });

  const vectors: Record<string, Record<string, number>> = {};
  chunks.forEach((c, i) => {
    const tf: Record<string, number> = {};
    tokensByChunk[i].forEach(t => {
      tf[t] = (tf[t] || 0) + 1;
    });

    const vec: Record<string, number> = {};
    Object.keys(tf).forEach(t => {
      vec[t] = tf[t] * (idf[t] || 0);
    });

    let sumSq = 0;
    Object.values(vec).forEach(v => {
      sumSq += v * v;
    });
    const norm = Math.sqrt(sumSq) || 1;

    const normVec: Record<string, number> = {};
    Object.keys(vec).forEach(k => {
      normVec[k] = vec[k] / norm;
    });
    vectors[c.id] = normVec;
  });

  return { idf, vectors };
}

export function vectorizeQuery(query: string, idf: Record<string, number>): { vec: Record<string, number>; terms: Set<string> } {
  const toks = tokenize(query);
  const tf: Record<string, number> = {};
  toks.forEach(t => {
    tf[t] = (tf[t] || 0) + 1;
  });

  const vec: Record<string, number> = {};
  Object.keys(tf).forEach(t => {
    if (idf[t]) {
      vec[t] = tf[t] * idf[t];
    }
  });

  let sumSq = 0;
  Object.values(vec).forEach(v => {
    sumSq += v * v;
  });
  const norm = Math.sqrt(sumSq) || 1;

  const normVec: Record<string, number> = {};
  Object.keys(vec).forEach(k => {
    normVec[k] = vec[k] / norm;
  });

  return { vec: normVec, terms: new Set(toks) };
}

export function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0;
  const keys = Object.keys(a).length < Object.keys(b).length ? Object.keys(a) : Object.keys(b);
  keys.forEach(k => {
    if (a[k] !== undefined && b[k] !== undefined) {
      dot += a[k] * b[k];
    }
  });
  return dot;
}

export function queryGraphWithWalk(db: DBStructure, query: string) {
  if (db.nodes.length === 0) {
    return { seeds: [], retrievedNodes: [], retrievedEdges: [], nodeReasons: {}, edgeReasons: {}, whyText: "The knowledge graph is currently empty." };
  }

  // 1. Build TF-IDF
  const { idf, vectors } = buildTfIdfIndex(db.chunks);
  const { vec: qvec, terms: qterms } = vectorizeQuery(query, idf);

  // 2. Score nodes by matching chunks
  const scoredNodes = db.nodes.map(n => {
    let bestScore = 0;
    n.chunkIds.forEach(cid => {
      const vec = vectors[cid] || {};
      const score = cosineSimilarity(qvec, vec);
      if (score > bestScore) {
        bestScore = score;
      }
    });

    const labelToks = tokenize(n.label);
    const overlap = labelToks.some(t => qterms.has(t));
    const finalScore = bestScore + (overlap ? 0.4 : 0);

    return { node: n, score: finalScore };
  }).filter(s => s.score > 0.05)
    .sort((a, b) => b.score - a.score);

  const seeds = scoredNodes.slice(0, 3).map(s => s.node.id);
  const seedIdsSet = new Set(seeds);

  if (seeds.length === 0) {
    return {
      seeds: [],
      retrievedNodes: [],
      retrievedEdges: [],
      nodeReasons: {},
      edgeReasons: {},
      whyText: "No entities matched query terms. Try searching for specific names or concepts from your ingested files."
    };
  }

  const nodeReasons: Record<string, string> = {};
  seeds.forEach(sid => {
    const sNode = db.nodes.find(n => n.id === sid);
    const scoredItem = scoredNodes.find(s => s.node.id === sid);
    if (!sNode || !scoredItem) return;
    const matchedTerms = tokenize(sNode.label).filter(t => qterms.has(t));

    nodeReasons[sid] = matchedTerms.length > 0
      ? `Query Seed: Direct naming match on '${matchedTerms.join(', ')}' (relevance score: ${scoredItem.score.toFixed(2)}).`
      : `Context Seed: Discovered via high text chunk relevance (similarity: ${scoredItem.score.toFixed(2)}).`;
  });

  // 1-hop traversal
  const candidateLinks = db.links.filter(l => {
    const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
    const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
    return seedIdsSet.has(s) || seedIdsSet.has(t);
  }).map(l => {
    const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
    const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
    const relationTerms = tokenize(l.relation).filter(term => qterms.has(term));

    let weight = 1;
    if (seedIdsSet.has(s) && seedIdsSet.has(t)) weight = 4;
    else if (relationTerms.length > 0) weight = 3;

    return { link: l, source: s, target: t, weight };
  }).sort((a, b) => b.weight - a.weight);

  const retrievedNodesSet = new Set<string>(seeds);
  const retrievedEdges: string[] = [];
  const edgeReasons: Record<string, string> = {};

  for (const c of candidateLinks) {
    if (retrievedNodesSet.size >= 9 && (!retrievedNodesSet.has(c.source) || !retrievedNodesSet.has(c.target))) {
      continue;
    }

    retrievedEdges.push(c.link.id);
    retrievedNodesSet.add(c.source);
    retrievedNodesSet.add(c.target);

    if (c.weight === 4) {
      edgeReasons[c.link.id] = `Strong association: Connects two direct search seeds: '${db.nodes.find(n => n.id === c.source)?.label}' and '${db.nodes.find(n => n.id === c.target)?.label}'.`;
    } else if (c.weight === 3) {
      edgeReasons[c.link.id] = `Active Relation: The relation type '${c.link.relation}' directly matches key search keywords in your question.`;
    } else {
      const seedName = seedIdsSet.has(c.source) ? db.nodes.find(n => n.id === c.source)?.label : db.nodes.find(n => n.id === c.target)?.label;
      edgeReasons[c.link.id] = `First-order link: Expands graph scope from retrieved anchor node: '${seedName}'.`;
    }

    [c.source, c.target].forEach(nid => {
      if (!nodeReasons[nid]) {
        const linkWithSeed = seedIdsSet.has(c.source) ? c.source : c.target;
        const anchorNodeName = db.nodes.find(n => n.id === linkWithSeed)?.label;
        nodeReasons[nid] = `Expanded Link: Walked first-order edge from seed '${anchorNodeName}' through relation '${c.link.relation}'.`;
      }
    });

    if (retrievedNodesSet.size >= 9 && retrievedEdges.length >= 10) break;
  }

  const whyText = `Identified ${seeds.length} direct anchor seeds in the graph matching query vectors. Expanded graph scope to pull in ${retrievedEdges.length} high-probability adjacent relations. All irrelevant context nodes have been filtered to focus generation.`;

  return {
    seeds,
    retrievedNodes: Array.from(retrievedNodesSet),
    retrievedEdges,
    nodeReasons,
    edgeReasons,
    whyText
  };
}
