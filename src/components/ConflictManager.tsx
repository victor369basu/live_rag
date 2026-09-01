import React, { useState } from 'react';
import { Conflict, Node, Link } from '../types';
import { 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  Hammer, 
  CheckSquare, 
  Scan, 
  PlusCircle, 
  RefreshCw, 
  Sparkles, 
  Info, 
  ArrowRight,
  ShieldCheck,
  History,
  X
} from 'lucide-react';

interface ConflictManagerProps {
  conflicts: Conflict[];
  nodes: Node[];
  links: Link[];
  onResolveConflict: (conflictId: string, resolution: string) => void;
  onRefreshGraph: () => void;
  isResolving: boolean;
}

export const ConflictManager: React.FC<ConflictManagerProps> = ({
  conflicts,
  nodes,
  links,
  onResolveConflict,
  onRefreshGraph,
  isResolving
}) => {
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);
  const [customResolution, setCustomResolution] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isCreatingModal, setIsCreatingModal] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // Manual Flag Form State
  const [manualEntity, setManualEntity] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [isSubmittingFlag, setIsSubmittingFlag] = useState(false);

  const activeConflicts = conflicts.filter(c => !c.resolved);
  const resolvedConflicts = conflicts.filter(c => c.resolved);

  const handleResolve = (id: string, resolutionType: string) => {
    let finalRes = resolutionType;
    if (resolutionType === 'custom') {
      if (!customResolution.trim()) return;
      finalRes = customResolution.trim();
    }
    onResolveConflict(id, finalRes);
    setSelectedConflictId(null);
    setCustomResolution('');
  };

  // Trigger automated graph consistency & contradiction scan
  const handleRunIntegrityScan = async () => {
    setIsScanning(true);
    setScanNotice(null);
    try {
      const res = await fetch('/api/conflicts/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setScanNotice(data.message || 'Scan completed');
      onRefreshGraph();
    } catch (err: any) {
      setScanNotice('Scan failed: ' + (err?.message || 'Network error'));
    } finally {
      setIsScanning(false);
      setTimeout(() => {
        setScanNotice(null);
      }, 5000);
    }
  };

  // Submit manual flag
  const handleCreateManualConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEntity.trim() || !manualDescription.trim()) return;
    setIsSubmittingFlag(true);
    try {
      const res = await fetch('/api/conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: manualEntity.trim(),
          description: manualDescription.trim(),
          docName: 'Manual Integrity Audit'
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setIsCreatingModal(false);
        setManualEntity('');
        setManualDescription('');
        onRefreshGraph();
      }
    } catch (err) {
      console.error('Failed to submit manual flag:', err);
    } finally {
      setIsSubmittingFlag(false);
    }
  };

  return (
    <div id="self-optimization-conflict-card" className="border border-border-dark rounded-xl bg-panel-bg overflow-hidden flex flex-col h-full shadow-xl font-mono">
      {/* Header with interactive actions */}
      <div className="bg-card-bg/90 border-b border-border-dark px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.25)]">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold font-sans uppercase tracking-wider text-gray-100">
                Self-Optimization &amp; Human-in-the-Loop Integrity
              </h3>
              <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider border ${
                activeConflicts.length > 0
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}>
                {activeConflicts.length > 0 ? `${activeConflicts.length} Action Item${activeConflicts.length !== 1 ? 's' : ''}` : 'All Facts Verified'}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-sans mt-0.5">
              Inspect semantic contradictions across ingested documents, run automated graph consistency scans, or execute arbitrated resolution paths.
            </p>
          </div>
        </div>

        {/* Action Controls: Run Scan + Flag Conflict */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunIntegrityScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 text-xs font-mono bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-sm disabled:opacity-50"
            title="Scan whole graph for conflicting predicates, multi-document divergences, or version contradictions"
          >
            {isScanning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : (
              <Scan className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span>{isScanning ? 'Scanning...' : 'Scan Consistency'}</span>
          </button>

          <button
            onClick={() => setIsCreatingModal(true)}
            className="flex items-center gap-1.5 text-xs font-mono bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-sm"
            title="Flag a custom fact or discrepancy to enforce human-in-the-loop review"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Flag Discrepancy</span>
          </button>
        </div>
      </div>

      {/* Scan Notice Banner */}
      {scanNotice && (
        <div className="bg-blue-950/40 border-b border-blue-500/30 px-4 py-2 text-xs text-blue-200 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <span>{scanNotice}</span>
          </div>
          <button 
            onClick={() => setScanNotice(null)}
            className="text-blue-400 hover:text-blue-200 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="p-4 sm:p-5 space-y-5">
        {/* Interactive Stats Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-brand-bg border border-border-dark rounded-lg p-2.5 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold">Unresolved Contradictions</span>
              <div className="text-lg font-black text-rose-400">{activeConflicts.length}</div>
            </div>
            <ShieldAlert className="w-5 h-5 text-rose-500/40" />
          </div>

          <div className="bg-brand-bg border border-border-dark rounded-lg p-2.5 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold">Resolved Audit Log</span>
              <div className="text-lg font-black text-emerald-400">{resolvedConflicts.length}</div>
            </div>
            <CheckCircle className="w-5 h-5 text-emerald-500/40" />
          </div>

          <div className="bg-brand-bg border border-border-dark rounded-lg p-2.5 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 uppercase font-bold">Graph Stability Index</span>
              <div className="text-lg font-black text-cyan-400">
                {nodes.length > 0 
                  ? `${Math.max(88, Math.min(100, Math.round(100 - (activeConflicts.length * 3.5))))}%` 
                  : '100%'}
              </div>
            </div>
            <ShieldCheck className="w-5 h-5 text-cyan-500/40" />
          </div>
        </div>

        {/* Active Conflicts List */}
        {activeConflicts.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border-dark pb-1.5">
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Active Conflicts Requiring Arbitration ({activeConflicts.length})
              </span>
              <span className="text-[10px] text-gray-500">
                Select an item to execute a human-directed resolution
              </span>
            </div>

            <div className="space-y-3">
              {activeConflicts.map(conflict => {
                const isOpen = selectedConflictId === conflict.id;

                return (
                  <div
                    key={conflict.id}
                    className={`p-3.5 rounded-xl border transition-all duration-300 bg-brand-bg ${
                      isOpen ? 'border-rose-500/60 shadow-[0_0_16px_rgba(244,63,94,0.15)] bg-neutral-900/90' : 'border-border-dark hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0 mt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>

                      <div className="flex-1 space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-100">
                              {conflict.entity}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-gray-400 border border-border-dark">
                              ID: {conflict.id}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500 font-mono">
                            Origin: {conflict.docName}
                          </span>
                        </div>

                        <p className="text-xs text-gray-300 leading-relaxed bg-neutral-950/60 p-2.5 rounded-lg border border-border-dark/60 font-sans">
                          {conflict.description}
                        </p>

                        {/* Action buttons */}
                        {!isOpen ? (
                          <div className="pt-1 flex items-center justify-between">
                            <button
                              onClick={() => setSelectedConflictId(conflict.id)}
                              className="flex items-center gap-1.5 text-xs font-mono bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 py-1.5 px-3 rounded-lg transition-colors cursor-pointer shadow-sm"
                            >
                              <Hammer className="w-3.5 h-3.5 text-rose-400" />
                              <span>Arbitrate &amp; Resolve Conflict</span>
                            </button>
                            <span className="text-[10px] text-gray-500">
                              Logged {new Date(conflict.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          <div className="pt-3 border-t border-border-dark mt-3 space-y-3 animate-in fade-in">
                            <div className="flex items-center justify-between">
                              <span className="block text-[10px] font-mono text-gray-300 uppercase font-bold tracking-wider">
                                Choose Arbitrated Pathway:
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedConflictId(null);
                                  setCustomResolution('');
                                }}
                                className="text-[10px] text-gray-400 hover:text-gray-200"
                              >
                                Cancel
                              </button>
                            </div>

                            {/* Preset Strategy Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <button
                                onClick={() => handleResolve(conflict.id, 'Retained authoritative established baseline facts')}
                                disabled={isResolving}
                                className="text-xs font-mono border border-border-dark bg-neutral-900 hover:bg-neutral-800 hover:border-emerald-500/40 p-2 text-gray-200 text-left rounded-lg transition-all cursor-pointer space-y-1 group"
                              >
                                <div className="text-emerald-400 font-bold flex items-center gap-1">
                                  <span>🛡️ Retain Baseline</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-sans leading-tight">
                                  Preserves original ground truth in knowledge graph.
                                </div>
                              </button>

                              <button
                                onClick={() => handleResolve(conflict.id, 'Superseded with updated facts from latest ingested document')}
                                disabled={isResolving}
                                className="text-xs font-mono border border-border-dark bg-neutral-900 hover:bg-neutral-800 hover:border-blue-500/40 p-2 text-gray-200 text-left rounded-lg transition-all cursor-pointer space-y-1 group"
                              >
                                <div className="text-blue-400 font-bold flex items-center gap-1">
                                  <span>🔄 Override with New</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-sans leading-tight">
                                  Applies latest specification or roadmap update.
                                </div>
                              </button>

                              <button
                                onClick={() => handleResolve(conflict.id, 'Coexist as multi-modal temporal variants (annotated with version tag)')}
                                disabled={isResolving}
                                className="text-xs font-mono border border-border-dark bg-neutral-900 hover:bg-neutral-800 hover:border-purple-500/40 p-2 text-gray-200 text-left rounded-lg transition-all cursor-pointer space-y-1 group"
                              >
                                <div className="text-purple-400 font-bold flex items-center gap-1">
                                  <span>🔀 Coexist as Variants</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-sans leading-tight">
                                  Annotates both as distinct historical phases.
                                </div>
                              </button>
                            </div>

                            {/* Custom Resolution Form */}
                            <div className="space-y-2 pt-1">
                              <span className="text-[10px] text-gray-400 font-bold uppercase">
                                Or Provide Specific Custom Rule:
                              </span>
                              <textarea
                                value={customResolution}
                                onChange={e => setCustomResolution(e.target.value)}
                                placeholder="E.g., 'Treat Sofia Alvarez as Technical Lead for v1.0 and Engineering Manager in v2.0 Roadmap'..."
                                className="w-full text-xs font-sans bg-brand-bg text-gray-200 p-2.5 border border-border-dark rounded-lg placeholder-gray-600 focus:outline-none focus:border-border-light leading-relaxed"
                                rows={2}
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => {
                                    setSelectedConflictId(null);
                                    setCustomResolution('');
                                  }}
                                  className="text-xs font-mono bg-neutral-800 text-neutral-400 hover:bg-neutral-700 py-1.5 px-3 rounded-lg border border-neutral-700 cursor-pointer transition-colors"
                                >
                                  CANCEL
                                </button>
                                <button
                                  onClick={() => handleResolve(conflict.id, 'custom')}
                                  disabled={isResolving || !customResolution.trim()}
                                  className="text-xs font-mono bg-emerald-600 text-brand-bg font-bold hover:bg-emerald-500 py-1.5 px-4 rounded-lg disabled:bg-neutral-800 disabled:text-neutral-500 cursor-pointer transition-colors shadow"
                                >
                                  {isResolving ? 'RESOLVING...' : 'EXECUTE RESOLUTION'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center text-gray-400 border border-border-dark rounded-xl bg-brand-bg">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2">
              <CheckSquare className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              No Pending Contradictions Detected
            </h4>
            <p className="text-xs max-w-md mt-1 leading-relaxed text-gray-500 font-sans">
              All ingested entities and relationship triples currently satisfy cross-document consistency rules. Click <strong>"Scan Consistency"</strong> to audit the live graph or <strong>"Flag Discrepancy"</strong> to record custom arbitration rules.
            </p>
          </div>
        )}

        {/* Resolved Conflicts Audit Trail */}
        {resolvedConflicts.length > 0 && (
          <div className="space-y-2.5 border-t border-border-dark pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-emerald-400" />
                Resolution Audit Trail ({resolvedConflicts.length})
              </span>
              <span className="text-[10px] text-gray-500">
                Immutable record of human arbitrations
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
              {resolvedConflicts.map(resolved => (
                <div
                  key={resolved.id}
                  className="p-3 rounded-lg border border-border-dark bg-brand-bg font-mono text-xs space-y-1.5 hover:border-emerald-500/30 transition-all shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-300 truncate">{resolved.entity}</span>
                    <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded font-bold uppercase flex-shrink-0">
                      <CheckCircle className="w-3 h-3" /> RESOLVED
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-500 line-clamp-2 font-sans">
                    {resolved.description}
                  </p>

                  <div className="text-[10px] text-emerald-300 font-sans border-t border-border-dark/60 pt-1.5 flex items-start gap-1">
                    <ArrowRight className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span><strong>Arbitrated Action:</strong> {resolved.resolution}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Manual Flag Modal Dialog */}
      {isCreatingModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel-bg border border-border-dark rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl font-mono animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border-dark pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-gray-100 uppercase">
                  Flag Factual Contradiction
                </h3>
              </div>
              <button
                onClick={() => setIsCreatingModal(false)}
                className="text-gray-400 hover:text-gray-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualConflict} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase font-bold">
                  Target Entity Name / Concept:
                </label>
                <input
                  type="text"
                  required
                  value={manualEntity}
                  onChange={e => setManualEntity(e.target.value)}
                  placeholder="e.g. Sofia Alvarez, PulseBoard 2.0, Aurora DB"
                  className="w-full text-xs bg-brand-bg text-gray-200 p-2.5 border border-border-dark rounded-lg focus:outline-none focus:border-border-light"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase font-bold">
                  Contradiction or Discrepancy Summary:
                </label>
                <textarea
                  required
                  rows={3}
                  value={manualDescription}
                  onChange={e => setManualDescription(e.target.value)}
                  placeholder="Explain why this fact is in question across case files (e.g. 'File A lists Sofia as Lead while File B mentions Raj as exclusive team owner')..."
                  className="w-full text-xs font-sans bg-brand-bg text-gray-200 p-2.5 border border-border-dark rounded-lg focus:outline-none focus:border-border-light leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-dark">
                <button
                  type="button"
                  onClick={() => setIsCreatingModal(false)}
                  className="text-xs bg-neutral-800 text-gray-300 hover:bg-neutral-700 px-3.5 py-2 rounded-lg border border-border-dark cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFlag || !manualEntity.trim() || !manualDescription.trim()}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-brand-bg font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                >
                  {isSubmittingFlag ? 'Submitting...' : 'Register Conflict'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
