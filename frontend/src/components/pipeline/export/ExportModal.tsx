import React, { useState } from 'react';
import { exportSessionPipelineConfig, ExportTarget } from '../../../utils/pipelineExporter';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string | null;
    sessionName: string;
    hasUnsavedChanges: boolean;
    onSaveRequested: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
    isOpen,
    onClose,
    sessionId,
    sessionName,
    hasUnsavedChanges,
    onSaveRequested
}) => {
    const [target, setTarget] = useState<ExportTarget>('github-actions');
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    // Forces session save if changes exist or session ID isn't assigned yet
    if (!sessionId || hasUnsavedChanges) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md text-center shadow-2xl">
                    <span className="text-3xl">⚠️</span>
                    <h3 className="text-lg font-bold text-white mt-2">Save Session Required</h3>
                    <p className="text-xs text-slate-400 mt-2">
                        To export this pipeline, you need to save your canvas session first so the CI/CD runner can fetch its target structure.
                    </p>
                    <div className="mt-5 flex justify-center gap-3">
                        <button 
                            onClick={onClose} 
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-md transition"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => {
                                onSaveRequested();
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-md text-white transition"
                        >
                            Save Session Now
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const code = exportSessionPipelineConfig(sessionId, sessionName, target);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const fileExtensions: Record<ExportTarget, string> = {
            'github-actions': 'aridnova-workflow.yml',
            'jenkins': 'Jenkinsfile',
            'aws-codebuild': 'buildspec.yml',
            'gitlab-ci': '.gitlab-ci.yml'
        };

        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileExtensions[target];
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-3xl flex flex-col max-h-[85vh] shadow-2xl">
                
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Export to CI/CD Pipeline
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white font-bold transition">✕</button>
                </div>

                {/* Target Selector Tabs */}
                <div className="flex border-b border-slate-700 bg-slate-850 px-6 pt-3 gap-2">
                    {[
                        { id: 'github-actions', label: 'GitHub Actions' },
                        { id: 'jenkins', label: 'Jenkins' },
                        { id: 'aws-codebuild', label: 'AWS CodeBuild' },
                        { id: 'gitlab-ci', label: 'GitLab CI' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setTarget(tab.id as ExportTarget)}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                                target === tab.id
                                    ? 'bg-slate-700 text-blue-400 border-t-2 border-blue-400'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Code Preview Area */}
                <div className="p-6 flex-1 overflow-auto bg-slate-900 font-mono text-xs text-slate-300">
                    <pre className="whitespace-pre-wrap">{code}</pre>
                </div>

                {/* Footer Controls */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-700 bg-slate-800">
                    <span className="text-xs text-slate-400">
                        Session ID: <span className="font-mono text-slate-300">{sessionId}</span>
                    </span>
                    <div className="flex gap-3">
                        <button
                            onClick={handleCopy}
                            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition flex items-center gap-2"
                        >
                            {copied ? (
                                <><span>✓</span> Copied!</>
                            ) : (
                                <>Copy Code</>
                            )}
                        </button>
                        <button
                            onClick={handleDownload}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition flex items-center gap-2"
                        >
                            Download File
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};