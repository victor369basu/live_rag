import * as pdfParse from "pdf-parse";
import { GoogleGenAI } from "@google/genai";
import { Chunk, NodeType } from "../src/types.js";
import { slugify } from "./db.js";

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
  records: Record<string, string>[];
}

/**
 * Robust RFC 4180 compliant CSV parser supporting quotes, commas, escapes, and delimiters.
 */
export function parseCSV(text: string): ParsedCSV {
  if (!text || !text.trim()) {
    return { headers: [], rows: [], records: [] };
  }

  // Detect delimiter: check first line for comma, semicolon, or tab
  const firstLine = text.split(/\r\n|\r|\n/)[0] || '';
  let delimiter = ',';
  if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) {
    delimiter = ';';
  } else if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length) {
    delimiter = '\t';
  }

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [], records: [] };
  }

  // Sanitize headers
  const rawHeaders = lines[0];
  const headers = rawHeaders.map((h, idx) => {
    const cleanH = h.replace(/^["']|["']$/g, '').trim();
    return cleanH || `Column_${idx + 1}`;
  });

  // Limit processing to max 1,000 rows to ensure optimal performance and avoid browser/memory overload
  const rows = lines.slice(1, 1001).map(row => {
    return headers.map((_, idx) => {
      const val = row[idx] !== undefined ? row[idx].replace(/^["']|["']$/g, '').trim() : '';
      return val;
    });
  });

  const records = rows.map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] || '';
    });
    return obj;
  });

  return { headers, rows, records };
}

/**
 * Converts structured CSV dataset into clean GitHub-Flavored Markdown.
 */
export function convertCsvToMarkdown(parsed: ParsedCSV, fileName: string): string {
  const { headers, rows } = parsed;
  const cleanTitle = fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]/g, " ")
    .trim();

  if (headers.length === 0 || rows.length === 0) {
    return `# ${cleanTitle}\n\n*Empty CSV dataset.*`;
  }

  const parts: string[] = [];
  parts.push(`# ${cleanTitle}`);
  parts.push(`\n**Tabular Dataset Summary**: ${rows.length} total records, ${headers.length} attributes (${headers.join(', ')}).\n`);

  // Build Markdown table (preview up to 50 rows in table for UI clarity and fast rendering)
  const tableRows = rows.slice(0, 50);
  const headerLine = `| ${headers.map(h => h.replace(/\|/g, '\\|')).join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataLines = tableRows.map(row => {
    return `| ${headers.map((_, i) => (row[i] || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`;
  });

  parts.push(headerLine);
  parts.push(dividerLine);
  parts.push(...dataLines);

  if (rows.length > 50) {
    parts.push(`\n*... and ${rows.length - 50} more records indexed in knowledge graph.*`);
  }

  // Add semantic record breakdown for granular chunk search & citation (top 60 records)
  parts.push(`\n## Record Details`);
  rows.slice(0, 60).forEach((row, idx) => {
    const primary = row[0] || `Record ${idx + 1}`;
    parts.push(`\n### Item ${idx + 1}: ${primary}`);
    headers.forEach((h, cIdx) => {
      const val = row[cIdx];
      if (val && val.trim()) {
        parts.push(`- **${h}**: ${val}`);
      }
    });
  });

  return parts.join('\n');
}

/**
 * Creates semantic chunks for CSV records (grouping 5-10 rows with headers for context).
 */
export function chunkCsvData(parsed: ParsedCSV, docId: string, docName: string): Chunk[] {
  const { headers, rows } = parsed;
  const chunks: Chunk[] = [];
  const ROWS_PER_CHUNK = 5;
  const MAX_CHUNKS = 25; // Capped to 25 chunks (125 records) to maintain instantaneous RAG & graph performance

  if (rows.length === 0) {
    return [{
      id: `${docId}-1`,
      docId,
      text: `# ${docName}\n\nEmpty CSV document.`
    }];
  }

  const cappedRows = rows.slice(0, MAX_CHUNKS * ROWS_PER_CHUNK);

  for (let i = 0; i < cappedRows.length; i += ROWS_PER_CHUNK) {
    const slice = cappedRows.slice(i, i + ROWS_PER_CHUNK);
    const chunkNum = Math.floor(i / ROWS_PER_CHUNK) + 1;
    
    const lines: string[] = [];
    lines.push(`[Dataset ${docName} - Rows ${i + 1} to ${Math.min(i + slice.length, rows.length)}]`);
    
    slice.forEach((row, rIdx) => {
      const rowIdx = i + rIdx + 1;
      const primary = row[0] || `Record ${rowIdx}`;
      const attributes = headers
        .map((h, cIdx) => row[cIdx] ? `${h}: ${row[cIdx]}` : '')
        .filter(Boolean)
        .join(' | ');
      lines.push(`Record ${rowIdx} (${primary}): ${attributes}`);
    });

    chunks.push({
      id: `${docId}-${chunkNum}`,
      docId,
      text: lines.join('\n')
    });
  }

  return chunks;
}

export function classifyTypeByHeader(header: string, value: string): NodeType {
  const h = header.toLowerCase();
  if (h.includes('person') || h.includes('employee') || h.includes('author') || h.includes('lead') || h.includes('manager') || h.includes('ceo') || h.includes('user') || h.includes('founder') || h.includes('engineer') || h.includes('director')) return "Person";
  if (h.includes('company') || h.includes('org') || h.includes('vendor') || h.includes('partner') || h.includes('institution') || h.includes('supplier') || h.includes('client') || h.includes('university') || h.includes('school')) return "Organization";
  if (h.includes('team') || h.includes('department') || h.includes('dept') || h.includes('group') || h.includes('division')) return "Team";
  if (h.includes('technology') || h.includes('tool') || h.includes('tech') || h.includes('language') || h.includes('lang') || h.includes('framework') || h.includes('db') || h.includes('database') || h.includes('cloud') || h.includes('model') || h.includes('platform')) return "Technology";
  if (h.includes('feature') || h.includes('capability') || h.includes('module') || h.includes('service') || h.includes('system') || h.includes('metric') || h.includes('status')) return "Feature";
  if (h.includes('product') || h.includes('item') || h.includes('asset') || h.includes('project') || h.includes('application') || h.includes('app')) return "Product";

  return classifyTypeByValue(value, '');
}

export function classifyTypeByValue(val: string, explicitType?: string): NodeType {
  if (explicitType) {
    const t = explicitType.trim();
    if (['Person', 'Organization', 'Team', 'Product', 'Technology', 'Feature', 'Other'].includes(t)) {
      return t as NodeType;
    }
  }

  const lCase = val.toLowerCase();
  if (lCase.includes('team') || lCase.includes('group') || lCase.includes('department')) return "Team";
  if (lCase.includes('database') || lCase.includes('cloud') || lCase.includes('model') || lCase.includes('api') || lCase.includes('python') || lCase.includes('aws') || lCase.includes('gcp') || lCase.includes('docker') || lCase.includes('react') || lCase.includes('sql') || lCase.includes('kafka')) return "Technology";
  if (lCase.includes('inc') || lCase.includes('corp') || lCase.includes('analytics') || lCase.includes('company') || lCase.includes('ltd') || lCase.includes('accenture') || lCase.includes('lumiq') || lCase.includes('university') || lCase.includes('hospital')) return "Organization";
  if (lCase.includes('forecast') || lCase.includes('alert') || lCase.includes('twin') || lCase.includes('search') || lCase.includes('module') || lCase.includes('dashboard') || lCase.includes('pipeline')) return "Feature";
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(val)) return "Person";

  return "Other";
}

export function getRelationVerbForHeader(header: string): string {
  const h = header.toLowerCase();
  if (h.includes('department') || h.includes('dept')) return "belongs to department";
  if (h.includes('team')) return "member of";
  if (h.includes('role') || h.includes('title') || h.includes('position')) return "has role";
  if (h.includes('manager') || h.includes('lead') || h.includes('supervisor')) return "reports to";
  if (h.includes('company') || h.includes('org') || h.includes('employer')) return "works at";
  if (h.includes('vendor') || h.includes('supplier')) return "supplied by";
  if (h.includes('category') || h.includes('genre')) return "categorized as";
  if (h.includes('status')) return "has status";
  if (h.includes('location') || h.includes('city') || h.includes('country') || h.includes('region')) return "located in";
  if (h.includes('technology') || h.includes('tool') || h.includes('language') || h.includes('stack')) return "uses";
  if (h.includes('project') || h.includes('initiative')) return "contributes to";
  if (h.includes('skill') || h.includes('expertise')) return "proficient in";
  if (h.includes('price') || h.includes('cost')) return "priced at";

  return `has ${header.toLowerCase().trim()}`;
}

/**
 * Converts extracted raw PDF or plain text into clean, structured standard Markdown.
 */
export function convertExtractedTextToMarkdown(rawText: string, fileName: string): string {
  const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
  
  if (!rawText || !rawText.trim()) {
    return `# ${cleanTitle}\n\n*No readable text extracted from document.*`;
  }

  // 1. Normalize line endings and remove null/control bytes
  let text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '');

  // 2. Remove typical PDF pagination & repeating header/footer patterns
  text = text
    .replace(/\n\s*Page\s+\d+\s+(?:of|\/)\s+\d+\s*\n/gi, '\n')
    .replace(/\n\s*-\s*\d+\s*-\s*\n/g, '\n')
    .replace(/\n\s*\d+\s*\n(?=[A-Z])/g, '\n\n');

  // 3. Fix hyphenated line breaks
  text = text.replace(/(\b[A-Za-z]+)-\n([A-Za-z]+\b)/g, '$1$2');

  const rawLines = text.split('\n');
  const formattedLines: string[] = [];
  let inList = false;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const line = rawLine.trim();

    if (!line) {
      formattedLines.push('');
      inList = false;
      continue;
    }

    // Header detections
    const isNumberedHeading = /^(?:\d+\.|\d+\.\d+|\d+\.\d+\.\d+)\s+[A-Z]/.test(line);
    const isAllCapsHeading = line.length > 2 && line.length < 60 && line === line.toUpperCase() && /[A-Z]/.test(line) && !line.includes(':') && !line.includes('http');
    const isShortSectionHeader = line.length > 2 && line.length < 45 && /^[A-Z][a-zA-Z0-9\s&,/-]{2,40}$/.test(line) && !line.endsWith('.') && !line.includes(':') && (i === 0 || rawLines[i-1]?.trim() === '');

    // Bullet point detections
    const bulletMatch = line.match(/^[\u2022\u25E6\u25AA\u2023\*\-]\s*(.*)$/);
    const numberedListMatch = line.match(/^(\d+[\.\)])\s+(.*)$/);

    if (isNumberedHeading) {
      formattedLines.push(`\n## ${line}\n`);
      inList = false;
    } else if (isAllCapsHeading) {
      const titleCase = line.charAt(0) + line.slice(1).toLowerCase().replace(/\b([a-z])/g, l => l.toUpperCase());
      formattedLines.push(`\n## ${titleCase}\n`);
      inList = false;
    } else if (isShortSectionHeader && !inList && i < rawLines.length - 1) {
      formattedLines.push(`\n### ${line}\n`);
      inList = false;
    } else if (bulletMatch) {
      formattedLines.push(`- ${bulletMatch[1]}`);
      inList = true;
    } else if (numberedListMatch) {
      formattedLines.push(`${numberedListMatch[1]} ${numberedListMatch[2]}`);
      inList = true;
    } else if (line.includes(':') && line.split(':')[0].length < 30 && !line.startsWith('http')) {
      const colonIndex = line.indexOf(':');
      const key = line.slice(0, colonIndex).trim();
      const val = line.slice(colonIndex + 1).trim();
      formattedLines.push(`- **${key}**: ${val}`);
      inList = true;
    } else {
      formattedLines.push(line);
      inList = false;
    }
  }

  let finalMarkdown = formattedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!finalMarkdown.startsWith('#')) {
    finalMarkdown = `# ${cleanTitle}\n\n${finalMarkdown}`;
  }

  return finalMarkdown;
}

/**
 * Extracts PDF text and formats it as Markdown.
 */
export async function convertPdfToMarkdown(pdfBuffer: Buffer, fileName: string, apiKey?: string): Promise<string> {
  let rawText = '';
  try {
    const parsePdf = (pdfParse as any).default || pdfParse;
    const pdfParsed = await parsePdf(pdfBuffer);
    if (pdfParsed && pdfParsed.text) {
      rawText = pdfParsed.text;
    }
  } catch (err: any) {
    console.warn('PDF parse extraction warning:', err?.message || err);
  }

  const fallbackMarkdown = convertExtractedTextToMarkdown(rawText, fileName);

  if (apiKey && rawText && rawText.trim().length > 30) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Convert the following extracted text from "${fileName}" into clean, beautifully structured GitHub-Flavored Markdown. 
Keep all substantive facts, headings, names, bullet points, numbers, and technical specifications intact.
Do not add unsolicited preamble or conversational commentary. Output ONLY valid markdown.

Extracted Text:
${rawText.slice(0, 15000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });

      if (response.text && response.text.trim().length > 20) {
        let cleaned = response.text.trim();
        if (cleaned.startsWith("```markdown")) {
          cleaned = cleaned.replace(/^```markdown\s*/i, "").replace(/\s*```$/i, "").trim();
        } else if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```(?:[a-z]+)?\s*/i, "").replace(/\s*```$/i, "").trim();
        }
        return cleaned;
      }
    } catch (aiErr: any) {
      console.warn("AI PDF markdown enhancement skipped/fallback used:", aiErr?.message || aiErr);
    }
  }

  return fallbackMarkdown;
}

export const STOPWORDS = new Set("a an the of to in on for and or is are was were be been being with that this these those how what which why does do did into out over near at by as it its their his her from than then so about can could would used use uses using who whom whose".split(' '));

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOPWORDS.has(t));
}
