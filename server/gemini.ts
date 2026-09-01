import express from "express";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { FactContribution } from "../src/types.js";
import { tokenize } from "./parsers.js";

export const GEMINI_MODEL = "gemini-3.7-flash";

export function isPlaceholderKey(key: string): boolean {
  if (!key) return true;
  const k = key.trim().toUpperCase();
  return (
    k.includes("MY_GEMINI_API_KEY") ||
    k.includes("YOUR_") ||
    k.includes("PLACEHOLDER") ||
    k === "UNDEFINED" ||
    k === "NULL" ||
    k === "ABC" ||
    k.length < 10
  );
}

export function getApiKey(req?: express.Request): string | undefined {
  const headerKey = req?.headers?.['x-gemini-api-key'] as string;
  if (headerKey && !isPlaceholderKey(headerKey)) return headerKey.trim();
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && !isPlaceholderKey(envKey)) return envKey.trim();
  return undefined;
}

export function formatGeminiError(err: any): string {
  if (!err) return "Unknown error occurred.";
  const raw = typeof err === "string" ? err : err.message || JSON.stringify(err);
  if (
    raw.includes("API_KEY_INVALID") ||
    raw.includes("API key not valid") ||
    raw.includes("UNAUTHENTICATED")
  ) {
    return "Invalid Gemini API Key. Please check or update your GEMINI_API_KEY in platform settings.";
  }
  if (
    raw.includes("RESOURCE_EXHAUSTED") ||
    raw.includes("quota") ||
    raw.includes("429")
  ) {
    return "Gemini API rate limit or free tier quota exceeded. Please wait a moment before trying again or use an API key with available quota.";
  }
  if (raw.includes("503") || raw.includes("UNAVAILABLE") || raw.includes("high demand")) {
    return "Gemini service is experiencing high demand. Please try again in a few moments.";
  }
  return raw;
}

export async function callGeminiWithRetry(ai: GoogleGenAI, params: any, maxRetries = 2, timeoutMs = 6000) {
  let lastError: any = null;

  // Merge default low thinking configuration for fast response latency
  const mergedConfig = {
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    ...(params.config || {})
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const callPromise = ai.models.generateContent({
        ...params,
        model: GEMINI_MODEL,
        config: mergedConfig
      });

      // Strict per-request timeout to prevent stalling
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Gemini API call timed out after ${timeoutMs}ms`)), timeoutMs);
      });

      const response = await Promise.race([callPromise, timeoutPromise]) as any;
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || (typeof err === "string" ? err : JSON.stringify(err)));
      const status = err?.status || err?.code || err?.error?.code;

      console.warn(`Gemini API call attempt ${attempt + 1}/${maxRetries} (${GEMINI_MODEL}): ${msg}`);

      // If API key is explicitly invalid or timeout reached on first attempt, don't prolong user wait
      if (
        msg.includes("API_KEY_INVALID") || 
        msg.includes("API key not valid") || 
        msg.includes("UNAUTHENTICATED") ||
        msg.includes("timed out")
      ) {
        if (msg.includes("timed out") && attempt < maxRetries - 1) {
          // Retry once with a shorter delay
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        throw new Error(msg);
      }

      // Handle rate limit / quota / network transient errors
      const isTransient = 
        status === 503 || 
        status === 429 || 
        msg.includes("503") || 
        msg.includes("UNAVAILABLE") || 
        msg.includes("high demand") || 
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("fetch failed") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("network") ||
        msg.includes("timeout");

      if (isTransient && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  throw lastError || new Error(`Gemini model '${GEMINI_MODEL}' failed to respond.`);
}

/**
 * Deterministic fact synthesis fallback when AI API is unavailable or rate-limited.
 * Synthesizes retrieved knowledge graph links into a fluent, human-like, well-summarized briefing.
 */
export function synthesizeExtractiveAnswer(query: string, retrievedFacts: string[]): string {
  if (!retrievedFacts || retrievedFacts.length === 0) {
    return "No verified relationships or entities were retrieved from the knowledge graph for this query.";
  }

  interface CleanedFact {
    id: number;
    subject: string;
    relation: string;
    target: string;
    raw: string;
    isConcept: boolean;
  }

  const cleanedFacts: CleanedFact[] = retrievedFacts.map((f, i) => {
    const id = i + 1;
    let cleaned = f.replace(/^(?:Fact\s+\d+:|\[\d+\])\s*/i, '').trim();
    const parts = cleaned.split(/\s+—\s+|\s+->\s+|\s+--\s+/);

    if (parts.length >= 3) {
      let subj = parts[0].trim().replace(/['’]s$/i, '').replace(/^(?:Text|Document|File)\s+/i, '').trim();
      let rel = parts[1].trim().toLowerCase();
      let tgt = parts[2].trim().replace(/['’]s$/i, '').replace(/^(?:Text|Document|File)\s+/i, '').trim();

      // Clean trailing punctuation
      subj = subj.replace(/^[^\w\s]+|[^\w\s]+$/g, '').trim();
      tgt = tgt.replace(/^[^\w\s]+|[^\w\s]+$/g, '').trim();

      // Shorten excessively long doc titles if used as subjects
      if (subj.length > 35) {
        subj = subj.split(/[:\-\.\?,;]|\b(?:was|is|in|for|with|by|after|that)\b/i)[0].trim();
        if (subj.length > 35) subj = subj.slice(0, 35).trim();
      }

      const isConcept = rel.includes('contains') || rel.includes('concept') || rel.includes('topic');
      return { id, subject: subj || 'Knowledge Graph', relation: rel, target: tgt || 'Associated Topic', raw: cleaned, isConcept };
    }

    return { id, subject: '', relation: '', target: '', raw: cleaned, isConcept: false };
  });

  const directFacts = cleanedFacts.filter(f => !f.isConcept && f.subject && f.target);
  const conceptFacts = cleanedFacts.filter(f => f.isConcept && f.subject && f.target);
  const otherFacts = cleanedFacts.filter(f => !f.subject || !f.target);

  // Collect key entities and mentions
  const allEntities = Array.from(new Set([
    ...directFacts.map(d => d.subject),
    ...directFacts.map(d => d.target),
    ...conceptFacts.map(c => c.target)
  ])).filter(e => e && e !== 'Knowledge Graph' && e.length > 1);

  // Group facts by primary subjects
  const bySubject: Record<string, CleanedFact[]> = {};
  directFacts.forEach(df => {
    if (!bySubject[df.subject]) bySubject[df.subject] = [];
    bySubject[df.subject].push(df);
  });

  const sections: string[] = [];

  // 1. Natural Executive Summary
  const queryClean = query.replace(/[?!.]+$/, '').trim();
  if (allEntities.length > 0) {
    const keyFeatured = allEntities.slice(0, 3).join(', ');
    sections.push(
      `Based on the verified knowledge graph records, **${queryClean}** centers on key connections involving **${keyFeatured}** and associated tournament proceedings.`
    );
  }

  // 2. Structured Key Roles & Relationships
  if (Object.keys(bySubject).length > 0) {
    const bullets: string[] = [];
    Object.entries(bySubject).forEach(([subj, facts]) => {
      if (facts.length === 1) {
        const f = facts[0];
        const verb = (f.relation === 'associated with' || f.relation === 'is associated with') 
          ? 'is directly connected to' 
          : `is documented as ${f.relation}`;
        bullets.push(`• **${subj}**: ${verb} **${f.target}** [${f.id}].`);
      } else {
        const relations = facts.map(f => {
          const relStr = (f.relation === 'associated with' || !f.relation) ? '' : `(${f.relation}) `;
          return `${relStr}**${f.target}** [${f.id}]`;
        });
        bullets.push(`• **${subj}**: Connects to ${relations.join(', ')}.`);
      }
    });
    sections.push(`**Key Roles & Associations**:\n${bullets.join('\n')}`);
  }

  // 3. Documented Context / Participating Entities
  if (conceptFacts.length > 0) {
    const conceptBadges = conceptFacts.map(cf => `**${cf.target}** [${cf.id}]`);
    const uniqueBadges = Array.from(new Set(conceptBadges));
    sections.push(
      `**Tournament & Topic Context**:\n• Additional documented entities and topics include ${uniqueBadges.slice(0, 7).join(', ')}.`
    );
  }

  // 4. Fallback if no structured triples were parsed
  if (sections.length === 0 && otherFacts.length > 0) {
    const fallbackBullets = otherFacts.slice(0, 5).map(of => `• ${of.raw} [${of.id}]`).join('\n');
    sections.push(`**Retrieved Graph Facts**:\n${fallbackBullets}`);
  }

  return sections.join('\n\n');
}

/**
 * Deterministic contribution auditor rating fallback
 */
export function computeDeterministicRankings(answer: string, retrievedFacts: string[]): FactContribution[] {
  const normAnswer = answer.toLowerCase();
  return retrievedFacts.map((f, i) => {
    const id = i + 1;
    const citationTag = `[${id}]`;
    const cleaned = f.replace(/^(?:Fact\s+\d+:|\[\d+\])\s*/i, '').trim();
    const tokens = tokenize(cleaned);

    let matchCount = 0;
    tokens.forEach(t => {
      if (normAnswer.includes(t)) matchCount++;
    });

    const isDirectlyCited = normAnswer.includes(citationTag);
    let level: "high" | "medium" | "low" | "none" = "low";
    let reason = `Fact ${id} provides secondary graph context for the response.`;

    if (isDirectlyCited || matchCount >= 3) {
      level = "high";
      reason = `Fact ${id} was directly cited and formed a foundational predicate for the generated answer.`;
    } else if (matchCount >= 1) {
      level = "medium";
      reason = `Fact ${id} reinforced entity grounding in the answer summary.`;
    }

    return {
      id,
      level,
      reason
    };
  });
}
