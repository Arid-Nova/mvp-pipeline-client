import React, { useState } from 'react';
import { NodeData } from '../models'; 
import { InlineDropzone } from './InlineDropZone';
import { fetchIRVersions, fetchSpecificIRs } from '../../../services/api';

interface UploadIRCardProps {
    node: NodeData;
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
}

export const UploadIRCard: React.FC<UploadIRCardProps> = ({ node, updateNodeData }) => {
    const [mode, setMode] = useState<'upload' | 'database'>('upload');
    
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [versions, setVersions] = useState<{ id: string, version: string, createdAt?: any }[]>([]);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const results = await fetchIRVersions(searchQuery);
            setVersions(results || []);
        } catch (error) {
            // alert("Failed to fetch IR versions from database.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleLoadDatabaseIR = async (id: string) => {
        setIsDownloading(true);
        try {
            const results = await fetchSpecificIRs([id]);
            if (results && results.length > 0) {
                const loadedIR = results[0];
                updateNodeData(node.id, {
                    payload: { 
                        irJson: loadedIR, 
                        systemName: searchQuery,
                        metadata: extractIRMetadata(loadedIR, id)
                    }
                });
            }
        } catch (error) {
            // alert("Failed to download IR from database.");
        } finally {
            setIsDownloading(false);
        }
    };

    const extractIRMetadata = (loadedIR: any, fallbackId: string) => {
        let extractedMetadata: { repoUrl: string; branch: string; commitId: string }[] = [];
        
        if (loadedIR?.microservices && Array.isArray(loadedIR.microservices)) {
            const uniqueRepos = new Map();
            
            loadedIR.microservices.forEach((ms: any) => {
                const repoUrl = ms.repositoryURL || 'Unknown Repo';
                const commitId = ms.commitID || fallbackId;
                const branch = ms.metadata?.branch || ms.branch || 'main';
                
                const uniqueKey = `${repoUrl}-${branch}-${commitId}`;
                
                if (!uniqueRepos.has(uniqueKey)) {
                    uniqueRepos.set(uniqueKey, { repoUrl, branch, commitId });
                }
            });
            
            extractedMetadata = Array.from(uniqueRepos.values());
        }

        if (extractedMetadata.length === 0) {
            extractedMetadata = [{ repoUrl: 'system', branch: 'main', commitId: fallbackId }];
        }

        return extractedMetadata;
    };

    return (
        <div className="mt-2">
            {node.data.payload?.irJson ? (
                <div className="w-full min-h-[96px] flex flex-col items-center justify-center border border-emerald-500/30 bg-emerald-900/10 rounded-lg p-2">
                    <div className="text-emerald-400 font-bold text-sm mb-1">IR Ready</div>
                    <div className="text-emerald-600 text-xs font-mono break-all text-center max-h-8 overflow-hidden" title={node.data.payload?.systemName || node.data?.systemName}>
                        {node.data.payload?.systemName || node.data?.systemName}
                    </div>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation(); 
                            updateNodeData(node.id, { payload: undefined });
                            setVersions([]); 
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            updateNodeData(node.id, { payload: undefined });
                            setVersions([]);
                        }}
                        className="mt-2 text-[10px] underline text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Replace File
                    </button>
                </div>
            ) : (
                <div className="w-full">
                    {mode === 'upload' ? (
                        <div className="flex flex-col">
                            <InlineDropzone onFileSelect={async (f) => {
                                try {
                                    const text = await f.text();
                                    const json = JSON.parse(text);
                                    updateNodeData(node.id, {
                                        payload: { 
                                            irJson: json, 
                                            systemName: f.name,
                                            metadata: extractIRMetadata(json, json.id)
                                        }
                                    });
                                } catch(e) {
                                    alert("Invalid JSON File");
                                }
                            }} />
                            
                            {/* Swap Button */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); setMode('database'); }}
                                className="mt-2 text-[10px] text-slate-500 hover:text-teal-400 transition-colors flex items-center justify-center gap-1 w-full"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                Search Saved Snapshots 
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col min-h-[96px]">
                            <div className="flex gap-1 mb-2">
                                <input 
                                    placeholder="System name..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="flex-1 bg-slate-900 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
                                />
                                <button 
                                    onClick={handleSearch}
                                    disabled={isSearching || !searchQuery.trim()}
                                    className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-xs transition-colors"
                                >
                                    {isSearching ? '...' : 'Find'}
                                </button>
                            </div>

                            {/* Results List */}
                            <div className="flex-1 max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-1 border border-slate-800 bg-slate-900/30 rounded p-1">
                                {isDownloading ? (
                                    <div className="text-[10px] text-teal-400 text-center py-4 animate-pulse">Loading IR...</div>
                                ) : versions.length > 0 ? (
                                    versions.map(v => (
                                        <div 
                                            key={v.id}
                                            onClick={() => handleLoadDatabaseIR(v.id)}
                                            className="flex justify-between items-center p-1.5 hover:bg-slate-800 rounded cursor-pointer transition-all group"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-mono text-slate-300 group-hover:text-teal-300">
                                                    v{v.version}
                                                </span>
                                                {v.createdAt && (
                                                    <span className="text-[9px] text-slate-500">
                                                        {new Date(v.createdAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                            <svg className="w-3 h-3 text-slate-600 group-hover:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-[10px] text-slate-600 text-center py-4 italic">
                                        No Snapshots found.
                                    </div>
                                )}
                            </div>

                            {/* Swap Button */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); setMode('upload'); }}
                                className="mt-2 text-[10px] text-slate-500 hover:text-teal-400 transition-colors flex items-center justify-center gap-1 w-full"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                Upload Local File
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};