/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Document, 
  Node, 
  Link, 
  Conflict, 
  FactContribution, 
  RetrievalResult,
  AgentPerformanceMetrics
} from './types';
import { ForceGraph } from './components/ForceGraph';
import { CurationAgentLogs } from './components/CurationAgentLogs';
import { RetrievalAudit } from './components/RetrievalAudit';
import { ConflictManager } from './components/ConflictManager';
import { GraphTopologySummary } from './components/GraphTopologySummary';
import { FilePreviewModal } from './components/FilePreviewModal';
import { CommunityConstellationView } from './components/CommunityConstellation';
import { CurationAgentPerformanceDashboard } from './components/CurationAgentPerformanceDashboard';
import { 
  Plus, 
  RefreshCw, 
  Upload, 
  Search, 
  Database, 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  History,
  GitBranch,
  ExternalLink,
  FolderUp,
  Folder,
  Eye,
  Trash2,
  XCircle,
  StopCircle,
  Loader2,
  Orbit,
  Network,
  Filter,
  Sparkles,
  Layers
} from 'lucide-react';

export default function App() {
  // Graph View Modes: 'local_khop' (Detailed entity traversal) or 'community_constellation' (Macro community galaxy)
  const [graphViewMode, setGraphViewMode] = useState<'local_khop' | 'community_constellation'>('community_constellation');

  // Visualization Viewport Subgraph Sampling & Focus Mode
  // Keeps full graph (all 3,958+ entities & 12,321+ relations) for GraphRAG search/reasoning while rendering a responsive viewport
  const [displayDensity, setDisplayDensity] = useState<'core_150' | 'core_350' | 'core_700' | 'query_path' | 'doc_scoped' | 'all'>('core_150');

  // Graph States (Full database for GraphRAG)
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [metrics, setMetrics] = useState<AgentPerformanceMetrics | undefined>(undefined);
  
  // Selection
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  // Ingestion Inputs
  const [pasteText, setPasteText] = useState<string>('');
  const [docName, setDocName] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<boolean>(false);

  // Search & Retrieval States
  const [query, setQuery] = useState<string>('');
  const [seeds, setSeeds] = useState<string[]>([]);
  const [retrievedNodes, setRetrievedNodes] = useState<string[]>([]);
  const [retrievedEdges, setRetrievedEdges] = useState<string[]>([]);
  const [nodeReasons, setNodeReasons] = useState<Record<string, string>>({});
  const [edgeReasons, setEdgeReasons] = useState<Record<string, string>>({});
  const [whyText, setWhyText] = useState<string>('');
  
  // Generation & Audit States
  const [answer, setAnswer] = useState<string>('');
  const [ratings, setRatings] = useState<FactContribution[]>([]);
  const [flashedFactId, setFlashedFactId] = useState<number | null>(null);

  // Loading States
  const [loadingGraph, setLoadingGraph] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [searching, setSearching] = useState<boolean>(false);
  const [drafting, setDrafting] = useState<boolean>(false);
  const [auditing, setAuditing] = useState<boolean>(false);
  const [resolving, setResolving] = useState<boolean>(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const [inspectedNode, setInspectedNode] = useState<Node | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [confirmDeleteNodeId, setConfirmDeleteNodeId] = useState<string | null>(null);

  // AbortController and cancelation state for ingestion
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  // Drag and drop & File/Folder refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Dynamic Query presets tailored to the ingested documents & extracted entities
  const getDynamicPresetQueries = (): string[] => {
    const docNames = documents.map(d => (d.name || '').toLowerCase());
    const hasResume = docNames.some(n => n.includes('resume') || n.includes('cv') || n.includes('victor') || n.includes('basu'));
    const hasMinerals = docNames.some(n => n.includes('mineral') || n.includes('skill') || n.includes('aiml') || n.includes('dashboard'));
    
    if (hasResume && hasMinerals) {
      return [
        "What GenAI and RAG projects did Victor Basu build at Lumiq.ai?",
        "What ML models and tools are used for Lithium demand forecasting?",
        "What tools and cloud technologies are used in Text2Sql Agentic search?",
        "How does the Supply Risk Alerting engine score mineral disruptions?",
        "What experience does Victor Basu have with AWS SageMaker and Bedrock?",
        "What are the core simulation parameters for the Lithium Mine Digital Twin?"
      ];
    } else if (hasResume) {
      return [
        "What GenAI and RAG projects did Victor Basu build at Lumiq.ai?",
        "What tools and architecture are used in Text2Sql Agentic search?",
        "What experience does Victor Basu have with AWS SageMaker, Bedrock, and GCP?",
        "What role did Victor Basu have at Accenture and Lumiq.ai?"
      ];
    } else if (hasMinerals) {
      return [
        "What ML models are used for Lithium demand forecasting?",
        "How does the Supply Risk Alerting engine score mineral disruptions?",
        "What are the core simulation parameters for the Lithium Mine Digital Twin?",
        "What are the key minerals tracked in the India-US framework?"
      ];
    } else if (documents.length > 0 && nodes.length > 0) {
      // Extract top hub entities dynamically
      const degreeMap: Record<string, number> = {};
      links.forEach(l => {
        const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
        const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
        degreeMap[s] = (degreeMap[s] || 0) + 1;
        degreeMap[t] = (degreeMap[t] || 0) + 1;
      });
      const topEntities = Object.entries(degreeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([id]) => nodes.find(n => n.id === id)?.label)
        .filter(Boolean) as string[];

      if (topEntities.length > 0) {
        return topEntities.map(ent => `What are the key relationships and roles connected to ${ent}?`);
      }
    }

    return [
      "What GenAI and RAG projects did Victor Basu build at Lumiq.ai?",
      "What ML models are used for Lithium demand forecasting in the India-US deal?",
      "What tools and cloud technologies are used in Text2Sql Agentic search?",
      "How does the Supply Risk Alerting engine score mineral disruptions?"
    ];
  };

  const initialSearchDoneRef = useRef<boolean>(false);

  // Fetch full graph state on load with auto-retry
  const fetchGraph = async (selectLatestDoc = false, retries = 2) => {
    try {
      const res = await fetch('/api/graph');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      const loadedNodes = data.nodes || [];
      const loadedLinks = data.links || [];
      const loadedDocs = data.documents || [];
      const loadedConflicts = data.conflicts || [];

      setNodes(loadedNodes);
      setLinks(loadedLinks);
      setDocuments(loadedDocs);
      setConflicts(loadedConflicts);
      if (data.metrics) {
        setMetrics(data.metrics);
      }
      
      if (selectLatestDoc && loadedDocs.length > 0) {
        setSelectedDocId(loadedDocs[loadedDocs.length - 1].id);
      } else if (!selectedDocId && loadedDocs.length > 0) {
        setSelectedDocId(loadedDocs[0].id);
      }

      // Automatically run an initial grounded query for the loaded documents if query is empty
      if (!initialSearchDoneRef.current && loadedDocs.length > 0 && loadedNodes.length > 0) {
        initialSearchDoneRef.current = true;
        const docNames = loadedDocs.map((d: any) => (d.name || '').toLowerCase());
        const hasResume = docNames.some((n: string) => n.includes('resume') || n.includes('victor'));
        const defaultQ = hasResume 
          ? "What GenAI and RAG projects did Victor Basu build at Lumiq.ai?"
          : "What ML models and tools are used for Lithium demand forecasting?";
        setQuery(defaultQ);
        setTimeout(() => {
          handleSearchQuery(defaultQ);
        }, 100);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => {
          fetchGraph(selectLatestDoc, retries - 1);
        }, 800);
        return;
      }
      console.warn("Could not reach graph API on startup:", err);
    } finally {
      setLoadingGraph(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, []);

  // Degree calculation for all nodes in the full knowledge graph (used for hub-ranking and density sampling)
  const globalNodeDegrees = React.useMemo(() => {
    const degMap = new Map<string, number>();
    nodes.forEach(n => degMap.set(n.id, 0));
    links.forEach(l => {
      const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (degMap.has(sId)) degMap.set(sId, (degMap.get(sId) || 0) + 1);
      if (degMap.has(tId)) degMap.set(tId, (degMap.get(tId) || 0) + 1);
    });
    return degMap;
  }, [nodes, links]);

  // Viewport Subgraph Sampling: Preserves 100% of the graph (all entities & relations) in backend GraphRAG
  // while dynamically providing a clean, responsive visualization viewport in the canvas
  const { visualNodes, visualLinks } = React.useMemo(() => {
    if (nodes.length <= 150 || displayDensity === 'all') {
      return { visualNodes: nodes, visualLinks: links };
    }

    const retrievedSet = new Set(retrievedNodes);
    const selectedDocNodeIds = new Set<string>();

    if (displayDensity === 'doc_scoped' && selectedDocId) {
      nodes.forEach(n => {
        if (n.chunkIds && n.chunkIds.some(cid => cid.includes(selectedDocId))) {
          selectedDocNodeIds.add(n.id);
        }
      });
    }

    let targetCap = 150;
    if (displayDensity === 'core_350') targetCap = 350;
    if (displayDensity === 'core_700') targetCap = 700;

    // If query_path, focus on active RAG retrieved nodes + their 1-hop neighbors
    if (displayDensity === 'query_path') {
      const queryHopIds = new Set<string>(retrievedNodes);
      if (retrievedNodes.length > 0) {
        links.forEach(l => {
          const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
          if (queryHopIds.has(sId)) queryHopIds.add(tId);
          if (queryHopIds.has(tId)) queryHopIds.add(sId);
        });
      }
      const filtered = nodes.filter(n => queryHopIds.has(n.id));
      if (filtered.length > 0) {
        const activeSet = new Set(filtered.map(n => n.id));
        const filteredL = links.filter(l => {
          const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
          return activeSet.has(sId) && activeSet.has(tId);
        });
        return { visualNodes: filtered, visualLinks: filteredL };
      }
    }

    if (displayDensity === 'doc_scoped' && selectedDocNodeIds.size > 0) {
      const filtered = nodes.filter(n => selectedDocNodeIds.has(n.id));
      const activeSet = new Set(filtered.map(n => n.id));
      const filteredL = links.filter(l => {
        const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
        const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
        return activeSet.has(sId) && activeSet.has(tId);
      });
      return { visualNodes: filtered, visualLinks: filteredL };
    }

    // Sort nodes by degree centrality and prioritize retrieved nodes from active query
    const sorted = [...nodes].sort((a, b) => {
      const aRet = retrievedSet.has(a.id) ? 1 : 0;
      const bRet = retrievedSet.has(b.id) ? 1 : 0;
      if (aRet !== bRet) return bRet - aRet;

      const degA = globalNodeDegrees.get(a.id) || 0;
      const degB = globalNodeDegrees.get(b.id) || 0;
      return degB - degA;
    });

    const cappedNodes = sorted.slice(0, targetCap);
    const activeNodeSet = new Set(cappedNodes.map(n => n.id));

    const cappedLinks = links.filter(l => {
      const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      return activeNodeSet.has(sId) && activeNodeSet.has(tId);
    });

    return { visualNodes: cappedNodes, visualLinks: cappedLinks };
  }, [nodes, links, displayDensity, retrievedNodes, selectedDocId, globalNodeDegrees]);

  // Cancel any ongoing ingestion process
  const handleCancelIngestion = () => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setUploadStatus('Ingestion process canceled by user.');
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
    fetchGraph();
  };

  // Handler to delete an ingested document and clean up graph
  const handleDeleteDocument = async (docId: string) => {
    const docToDelete = documents.find(d => d.id === docId);
    const docName = docToDelete ? docToDelete.name : docId;

    setDeletingDocId(docId);
    setConfirmDeleteDocId(null);
    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.status === 'success') {
        setUploadStatus(`Document "${docName}" and its unique graph items removed.`);
        setUploadError(false);
        if (selectedDocId === docId) {
          const remaining = documents.filter(d => d.id !== docId);
          setSelectedDocId(remaining.length > 0 ? remaining[0].id : null);
        }
        if (previewDoc?.id === docId) {
          setIsPreviewOpen(false);
          setPreviewDoc(null);
        }
        // Clear any stale graph walks / node inspector
        setInspectedNode(null);
        setRetrievedNodes([]);
        setRetrievedEdges([]);
        setSeeds([]);
        await fetchGraph(true);
      } else {
        setUploadError(true);
        setUploadStatus(data.error || 'Failed to remove document.');
      }
    } catch (err: any) {
      setUploadError(true);
      setUploadStatus(`Error deleting document: ${err.message}`);
    } finally {
      setDeletingDocId(null);
    }
  };

  // Handler to delete a single entity node directly from the graph
  const handleDeleteNode = async (nodeId: string) => {
    setDeletingNodeId(nodeId);
    setConfirmDeleteNodeId(null);
    try {
      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.status === 'success') {
        setUploadStatus(data.message || `Entity deleted from graph.`);
        setUploadError(false);
        if (inspectedNode?.id === nodeId) {
          setInspectedNode(null);
        }
        setRetrievedNodes(prev => prev.filter(id => id !== nodeId));
        setSeeds(prev => prev.filter(id => id !== nodeId));
        await fetchGraph();
      } else {
        setUploadError(true);
        setUploadStatus(data.error || 'Failed to delete entity.');
      }
    } catch (err: any) {
      setUploadError(true);
      setUploadStatus(`Error deleting entity: ${err.message}`);
    } finally {
      setDeletingNodeId(null);
    }
  };

  // Handler for direct text paste ingestion
  const handleIngestText = async () => {
    if (!pasteText.trim()) return;
    setUploading(true);
    setUploadError(false);
    setUploadStatus('Transferring text to autonomous curation agent...');
    
    isCancelledRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: docName.trim() || undefined, content: pasteText }),
        signal: controller.signal
      });
      const data = await response.json();

      if (isCancelledRef.current) return;

      if (data.status === 'success') {
        setUploadStatus(`Extraction successful: ${data.document.name} cataloged.`);
        setPasteText('');
        setDocName('');
        await fetchGraph(true); // reload and focus latest
      } else {
        setUploadError(true);
        setUploadStatus(data.error || 'Agent failed to curate document.');
        await fetchGraph();
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || isCancelledRef.current) {
        setUploadStatus('Ingestion canceled.');
      } else {
        setUploadError(true);
        setUploadStatus(err.message || 'Fatal error contacting curation endpoint.');
      }
    } finally {
      setUploading(false);
      abortControllerRef.current = null;
    }
  };

  // Helper to read file contents (converting PDFs to base64 data URLs)
  const readFileContent = async (file: File): Promise<string> => {
    if (file.name.toLowerCase().endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return 'data:application/pdf;base64,' + btoa(binary);
    } else {
      return await file.text();
    }
  };

  // Handler for file & folder batch uploads
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    setUploadError(false);
    isCancelledRef.current = false;
    
    // Filter readable document files (.txt, .pdf, .md, .json, .csv, etc.)
    const validFiles: { file: File; displayName: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const name = file.name.toLowerCase();
      // Skip hidden files, system files, or binary media formats
      if (name.startsWith('.') || ['.png', '.jpg', '.jpeg', '.gif', '.zip', '.exe', '.ds_store'].some(ext => name.endsWith(ext))) {
        continue;
      }
      const displayName = file.webkitRelativePath || file.name;
      validFiles.push({ file, displayName });
    }

    if (validFiles.length === 0) {
      setUploadError(true);
      setUploadStatus('No readable PDF, CSV, TXT, Markdown, or JSON files found in the selected folder/files.');
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }
    
    for (let i = 0; i < validFiles.length; i++) {
      if (isCancelledRef.current) {
        setUploadStatus(`Ingestion canceled after processing ${i} of ${validFiles.length} file(s).`);
        break;
      }

      const { file, displayName } = validFiles[i];
      setUploadStatus(`Reading "${displayName}" (${i + 1}/${validFiles.length})...`);
      
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const text = await readFileContent(file);
        if (!text.trim()) {
          continue; // Skip empty files
        }
        
        if (isCancelledRef.current) break;

        setUploadStatus(`Ingesting "${displayName}" (${i + 1}/${validFiles.length})...`);
        
        const response = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: displayName, content: text }),
          signal: controller.signal
        });
        const data = await response.json();
        
        if (isCancelledRef.current) break;

        if (data.status === 'success') {
          setUploadStatus(`Verified & indexed "${displayName}" (${i + 1}/${validFiles.length})`);
          await fetchGraph(true); // Automatically refresh graph canvas on each document ingested
        } else {
          setUploadError(true);
          setUploadStatus(`Failed "${displayName}": ${data.error || 'Curation error'}`);
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || isCancelledRef.current) {
          setUploadStatus(`Ingestion process canceled.`);
          break;
        }
        setUploadError(true);
        setUploadStatus(`Fatal error on "${displayName}": ${err.message}`);
      }
    }
    
    abortControllerRef.current = null;
    await fetchGraph(true);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  // Drag and drop folder & file handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileUpload({ target: { files: e.dataTransfer.files } } as any);
      }
      return;
    }

    const filesToUpload: { file: File; path: string }[] = [];

    const traverseEntry = async (entry: FileSystemEntry, path = '') => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        await new Promise<void>((resolve) => {
          fileEntry.file((file) => {
            filesToUpload.push({ file, path: path ? `${path}/${file.name}` : file.name });
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const dirReader = dirEntry.createReader();
        const readAllEntries = async (): Promise<FileSystemEntry[]> => {
          let allEntries: FileSystemEntry[] = [];
          let batch: FileSystemEntry[];
          do {
            batch = await new Promise<FileSystemEntry[]>((resolve) => dirReader.readEntries(resolve));
            allEntries = allEntries.concat(batch);
          } while (batch.length > 0);
          return allEntries;
        };
        const childEntries = await readAllEntries();
        for (const childEntry of childEntries) {
          await traverseEntry(childEntry, path ? `${path}/${entry.name}` : entry.name);
        }
      }
    };

    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      setUploading(true);
      setUploadError(false);
      isCancelledRef.current = false;

      for (const entry of entries) {
        if (isCancelledRef.current) break;
        await traverseEntry(entry);
      }

      const validFiles = filesToUpload.filter(item => {
        const name = item.file.name.toLowerCase();
        return !name.startsWith('.') && !['.png', '.jpg', '.jpeg', '.gif', '.zip', '.exe', '.ds_store'].some(ext => name.endsWith(ext));
      });

      if (validFiles.length === 0) {
        setUploadError(true);
        setUploadStatus('No readable PDF, TXT, or Markdown files found in dropped folder.');
        setUploading(false);
        return;
      }

      for (let i = 0; i < validFiles.length; i++) {
        if (isCancelledRef.current) {
          setUploadStatus(`Ingestion canceled after processing ${i} of ${validFiles.length} file(s).`);
          break;
        }

        const { file, path } = validFiles[i];
        setUploadStatus(`Reading "${path}" (${i + 1}/${validFiles.length})...`);
        
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          const text = await readFileContent(file);
          if (!text.trim()) continue;
          
          if (isCancelledRef.current) break;

          setUploadStatus(`Ingesting "${path}" (${i + 1}/${validFiles.length})...`);
          const response = await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: path, content: text }),
            signal: controller.signal
          });
          const data = await response.json();
          
          if (isCancelledRef.current) break;

          if (data.status === 'success') {
            setUploadStatus(`Verified & indexed "${path}" (${i + 1}/${validFiles.length})`);
            await fetchGraph(true); // Automatically refresh graph canvas on each document ingested
          } else {
            setUploadError(true);
            setUploadStatus(`Failed "${path}": ${data.error || 'Curation error'}`);
          }
        } catch (err: any) {
          if (err.name === 'AbortError' || isCancelledRef.current) {
            setUploadStatus('Ingestion process canceled.');
            break;
          }
          setUploadError(true);
          setUploadStatus(`Fatal error on "${path}": ${err.message}`);
        }
      }
      abortControllerRef.current = null;
      await fetchGraph(true);
      setUploading(false);
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload({ target: { files: e.dataTransfer.files } } as any);
    }
  };

  // Handler to re-index all ingested documents into knowledge graph
  const [reindexing, setReindexing] = useState<boolean>(false);
  const handleReindexGraph = async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/graph/reindex', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        setUploadStatus(data.message);
        await fetchGraph(true);
      }
    } catch (err: any) {
      console.error("Failed to reindex graph:", err);
      setUploadError(true);
      setUploadStatus(`Reindex failed: ${err.message}`);
    } finally {
      setReindexing(false);
    }
  };

  // Handler to reset graph to seed overview
  const handleResetGraph = async () => {
    if (!confirm("Are you sure you want to reset the database? This restores preloaded seed case files and clears custom uploaded document nodes.")) return;
    setLoadingGraph(true);
    try {
      const res = await fetch('/api/graph/reset', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        setSelectedDocId(null);
        setQuery('');
        setSeeds([]);
        setRetrievedNodes([]);
        setRetrievedEdges([]);
        setNodeReasons({});
        setEdgeReasons({});
        setWhyText('');
        setAnswer('');
        setRatings([]);
        await fetchGraph();
      }
    } catch (err) {
      console.error("Failed to reset graph:", err);
    } finally {
      setLoadingGraph(false);
    }
  };

  // Handler for database queries (Graph-Walk Retrieval)
  const handleSearchQuery = async (searchStr = query) => {
    const activeStr = searchStr.trim();
    if (!activeStr) return;
    
    setSearching(true);
    setQuery(activeStr);
    
    // Clear generation/audit states to prevent layout mismatches
    setAnswer('');
    setRatings([]);
    setFlashedFactId(null);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: activeStr })
      });
      const data = await response.json();

      setSeeds(data.seeds || []);
      setRetrievedNodes(data.retrievedNodes || []);
      setRetrievedEdges(data.retrievedEdges || []);
      setNodeReasons(data.nodeReasons || {});
      setEdgeReasons(data.edgeReasons || {});
      setWhyText(data.whyText || '');
    } catch (err) {
      console.error("Search query failed:", err);
    } finally {
      setSearching(false);
    }
  };

  // Formulation (Answer Drafting)
  const handleDraftResponse = async () => {
    if (retrievedEdges.length === 0) return;
    setDrafting(true);
    
    // Format retrieved facts list
    const factsList = retrievedEdges.map((eid, idx) => {
      const link = links.find(l => l.id === eid);
      if (!link) return '';
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const srcNode = nodes.find(n => n.id === s);
      const tgtNode = nodes.find(n => n.id === t);
      return `Fact ${idx + 1}: ${srcNode?.label} — ${link.relation} — ${tgtNode?.label}`;
    }).filter(Boolean);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, retrievedFacts: factsList }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      setAnswer(data.answer || 'Could not synthesize response from facts.');
    } catch (err: any) {
      console.error("Drafting failed:", err);
      // If network stalled, provide client-side structured fallback
      if (err.name === 'AbortError') {
        const bulletList = factsList.map((f, i) => {
          const cleanF = f.replace(/^Fact\s+\d+:\s*/i, '');
          return `• ${cleanF} [${i + 1}]`;
        }).join('\n');
        setAnswer(`**Key Verified Relationships**:\n${bulletList}`);
      }
    } finally {
      setDrafting(false);
    }
  };

  // Auditing & Rank Contribution
  const handleAuditContribution = async () => {
    if (!answer) return;
    setAuditing(true);

    const factsList = retrievedEdges.map((eid, idx) => {
      const link = links.find(l => l.id === eid);
      if (!link) return '';
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const srcNode = nodes.find(n => n.id === s);
      const tgtNode = nodes.find(n => n.id === t);
      return `Fact ${idx + 1}: ${srcNode?.label} — ${link.relation} — ${tgtNode?.label}`;
    }).filter(Boolean);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const response = await fetch('/api/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, retrievedFacts: factsList }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      setRatings(data.ratings || []);
    } catch (err) {
      console.error("Auditing failed:", err);
    } finally {
      setAuditing(false);
    }
  };

  // Highlight a clicked citation on graph & fact-cards
  const handleHighlightFact = (factId: number) => {
    setFlashedFactId(factId);
    
    // Smooth scroll down to fact card
    const cardEl = document.getElementById(`fact-card-${factId}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Auto-clear flash indicator after 1.5 seconds
    setTimeout(() => {
      setFlashedFactId(null);
    }, 1500);
  };

  // Resolve flag conflict handler
  const handleResolveConflict = async (conflictId: string, resolution: string) => {
    setResolving(true);
    try {
      const response = await fetch(`/api/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution })
      });
      const data = await response.json();
      if (data.status === 'success') {
        await fetchGraph();
      }
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
    } finally {
      setResolving(false);
    }
  };

  // Map rating level to connection lookup
  const getContributionMap = () => {
    const contributionMap: Record<string, { level: 'high' | 'medium' | 'low' | 'none'; reason: string }> = {};
    ratings.forEach(rating => {
      const linkId = retrievedEdges[rating.id - 1];
      if (linkId) {
        contributionMap[linkId] = {
          level: rating.level,
          reason: rating.reason
        };
      }
    });
    return contributionMap;
  };

  const selectedDocument = documents.find(d => d.id === selectedDocId) || null;

  return (
    <div className="min-h-screen bg-brand-bg text-gray-200 selection:bg-blue-500/30 selection:text-blue-100 pb-16">
      {/* Background radial overlays */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-blue-500/5 blur-[150px]" />
        <div className="absolute inset-0 bg-repeat bg-[radial-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:20px_20px]" />
      </div>

      {/* System Status Bar Header */}
      <header className="border-b border-border-dark bg-panel-bg sticky top-0 z-50 shadow-lg backdrop-blur-md bg-panel-bg/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse"></div>
            <span className="text-xs font-black font-sans tracking-wider uppercase text-gray-100">DeepAgents</span>
            <span className="text-[10px] font-mono text-emerald-400 tracking-wider">GRAPHRAG EXPLORER</span>
            <span className="hidden xs:inline px-2 py-0.5 text-[9px] bg-card-bg border border-border-dark rounded text-gray-400 uppercase font-mono">v2.4.0-Stable</span>
          </div>
          
          {/* Dynamic Live Telemetry stats for Enterprise Demos */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-card-bg border border-border-dark rounded-lg">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Sources</span>
                <span className="text-xs font-bold font-mono text-blue-400">{documents.length}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-card-bg border border-border-dark rounded-lg">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Entities</span>
                <span className="text-xs font-bold font-mono text-amber-400">{nodes.length}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-card-bg border border-border-dark rounded-lg">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Links</span>
                <span className="text-xs font-bold font-mono text-emerald-400">{links.length}</span>
              </div>
              {conflicts.filter(c => !c.resolved).length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/30 rounded-lg animate-pulse">
                  <span className="text-[9px] text-rose-400 font-mono uppercase">Conflicts</span>
                  <span className="text-xs font-bold font-mono text-rose-400">{conflicts.filter(c => !c.resolved).length}</span>
                </div>
              )}
            </div>
            <div className="h-4 w-px bg-border-dark hidden sm:block" />
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[8px] text-gray-500 uppercase font-bold tracking-wider font-mono">Engine</span>
              <span className="text-[11px] font-mono font-semibold text-emerald-400">Gemini 3.7 Flash</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10 space-y-8">
        
        {/* HEADER BRANDING */}
        <header className="border-b border-border-dark pb-6 text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono font-bold tracking-[0.3em] uppercase text-emerald-400">
              Reasoning GraphRAG Engine
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight font-serif text-gray-100 mt-1">
              The Reasonable RAG
            </h1>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed font-mono">
              Transparent GraphRAG reasoning &amp; visual intelligence: Ingest knowledge, explore entity connections, trace subgraph walked paths, and audit multi-hop factual rationale in real-time.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleResetGraph}
              disabled={loadingGraph}
              className="flex items-center gap-1.5 text-xs bg-card-bg border border-border-dark text-gray-300 hover:border-border-light py-2 px-3.5 rounded-lg font-mono transition-all duration-150 shadow cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-rose-400" />
              RESET GRAPH STATE
            </button>
            <a
              href="https://ai.studio/build"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs bg-card-bg border border-border-dark text-gray-300 hover:border-border-light py-2 px-3.5 rounded-lg font-mono transition-all duration-150 shadow cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              AI STUDIO BUILD
            </a>
          </div>
        </header>

        {/* STEP 01: INGEST DATA */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b border-border-dark pb-1.5">
            <span className="flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
              01
            </span>
            <h2 className="text-sm font-bold font-mono text-gray-200 uppercase tracking-wider">
              Document Ingestion &amp; Autonomous curation agent
            </h2>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Upload text files or paste records to call the **DeepCuration Autonomous Agent**. Instead of running a fixed extraction script, the agent executes diagnostic tools (fuzzy search, connection audit, redundancy merge, and consistency check) to self-optimize the database in real-time.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form inputs */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`lg:col-span-2 border rounded-xl bg-panel-bg p-4 space-y-4 flex flex-col justify-between shadow-lg transition-all duration-200 ${
                isDragging 
                  ? 'border-emerald-500 bg-emerald-500/5 glow-emerald' 
                  : 'border-border-dark'
              }`}
            >
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <span className="text-xs font-mono font-bold uppercase tracking-wide text-emerald-400">
                    Paste text or upload file / folder:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Hidden file input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".txt,.pdf,.md,.json,.csv,.log,.py,.js,.ts"
                      multiple
                      className="hidden"
                    />
                    {/* Hidden folder input */}
                    <input
                      type="file"
                      ref={folderInputRef}
                      onChange={handleFileUpload}
                      {...({ webkitdirectory: "", directory: "" } as any)}
                      multiple
                      className="hidden"
                    />
                    
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 text-[11px] bg-card-bg border border-border-dark text-gray-300 hover:border-border-light hover:text-gray-200 py-1.5 px-2.5 rounded-lg font-mono transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-400" />
                      CHOOSE FILES
                    </button>

                    <button
                      onClick={() => folderInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 text-[11px] bg-card-bg border border-border-dark text-gray-300 hover:border-border-light hover:text-gray-200 py-1.5 px-2.5 rounded-lg font-mono transition-all cursor-pointer disabled:opacity-50"
                    >
                      <FolderUp className="w-3.5 h-3.5 text-blue-400" />
                      IMPORT ENTIRE FOLDER
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Paste raw unstructured knowledge text here or drag & drop an entire folder/files directly onto this area..."
                    className="w-full text-xs font-sans bg-brand-bg text-gray-200 p-3 border border-border-dark rounded-lg h-[120px] focus:outline-none focus:border-border-light placeholder-gray-600 leading-relaxed"
                  />
                  {isDragging && (
                    <div className="absolute inset-0 bg-brand-bg/90 border-2 border-dashed border-emerald-400 rounded-lg flex flex-col items-center justify-center text-emerald-400 font-mono text-xs gap-2 backdrop-blur-sm pointer-events-none">
                      <FolderUp className="w-8 h-8 animate-bounce" />
                      <span className="font-bold uppercase tracking-wider">Drop folder or files to ingest</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <input
                  type="text"
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  placeholder="Document name (optional, e.g. aurora-changelog.txt)"
                  className="text-xs font-mono bg-brand-bg text-gray-200 px-3 py-2 border border-border-dark rounded-lg focus:outline-none focus:border-border-light placeholder-gray-600 w-full sm:w-[280px]"
                />
                <div className="flex items-center gap-2">
                  {uploading && (
                    <button
                      id="cancel-ingestion-btn"
                      onClick={handleCancelIngestion}
                      className="flex items-center gap-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-mono font-bold py-2 px-3.5 rounded-lg border border-rose-500/30 cursor-pointer transition-colors shadow"
                      title="Abort current file ingestion process"
                    >
                      <StopCircle className="w-4 h-4 text-rose-400 animate-pulse" />
                      CANCEL INGESTION
                    </button>
                  )}
                  <button
                    id="ingest-run-agent-btn"
                    onClick={handleIngestText}
                    disabled={uploading || !pasteText.trim()}
                    className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-brand-bg font-bold py-2 px-5 rounded-lg disabled:bg-neutral-800 disabled:text-neutral-500 cursor-pointer transition-colors shadow"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        INGESTING...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        INGEST &amp; RUN AGENT
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Upload Status logs */}
              {uploadStatus && (
                <div className={`mt-3 p-2.5 rounded-lg text-xs border font-mono flex items-center justify-between gap-2 ${
                  uploadError 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                    : 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {uploadError ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" />}
                    <span className="leading-normal truncate">{uploadStatus}</span>
                  </div>
                  {uploading && (
                    <button
                      onClick={handleCancelIngestion}
                      className="text-[10px] text-rose-400 hover:text-rose-300 font-mono underline ml-2 flex-shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Ingested Document select list */}
            <div className="border border-border-dark rounded-xl bg-panel-bg p-4 space-y-3 flex flex-col justify-between shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wide text-emerald-400 block">
                  Ingested Case File Records ({documents.length})
                </span>
                <span className="text-[10px] font-mono text-gray-500">
                  Click View or Delete
                </span>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[160px] pr-1 py-1">
                {documents.map(doc => {
                  const isSelected = doc.id === selectedDocId;
                  const isDeleting = deletingDocId === doc.id;
                  let stateColor = 'bg-stone-500/10 text-stone-400 border-stone-500/20';
                  if (doc.status === 'done') stateColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  if (doc.status === 'pending') stateColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse';
                  if (doc.status === 'error') stateColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';

                  return (
                    <div
                      key={doc.id}
                      className={`w-full p-2 border flex items-center justify-between text-left transition-all duration-200 rounded-lg group ${
                        isSelected 
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-sm' 
                          : 'bg-brand-bg border-border-dark hover:border-border-light text-gray-300'
                      }`}
                    >
                      <button
                        onClick={() => setSelectedDocId(doc.id)}
                        className="flex items-center gap-2 overflow-hidden mr-2 flex-1 text-left cursor-pointer min-w-0"
                        title={`Select ${doc.name} for curation ledger`}
                      >
                        <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-emerald-400' : 'text-gray-500'}`} />
                        <span className="text-xs font-mono truncate">{doc.name}</span>
                      </button>
                      
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDocId(doc.id);
                            setPreviewDoc(doc);
                            setIsPreviewOpen(true);
                          }}
                          className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-emerald-400 border border-border-dark transition-all cursor-pointer shadow-sm"
                          title="Open pop-up to see what's inside this file"
                        >
                          <Eye className="w-3 h-3 text-emerald-400" />
                          <span>View</span>
                        </button>

                        {confirmDeleteDocId === doc.id ? (
                          <div 
                            className="flex items-center gap-1 bg-rose-950/80 border border-rose-500/50 px-1.5 py-0.5 rounded shadow"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[9px] text-rose-300 font-mono">Delete?</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDocument(doc.id);
                              }}
                              disabled={isDeleting}
                              className="text-[9px] bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors shadow"
                            >
                              {isDeleting ? '...' : 'Yes'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteDocId(null);
                              }}
                              className="text-[9px] text-gray-400 hover:text-gray-200 font-mono px-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteDocId(doc.id);
                            }}
                            disabled={isDeleting}
                            className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 border border-border-dark hover:border-rose-500/30 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                            title={`Delete ${doc.name}`}
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                            ) : (
                              <Trash2 className="w-3 h-3 text-rose-400" />
                            )}
                          </button>
                        )}

                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border font-bold ${stateColor}`}>
                          {doc.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-gray-500 font-mono border-t border-border-dark pt-2 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Select file to inspect ledger</span>
                </div>
                {selectedDocId && (
                  <button
                    onClick={() => {
                      const doc = documents.find(d => d.id === selectedDocId);
                      if (doc) {
                        setPreviewDoc(doc);
                        setIsPreviewOpen(true);
                      }
                    }}
                    className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer font-mono"
                  >
                    <Eye className="w-3 h-3" />
                    <span>View inside</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* AUTONOMOUS CURATION AGENT PERFORMANCE DASHBOARD */}
        <CurationAgentPerformanceDashboard
          metrics={metrics}
          documents={documents}
          links={links}
          nodes={nodes}
          onSelectDocument={(docId) => {
            setSelectedDocId(docId);
            const doc = documents.find(d => d.id === docId);
            if (doc) {
              setPreviewDoc(doc);
              setIsPreviewOpen(true);
            }
          }}
          onQueryFact={(factQuery) => {
            setQuery(factQuery);
            handleSearchQuery(factQuery);
          }}
        />

        {/* STEP 02: CENTRAL WORKSPACE (GRAPH + COGNITIVE LEDGER) */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b border-border-dark pb-1.5">
            <span className="flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
              02
            </span>
            <h2 className="text-sm font-bold font-mono text-gray-200 uppercase tracking-wider">
              Persistent knowledge-graph canvas &amp; curation ledger
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Interactive Graph Canvas */}
            <div className="lg:col-span-2 space-y-2">
              {/* View Mode & Viewport Density Controls */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* View Mode Segmented Controls */}
                  <div className="flex items-center bg-[#0B0D14] border border-border-dark p-0.5 rounded-lg">
                    <button
                      onClick={() => setGraphViewMode('community_constellation')}
                      className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        graphViewMode === 'community_constellation'
                          ? 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/40 shadow-sm'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                      title="Orbital Community Constellation Graph (Hierarchical Clustering)"
                    >
                      <Orbit className="w-3.5 h-3.5 text-blue-400" />
                      <span>Community Galaxy</span>
                    </button>
                    <button
                      onClick={() => setGraphViewMode('local_khop')}
                      className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        graphViewMode === 'local_khop'
                          ? 'bg-emerald-600/30 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                      title="Local Detailed k-Hop Graph (Relationship Predicates & High-Contrast Labels)"
                    >
                      <Network className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Local k-Hop</span>
                    </button>
                  </div>

                  {/* Viewport Subgraph Density Selector */}
                  <div className="flex items-center gap-1 bg-[#0B0D14] border border-border-dark px-2 py-0.5 rounded-lg text-xs font-mono">
                    <Filter className="w-3 h-3 text-amber-400" />
                    <span className="text-gray-400 text-[10px] hidden sm:inline">VIEWPORT:</span>
                    <select
                      value={displayDensity}
                      onChange={(e) => setDisplayDensity(e.target.value as any)}
                      className="bg-transparent text-gray-200 text-xs font-mono focus:outline-none cursor-pointer"
                      title="Adjust how many entities to render in the visual viewport (GraphRAG always uses 100% of graph data)"
                    >
                      <option value="core_150" className="bg-[#0f111a] text-gray-200">Top 150 Core Hubs (Fastest)</option>
                      <option value="core_350" className="bg-[#0f111a] text-gray-200">Top 350 Entities (Balanced)</option>
                      <option value="core_700" className="bg-[#0f111a] text-gray-200">Top 700 Dense Network</option>
                      <option value="query_path" className="bg-[#0f111a] text-gray-200">Query &amp; Traversal Path Only</option>
                      {selectedDocId && (
                        <option value="doc_scoped" className="bg-[#0f111a] text-gray-200">Selected Doc Only</option>
                      )}
                      <option value="all" className="bg-[#0f111a] text-gray-200">All Entities ({nodes.length})</option>
                    </select>
                  </div>

                  {uploading && (
                    <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 font-mono px-2 py-0.5 rounded border border-emerald-500/30 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Auto-syncing...
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-400 bg-card-bg border border-border-dark px-2 py-0.5 rounded">
                    Total DB: <strong className="text-amber-400">{nodes.length}</strong> ent · <strong className="text-emerald-400">{links.length}</strong> rel
                  </span>
                  {documents.length > 0 && (
                    <button
                      onClick={handleReindexGraph}
                      disabled={reindexing || uploading}
                      className="flex items-center gap-1 text-[10px] font-mono text-emerald-300 hover:text-emerald-200 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 px-2 py-0.5 rounded transition-colors cursor-pointer disabled:opacity-50"
                      title="Re-extract and construct knowledge graph from all uploaded documents"
                    >
                      <Database className={`w-3 h-3 ${reindexing ? 'animate-spin' : ''}`} />
                      <span>{reindexing ? 'Extracting...' : 'Build Graph'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => fetchGraph(true)}
                    disabled={loadingGraph}
                    className="flex items-center gap-1 text-[10px] font-mono text-gray-300 hover:text-emerald-400 bg-card-bg hover:bg-neutral-800 border border-border-dark px-2 py-0.5 rounded transition-colors cursor-pointer"
                    title="Click to refresh graph data"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingGraph ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Viewport Subgraph Status Notice */}
              {visualNodes.length < nodes.length && (
                <div className="flex items-center justify-between text-[11px] font-mono bg-blue-950/30 border border-blue-500/20 text-blue-300 px-3 py-1.5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>
                      Rendering <strong>{visualNodes.length}</strong> of <strong>{nodes.length}</strong> entities ({visualLinks.length} edges) for high-FPS visual clarity.
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    Full graph (<strong>{nodes.length}</strong> nodes / <strong>{links.length}</strong> relations) active in backend GraphRAG reasoning.
                  </span>
                </div>
              )}
              
              {graphViewMode === 'community_constellation' ? (
                <CommunityConstellationView 
                  nodes={visualNodes}
                  links={visualLinks}
                  documents={documents}
                  selectedNodeId={inspectedNode?.id}
                  onNodeSelect={(node) => {
                    setInspectedNode(node);
                  }}
                />
              ) : (
                <ForceGraph 
                  nodes={visualNodes}
                  links={visualLinks}
                  retrievedNodes={retrievedNodes}
                  retrievedEdges={retrievedEdges}
                  contributionRatings={getContributionMap()}
                  onNodeClick={(node) => {
                    setInspectedNode(node);
                  }}
                  onRefresh={() => fetchGraph(true)}
                  isLoading={loadingGraph}
                />
              )}

              {/* Inspected Node Detail Card */}
              {inspectedNode && (
                <div className="border border-cyan-500/40 bg-card-bg/95 backdrop-blur-md rounded-xl p-3.5 space-y-2.5 shadow-xl font-mono text-xs animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between gap-3 border-b border-border-dark pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="font-bold text-sm text-gray-100">{inspectedNode.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-neutral-800 text-cyan-300 border border-cyan-500/30">
                        {inspectedNode.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setQuery(inspectedNode.label);
                          handleSearchQuery(inspectedNode.label);
                        }}
                        className="flex items-center gap-1 text-[11px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded cursor-pointer transition-colors shadow-sm"
                        title="Query GraphRAG with this entity"
                      >
                        <Search className="w-3 h-3" />
                        <span>Query Entity</span>
                      </button>

                      {confirmDeleteNodeId === inspectedNode.id ? (
                        <div className="flex items-center gap-1.5 bg-rose-950/80 border border-rose-500/50 px-2 py-0.5 rounded shadow">
                          <span className="text-[10px] text-rose-300">Delete from graph?</span>
                          <button
                            onClick={() => handleDeleteNode(inspectedNode.id)}
                            disabled={deletingNodeId === inspectedNode.id}
                            className="text-[10px] bg-rose-600 hover:bg-rose-500 text-white font-bold px-2 py-0.5 rounded cursor-pointer transition-colors"
                          >
                            {deletingNodeId === inspectedNode.id ? '...' : 'Yes'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteNodeId(null)}
                            className="text-[10px] text-gray-400 hover:text-gray-200 px-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteNodeId(inspectedNode.id)}
                          disabled={deletingNodeId === inspectedNode.id}
                          className="flex items-center gap-1 text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded cursor-pointer transition-colors shadow-sm"
                          title="Remove entity and its connections from graph"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                          <span>Delete Entity</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setInspectedNode(null);
                          setConfirmDeleteNodeId(null);
                        }}
                        className="text-gray-400 hover:text-gray-200 p-1 cursor-pointer"
                        title="Close Inspector"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Connected Relationships in Graph */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                      Connected Relationships ({
                        links.filter(l => {
                          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
                          const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
                          return s === inspectedNode.id || t === inspectedNode.id;
                        }).length
                      })
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                      {links.filter(l => {
                        const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
                        const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
                        return s === inspectedNode.id || t === inspectedNode.id;
                      }).map((l, idx) => {
                        const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
                        const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
                        const sNode = nodes.find(n => n.id === s);
                        const tNode = nodes.find(n => n.id === t);
                        return (
                          <div key={idx} className="flex items-center gap-1 px-2 py-1 bg-neutral-900 border border-border-dark rounded text-[10px] text-gray-300">
                            <span className="text-amber-300 font-semibold">{sNode?.label || s}</span>
                            <span className="text-cyan-400 font-mono">--[{l.relation}]--&gt;</span>
                            <span className="text-emerald-300 font-semibold">{tNode?.label || t}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Text Chunk Citations */}
                  {inspectedNode.chunkIds && inspectedNode.chunkIds.length > 0 && (
                    <div className="text-[10px] text-gray-400 pt-1 border-t border-border-dark flex items-center gap-2">
                      <span className="text-gray-500">Supporting Citations:</span>
                      <span className="text-gray-300">{inspectedNode.chunkIds.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Graph type legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center py-2 px-3 border border-border-dark bg-card-bg/40 rounded-xl text-[10px] font-mono text-gray-300 shadow-md">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] shadow-[0_0_6px_#F59E0B]" /> Person
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] shadow-[0_0_6px_#3B82F6]" /> Organization
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#A855F7] shadow-[0_0_6px_#A855F7]" /> Team
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_6px_#10B981]" /> Product
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899] shadow-[0_0_6px_#EC4899]" /> Technology
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4] shadow-[0_0_6px_#06B6D4]" /> Feature
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#94A3B8]" /> Other
                </div>
                <div className="h-3 w-px bg-border-dark self-center" />
                <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                  <span className="w-4 border-t-2 border-[#64748B]" /> Link
                </div>
                <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                  <span className="w-4 border-t-2 border-dashed border-cyan-400" /> Walked
                </div>
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <span className="w-4 border-t-2 border-amber-400" /> Contributed
                </div>
              </div>

              {/* Graph Topology Summary */}
              <GraphTopologySummary 
                nodes={nodes}
                links={links}
                onSelectHub={(node) => {
                  setQuery(prev => prev ? `${prev} ${node.label}` : node.label);
                }}
              />
            </div>

            {/* Autonomous Curation logs */}
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase block">
                Autonomous Curation agent reasoning ledger
              </span>
              <CurationAgentLogs 
                document={selectedDocument} 
                onViewContent={() => {
                  if (selectedDocument) {
                    setPreviewDoc(selectedDocument);
                    setIsPreviewOpen(true);
                  }
                }}
                onDeleteDocument={handleDeleteDocument}
              />
            </div>
          </div>
        </section>

        {/* STEP 03 & 04: QUERY, WALK, FORMULATE, AUDIT */}
        <section className="space-y-4 pt-4">
          <div className="flex items-center gap-2 border-b border-border-dark pb-1.5">
            <span className="flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
              03
            </span>
            <h2 className="text-sm font-bold font-mono text-gray-200 uppercase tracking-wider">
              Query Walk, response formulation, &amp; contribution audit
            </h2>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Witness how questions are answered transparently: Type a query below. TF-IDF indexing scores existing node overlaps to locate seed anchor points, walks the graph one hop adjacent, formats a citation response, and evaluates fact load-bearings.
          </p>

          <div className="border border-border-dark rounded-xl bg-panel-bg p-4 space-y-4 shadow-lg">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchQuery()}
                  placeholder="Query the Living Graph (e.g., 'What GenAI projects did Victor Basu build?' or 'How does Lithium forecasting work?')"
                  className="w-full text-xs font-mono bg-brand-bg text-gray-200 pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:border-border-light placeholder-gray-600"
                />
                <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
              </div>
              <button
                onClick={() => handleSearchQuery()}
                disabled={searching || nodes.length === 0}
                className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-brand-bg font-bold py-3 px-6 rounded-lg disabled:bg-neutral-800 disabled:text-neutral-500 cursor-pointer transition-colors shadow"
              >
                {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                SEARCH GRAPH
              </button>
            </div>

            {/* Quick Presets tailored to ingested documents */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono text-emerald-400/90 uppercase font-bold tracking-wider mr-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Document-Synced Presets:
              </span>
              {getDynamicPresetQueries().map(q => {
                const isActive = query === q;
                return (
                  <button
                    key={q}
                    onClick={() => handleSearchQuery(q)}
                    className={`text-[10px] font-mono rounded-lg px-3 py-1.5 transition-all duration-150 cursor-pointer border ${
                      isActive 
                        ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 shadow-sm' 
                        : 'bg-card-bg hover:bg-brand-bg border-border-dark text-gray-300 hover:text-gray-100 hover:border-border-light'
                    }`}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>

          <RetrievalAudit 
            query={query}
            seeds={seeds}
            retrievedNodes={retrievedNodes}
            retrievedEdges={retrievedEdges}
            nodeReasons={nodeReasons}
            edgeReasons={edgeReasons}
            whyText={whyText}
            allNodes={nodes}
            allLinks={links}
            answer={answer}
            ratings={ratings}
            isDrafting={drafting}
            isAuditing={auditing}
            onDraft={handleDraftResponse}
            onAudit={handleAuditContribution}
            onHighlightFact={handleHighlightFact}
            flashedFactId={flashedFactId}
          />
        </section>

        {/* SELF OPTIMIZATION: CONFLICT CONTROLS */}
        <section className="space-y-3 pt-4">
          <div className="flex items-center gap-2 border-b border-border-dark pb-1.5">
            <span className="flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
              <GitBranch className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-sm font-bold font-mono text-gray-200 uppercase tracking-wider">
              Self-Optimization &amp; Human-in-the-Loop Integrity
            </h2>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Autonomous systems can identify logical contradictions as they ingest new facts. Below, examine factual conflicts diagnosed by our agent loop and dictate resolution pathways to safely enforce consistency across the graph.
          </p>
          
          <ConflictManager 
            conflicts={conflicts}
            nodes={nodes}
            links={links}
            onResolveConflict={handleResolveConflict}
            onRefreshGraph={() => fetchGraph(false)}
            isResolving={resolving}
          />
        </section>

      </div>

      {/* Pop-up modal to inspect raw file content */}
      <FilePreviewModal
        isOpen={isPreviewOpen}
        document={previewDoc}
        onClose={() => setIsPreviewOpen(false)}
        associatedNodes={
          previewDoc 
            ? nodes.filter(n => n.chunkIds && n.chunkIds.some(cid => cid.startsWith(previewDoc.id + '-') || cid === previewDoc.id)) 
            : []
        }
        onSelectForLedger={(docId) => {
          setSelectedDocId(docId);
        }}
        onDeleteDocument={handleDeleteDocument}
      />
    </div>
  );
}
