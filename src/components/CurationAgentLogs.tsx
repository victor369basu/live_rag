/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Document } from '../types';
import { Loader2, Terminal, CheckCircle2, AlertTriangle, MessageSquareCode, Eye, Trash2, Check, X } from 'lucide-react';

interface CurationAgentLogsProps {
  document: Document | null;
  onViewContent?: () => void;
  onDeleteDocument?: (docId: string) => void;
}

export const CurationAgentLogs: React.FC<CurationAgentLogsProps> = ({ 
  document, 
  onViewContent,
  onDeleteDocument 
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400 border border-dashed border-border-dark rounded-xl bg-panel-bg/40 min-h-[300px]">
        <Terminal className="w-10 h-10 mb-3 text-gray-600" />
        <h4 className="text-sm font-semibold font-mono text-gray-200">Autonomous Curation Ledger</h4>
        <p className="text-xs max-w-xs mt-1 leading-relaxed text-gray-500">
          Select an ingested document from the listing, or upload a new one to witness the autonomous curation agent optimize the GraphRAG database in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border-dark rounded-xl bg-panel-bg overflow-hidden flex flex-col h-full min-h-[400px] shadow-lg">
      {/* Header */}
      <div className="bg-card-bg border-b border-border-dark px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-4 h-4 text-emerald-400 animate-pulse flex-shrink-0" />
          <h3 className="text-xs font-bold font-mono tracking-wider text-emerald-400 uppercase truncate">
            Ledger: {document.name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {onViewContent && (
            <button
              onClick={onViewContent}
              className="flex items-center gap-1 text-[11px] bg-brand-bg hover:bg-neutral-800 text-gray-300 hover:text-emerald-400 font-mono px-2 py-1 rounded border border-border-dark transition-colors cursor-pointer"
              title="Inspect raw document content pop-up"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>View File</span>
            </button>
          )}
          {onDeleteDocument && (
            confirmDelete ? (
              <div className="flex items-center gap-1 bg-rose-950/60 border border-rose-500/50 p-0.5 rounded">
                <span className="text-[10px] text-rose-300 font-mono pl-1 pr-0.5">Delete?</span>
                <button
                  onClick={() => {
                    onDeleteDocument(document.id);
                    setConfirmDelete(false);
                  }}
                  className="flex items-center gap-0.5 text-[10px] bg-rose-600 hover:bg-rose-500 text-white font-mono px-1.5 py-0.5 rounded cursor-pointer font-bold"
                  title="Confirm delete"
                >
                  <Check className="w-3 h-3" />
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="p-0.5 text-gray-400 hover:text-gray-200 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-mono px-2 py-1 rounded border border-rose-500/30 transition-colors cursor-pointer"
                title="Remove this document from the knowledge base"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )
          )}
          {document.status === 'pending' && (
            <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 font-mono px-2 py-0.5 rounded border border-amber-500/30">
              <Loader2 className="w-3 h-3 animate-spin" />
              CURATING
            </span>
          )}
          {document.status === 'done' && (
            <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 font-mono px-2 py-0.5 rounded border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              OPTIMIZED
            </span>
          )}
          {document.status === 'error' && (
            <span className="flex items-center gap-1 text-[10px] bg-rose-500/10 text-rose-400 font-mono px-2 py-0.5 rounded border border-rose-500/30">
              <AlertTriangle className="w-3.5 h-3.5" />
              FAILED
            </span>
          )}
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs max-h-[500px]">
        {document.curationLogs.map((log, index) => {
          let logClass = 'text-gray-300 border-border-dark bg-card-bg/40';
          let icon = <MessageSquareCode className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />;

          if (log.startsWith('Thought:')) {
            logClass = 'text-amber-300 bg-amber-500/5 border-amber-500/20 border-l-2 border-l-amber-500';
            icon = <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0 mt-0.5" />;
          } else if (log.startsWith('Action Success:')) {
            logClass = 'text-emerald-300 bg-emerald-500/5 border-emerald-500/20 border-l-2 border-l-emerald-500';
            icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />;
          } else if (log.startsWith('Action Error:') || log.startsWith('Agent Error:')) {
            logClass = 'text-rose-300 bg-rose-500/5 border-rose-500/20 border-l-2 border-l-rose-500';
            icon = <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />;
          } else if (log.startsWith('Agent Summary:')) {
            logClass = 'text-blue-300 bg-blue-500/5 border-blue-500/20 border-l-2 border-l-blue-500 font-sans p-3 leading-relaxed';
            icon = <Terminal className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />;
          }

          return (
            <div
              key={index}
              className={`p-2.5 border rounded-lg flex gap-3 transition-all duration-300 hover:bg-card-bg/80 ${logClass}`}
            >
              {icon}
              <div className="flex-1">
                {log.startsWith('Agent Summary:') ? (
                  <div className="space-y-1">
                    <div className="text-[10px] text-blue-400 font-mono uppercase font-bold tracking-wider">Agent Summary Decision</div>
                    <p className="text-xs leading-relaxed text-gray-300">{log.replace('Agent Summary:', '').trim()}</p>
                  </div>
                ) : (
                  <p className="leading-relaxed break-words">{log}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
