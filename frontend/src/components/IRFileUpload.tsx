import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Notification } from '../utils/notifications';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  fullscreen?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, fullscreen }) => {
  const [notification, setNotification] = useState<Notification | null>(null);
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if(file){
      onFileSelect(file);
      setNotification({
        type: 'success',
        message: `Upload successful!`,
        duration: 5000
      });
    }
  }, [onFileSelect]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    acceptedFiles,
  } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/json': []
    }
  });

  const selectedFile = acceptedFiles[0];

  if (fullscreen) {
    return (
      <div {...getRootProps({
        className:`
          fixed top-1/2 left-1/2
          transform -translate-x-1/2 -translate-y-1/2
          z-50 w-1/3 h-1/3
          p-4 bg-white border-4 border-dashed border-purple-300
          rounded-xl shadow-lg
          flex items-center justify-center text-center
          text-xl text-gray-700
          hover:shadow-xl hover:border-purple-500 transition-all
          cursor-pointer
          group`
      })}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center">
              <span className="text-white text-2xl">↑</span>
            </div>
            <p className="font-medium">Drop the JSON file here ...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <img 
              src="/upload.png" 
              alt="Upload Icon" 
              className="w-20 h-20 opacity-50 group-hover:opacity-80 transition-opacity duration-300"
            />
            <div className="text-center">
              <p className="font-bold mb-2">Get started!</p>
              <p className="mb-1">Drag & drop an IR JSON file here</p>
              <p className="mb-1">or click to select one.</p>
              <p className="text-sm text-gray-500">Upload one file at a time.</p>
            </div>
          </div>
        )}
      </div>
    );
  } else {
    return (
      <div className={`
          fixed bottom-4 left-4
          z-50 w-1/6
          p-4 bg-slate-800/70
          backdrop-blur-none
          rounded-xl shadow-lg
          flex flex-col items-center justify-center gap-4
          text-center text-white
          hover:shadow-xl transition-shadow
          `}>
          
          {/* Header with Icon */}
          <h2 className="text-xl font-semibold text-white flex items-center gap-2 animated-gradient-dark">
              Upload Additional Files
          </h2>
          <div className="w-full h-px bg-slate-700"></div>
          
          {/* File Drop Area */}
          <div {...getRootProps({
              className:
                  `w-full p-6 bg-slate-700/50 border-2 border-dashed border-slate-600 rounded-xl
                  flex flex-col items-center justify-center gap-3 text-sm
                  text-slate-200 transition-all duration-300
                  hover:bg-slate-600/50 hover:border-slate-500 hover:scale-[1.02] cursor-pointer`
          })}>
              <input {...getInputProps()} />
              {isDragActive ? (
                  <div className="flex flex-col items-center gap-3">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-indigo-400 animate-pulse">
                          <path d="M11.25 4.5A.75.75 0 0112 3.75h.007a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75h-.007a.75.75 0 01-.75-.75V4.5zm.75 12a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0v-3.75a.75.75 0 01.75-.75zM9 8.25a.75.75 0 01.75.75v.007a.75.75 0 01-.75.75h-.007a.75.75 0 01-.75-.75V9a.75.75 0 01.75-.75zm6 0a.75.75 0 01.75.75v.007a.75.75 0 01-.75.75h-.007a.75.75 0 01-.75-.75V9a.75.75 0 01.75-.75zm-6 6a.75.75 0 01.75.75v.007a.75.75 0 01-.75.75h-.007a.75.75 0 01-.75-.75v-.007a.75.75 0 01.75-.75zm6 0a.75.75 0 01.75.75v.007a.75.75 0 01-.75.75h-.007a.75.75 0 01-.75-.75v-.007a.75.75 0 01.75-.75z" />
                      </svg>
                      <p className="font-medium">Drop the JSON file here ...</p>
                  </div>
              ) : (
                  <div className="flex flex-col items-center gap-3">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-gray-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <div className="text-center">
                          <p className="font-semibold text-white">Drag & drop an IR JSON file</p>
                          <p className="text-sm text-slate-400 mt-1">or click to select one.</p>
                          <p className="text-xs text-slate-500 mt-2">Upload one file at a time.</p>
                      </div>
                  </div>
              )}
          </div>
          {/* Reset Button */}
          <button
              onClick={() => window.location.reload()}
              className={`w-full rounded-xl px-4 py-2 text-center text-base font-semibold transition-all duration-200
              bg-red-500 border border-red-500 text-white hover:bg-red-600 hover:border-red-600
              focus:outline-none focus:ring-2 focus:ring-red-400`}
          >
              Reset Timeline
          </button>
      </div>
    );
  }
};
export default FileUpload;