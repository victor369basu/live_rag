/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { Document, Node } from '../types';
import { 
  X, 
  FileText, 
  Copy, 
  Check, 
  Database, 
  Layers, 
  ExternalLink,
  Search,
  Sparkles,
  BookOpen,
  Code,
  Trash2
} from 'lucide-react';

interface FilePreviewModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  associatedNodes?: Node[];
  onSelectForLedger?: (docId: string) => void;
  onDeleteDocument?: (docId: string) => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  document,
  isOpen,
  onClose,
  associatedNodes = [],
  onSelectForLedger,
  onDeleteDocument
}) => {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [viewMode, setViewMode] = useState<'markdown' | 'raw'>('markdown');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset confirm state on open/close
  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset copied state when document changes
  useEffect(() => {
    setCopied(false);
    setSearchTerm('');
  }, [document]);

  if (!isOpen || !document) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(document.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API fails
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lines = (document.content || '').split('\n');
  const wordCount = (document.content || '').trim().split(/\s+/).filter(Boolean).length;
  const charCount = (document.content || '').length;

  let stateBadgeColor = 'bg-stone-500/10 text-stone-400 border-stone-500/20';
  if (document.status === 'done') stateBadgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (document.status === 'pending') stateBadgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse';
  if (document.status === 'error') stateBadgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';

  const isPdf = document.name.toLowerCase().endsWith('.pdf');
  const isCsv = document.name.toLowerCase().endsWith('.csv') || document.name.toLowerCase().endsWith('.tsv');

  return (
    <div 
      id="file-preview-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="file-preview-modal-container"
        className="bg-panel-bg border border-border-dark w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-200 animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border-dark bg-card-bg flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold font-mono text-gray-100 truncate">
                  {document.name}
                </h3>
                <span className="text-[10px] font-mono font-bold bg-neutral-800 text-gray-400 px-2 py-0.5 rounded border border-border-dark">
                  ID: {document.id}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${stateBadgeColor}`}>
                  {document.status.toUpperCase()}
                </span>
                {isPdf && (
                  <span className="text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                    Markdown (PDF Converted)
                  </span>
                )}
                {isCsv && (
                  <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                    Tabular Dataset (CSV Parsed)
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                Ingested Markdown Document &amp; Graph Source Viewer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              id="file-preview-modal-close-btn"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-100 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-border-dark"
              title="Close modal (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Metadata Bar */}
        <div className="px-4 py-2.5 bg-brand-bg/80 border-b border-border-dark flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3 text-gray-400 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="text-gray-200 font-semibold">{wordCount}</span> words
            </span>
            <span className="text-border-dark">•</span>
            <span className="flex items-center gap-1">
              <span className="text-gray-200 font-semibold">{charCount}</span> chars
            </span>
            <span className="text-border-dark">•</span>
            <span className="flex items-center gap-1">
              <span className="text-gray-200 font-semibold">{lines.length}</span> lines
            </span>
            {associatedNodes.length > 0 && (
              <>
                <span className="text-border-dark">•</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="font-semibold">{associatedNodes.length}</span> entities
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-neutral-900 border border-border-dark rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('markdown')}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded cursor-pointer transition-colors ${
                  viewMode === 'markdown'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="View formatted Markdown"
              >
                <BookOpen className="w-3 h-3" />
                <span>Markdown</span>
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded cursor-pointer transition-colors ${
                  viewMode === 'raw'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="View plain lines & raw source"
              >
                <Code className="w-3 h-3" />
                <span>Source</span>
              </button>
            </div>

            {/* Search filter in file (for raw view) */}
            {viewMode === 'raw' && (
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Find in text..."
                  className="text-xs bg-neutral-900 border border-border-dark text-gray-200 pl-7 pr-2.5 py-1 rounded-md focus:outline-none focus:border-emerald-500/50 w-28 sm:w-36 font-mono placeholder-gray-600"
                />
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-2" />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-1.5 top-1.5 text-gray-500 hover:text-gray-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Line numbers toggle */}
            {viewMode === 'raw' && (
              <button
                onClick={() => setShowLineNumbers(!showLineNumbers)}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                  showLineNumbers 
                    ? 'bg-neutral-800 border-border-dark text-gray-300' 
                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
                }`}
                title="Toggle line numbers"
              >
                # Lines
              </button>
            )}

            {/* Copy button */}
            <button
              id="file-preview-copy-btn"
              onClick={handleCopy}
              className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-gray-200 border border-border-dark px-2.5 py-1 rounded text-xs transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-gray-400" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-brand-bg font-mono text-xs leading-relaxed max-h-[50vh]">
          {document.content ? (
            viewMode === 'markdown' ? (
              <div className="markdown-body font-sans text-xs text-gray-200 leading-relaxed max-w-none space-y-3 prose prose-invert">
                <Markdown>{document.content}</Markdown>
              </div>
            ) : (
              <div className="space-y-1">
                {lines.map((line, idx) => {
                  const lineNum = idx + 1;
                  const isMatch = searchTerm && line.toLowerCase().includes(searchTerm.toLowerCase());

                  return (
                    <div 
                      key={idx}
                      className={`flex items-start rounded px-1.5 py-0.5 ${
                        isMatch ? 'bg-amber-500/20 text-amber-200 font-semibold' : 'text-gray-300 hover:bg-white/[0.02]'
                      }`}
                    >
                      {showLineNumbers && (
                        <span className="w-10 text-right pr-3 text-gray-600 select-none font-mono text-[11px] flex-shrink-0">
                          {lineNum}
                        </span>
                      )}
                      <span className="flex-1 whitespace-pre-wrap break-words font-sans text-xs text-gray-200">
                        {line || <span className="text-gray-700 italic select-none">[empty line]</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="p-8 text-center text-gray-500 font-mono text-xs">
              No content found in this document file.
            </div>
          )}
        </div>

        {/* Associated Extracted Entities Bar (if any) */}
        {associatedNodes.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border-dark bg-card-bg/60">
            <span className="text-[10px] font-mono uppercase text-gray-400 font-bold tracking-wider block mb-1.5">
              Knowledge Graph Entities extracted from this document:
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {associatedNodes.map(node => (
                <span 
                  key={node.id} 
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-1"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {node.label}
                  <span className="text-[9px] text-gray-500 uppercase">({node.type})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-border-dark bg-panel-bg flex items-center justify-between gap-3">
          <div className="text-[11px] text-gray-500 font-mono flex items-center gap-1.5 truncate">
            <Database className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>Document ID: <strong className="text-gray-300">{document.id}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            {onDeleteDocument && (
              confirmDelete ? (
                <div className="flex items-center gap-1.5 bg-rose-950/70 border border-rose-500/50 px-2 py-1 rounded-lg">
                  <span className="text-xs text-rose-300 font-mono">Delete document?</span>
                  <button
                    id="file-preview-confirm-delete-btn"
                    onClick={() => {
                      onDeleteDocument(document.id);
                      setConfirmDelete(false);
                      onClose();
                    }}
                    className="text-xs bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold px-2.5 py-0.5 rounded cursor-pointer transition-colors shadow"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-gray-400 hover:text-gray-200 font-mono px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  id="file-preview-delete-btn"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-mono px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  title="Delete this document and its citations"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete Document</span>
                </button>
              )
            )}
            {onSelectForLedger && (
              <button
                id="file-preview-inspect-ledger-btn"
                onClick={() => {
                  onSelectForLedger(document.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 text-xs bg-card-bg hover:bg-neutral-800 border border-border-dark hover:border-emerald-500/40 text-emerald-400 font-mono px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>View in Curation Ledger</span>
              </button>
            )}
            <button
              id="file-preview-modal-done-btn"
              onClick={onClose}
              className="text-xs bg-neutral-800 hover:bg-neutral-700 text-gray-200 font-mono px-4 py-1.5 rounded-lg border border-border-dark transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
