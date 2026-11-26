import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface InlineDropzoneProps {
    onFileSelect: (file: File) => void;
}

export const InlineDropzone: React.FC<InlineDropzoneProps> = ({ onFileSelect }: { onFileSelect: (file: File) => void }) => {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles[0]) onFileSelect(acceptedFiles[0]);
    }, [onFileSelect]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        maxFiles: 1,
        accept: { 'application/json': ['.json'] }
    });

    return (
        <div {...getRootProps()} className={`
            w-full h-24 border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all
            ${isDragActive ? 'border-blue-400 bg-blue-500/20' : 'border-slate-600 hover:border-blue-400 hover:bg-slate-800/50 bg-slate-900/30'}
        `}>
            <input {...getInputProps()} />
            {isDragActive ? (
                <p className="text-blue-400 text-xs font-bold animate-pulse">Drop JSON here...</p>
            ) : (
                <>
                    <svg className="w-6 h-6 text-slate-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-slate-400 text-[10px] text-center">Drag & drop IR JSON<br/><span className="text-[9px] text-slate-500 opacity-70">or click to browse</span></p>
                </>
            )}
        </div>
    );
};