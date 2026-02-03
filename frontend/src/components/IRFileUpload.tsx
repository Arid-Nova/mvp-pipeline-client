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
          w-full min-h-[300px]
          flex flex-col items-center justify-center
          p-8 border-2 border-dashed rounded-2xl transition-all duration-300 cursor-pointer
          ${isDragActive 
            ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' 
            : 'border-slate-600 bg-slate-800/30 hover:border-blue-400 hover:bg-slate-800/60'
          }
        `
      })}>
        <input {...getInputProps()} />
        
        {isDragActive ? (
          <div className="flex flex-col items-center gap-4 animate-pulse">
            <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-blue-100">Drop it here!</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 group">
            <div className="w-24 h-24 bg-slate-700/50 rounded-full flex items-center justify-center transition-all group-hover:bg-slate-700 group-hover:scale-110">
                 <img 
                    src="/upload.png" 
                    alt="Upload" 
                    className="w-12 h-12 opacity-60 group-hover:opacity-100 transition-opacity"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-slate-300"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>';
                    }}
                />
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-lg font-bold text-slate-200 group-hover:text-white transition-colors">
                Click or Drop JSON File
              </p>
              <p className="text-sm text-slate-400">
                Supports standard IR JSON format
              </p>
            </div>
          </div>
        )}
      </div>
    );
  } else {
    return (
      <div className={`
          fixed bottom-4 left-4
          z-50 w-64
          p-4 bg-slate-800/90
          backdrop-blur-md
          rounded-xl shadow-2xl border border-slate-700
          flex flex-col items-center justify-center gap-4
          text-center text-white
          transition-transform hover:scale-[1.02]
          `}>
          
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Add Timeline Data
          </h2>
          <div className="w-full h-px bg-slate-700/50"></div>
          
          <div {...getRootProps({
              className:
                  `w-full p-4 bg-slate-900/50 border border-dashed border-slate-600 rounded-lg
                  flex flex-col items-center justify-center gap-2 text-xs
                  text-slate-300 transition-all duration-300
                  hover:bg-slate-800 hover:border-blue-500/50 cursor-pointer`
          })}>
              <input {...getInputProps()} />
              {isDragActive ? (
                  <p className="text-blue-400 font-bold animate-pulse">Drop Now!</p>
              ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-500 mb-1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <span>Click to add .json</span>
                  </>
              )}
          </div>

          <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider
              bg-red-500/10 text-red-400 border border-red-500/20 
              hover:bg-red-500 hover:text-white transition-all duration-200"
          >
              Reset Timeline
          </button>
      </div>
    );
  }
};
export default FileUpload;