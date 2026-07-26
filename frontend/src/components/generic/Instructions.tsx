import React, { useState } from "react";

interface InstructionsProps {
    systemName?: string;
    onOpenVersionsModal?: () => void;
}

/**
 * An info icon that expands on hover to show graph instructions.
 */
const Instructions: React.FC<InstructionsProps> = ({ systemName, onOpenVersionsModal }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="tour-graph-options absolute top-4 right-4 z-50 flex flex-row items-start gap-3">

      { /* 0. System name */}
      {systemName && (
          <div className="flex items-center px-4 h-10 bg-slate-900/80 backdrop-blur-md border border-slate-700 text-slate-200 text-sm font-mono tracking-wide rounded-full shadow-lg">
              <span className="w-2 h-2 rounded-full bg-teal-500 mr-2.5 shadow-[0_0_8px_rgba(20,184,166,0.8)]"></span>
              <span className="truncate max-w-[200px]" title={systemName}>
                  {systemName}
              </span>
          </div>
      )}

      {/* 1. VERSIONS MODAL BUTTON */}
      <div className="relative group">
          <button 
              onClick={() => {
                  if (onOpenVersionsModal) {
                      onOpenVersionsModal();
                  }
              }}
              className="w-10 h-10 flex-shrink-0 bg-slate-900/80 backdrop-blur-md border border-slate-700 text-slate-300 hover:bg-teal-500 hover:text-white hover:border-teal-400 rounded-full flex items-center justify-center transition-all shadow-lg"
              title="Load Specific Snapshots"
          >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5" />
              </svg>
          </button>
          
          {/* Tooltip */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 text-[10px] font-mono tracking-wide bg-slate-800 border border-slate-700 text-slate-300 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-xl">
              Load Historic Snapshots
          </div>
      </div>

      {/* 2. TOUR BUTTON */}
      <div className="relative group">
          <button 
              onClick={() => window.dispatchEvent(new Event('trigger-viz-tour'))}
              className="w-10 h-10 flex-shrink-0 bg-slate-900/80 backdrop-blur-md border border-slate-700 text-slate-300 hover:bg-sky-500 hover:text-white hover:border-sky-400 rounded-full flex items-center justify-center transition-all shadow-lg"
              title="Start Tour"
          >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.48 8.52l-2.072 6.215a1 1 0 01-.634.634l-6.215 2.072a1 1 0 01-1.268-1.268l2.072-6.215a1 1 0 01.634-.634l6.215-2.072a1 1 0 011.268 1.268z" />
              </svg>
          </button>
          
          {/* Tooltip */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 text-[10px] font-mono tracking-wide bg-slate-800 border border-slate-700 text-slate-300 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-xl">
              Feature Guide
          </div>
      </div>

      {/* 3. INSTRUCTIONS HOVER */}
      <div 
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* The Info Icon */}
        <div className={`w-10 h-10 flex-shrink-0 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-full flex items-center justify-center transition-all shadow-lg cursor-help relative z-20 ${isHovered ? 'bg-sky-500 text-white border-sky-400' : 'text-slate-300'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
        </div>

        {/* Expanded instruction Dropdown */}
        <div
          className={`
            absolute right-0 top-14 transition-all duration-300 ease-out origin-top-right
            bg-slate-900/90 backdrop-blur-xl border border-slate-700
            rounded-xl shadow-2xl z-10 w-72 sm:w-80
            ${isHovered ? 'scale-100 opacity-100 visible translate-y-0' : 'scale-95 opacity-0 invisible -translate-y-2'}
          `}
        >
          <div className="p-5 text-left">
            <h3 className="font-bold text-sm tracking-wide uppercase text-slate-100 mb-3 border-b border-slate-700 pb-2">
              Graph Controls
            </h3>
            <ul className="text-[13px] text-slate-300 space-y-2.5">
              <li className="flex items-start">
                <span className="mr-2.5 text-sky-400 font-bold">→</span>
                <span>Use <b className="text-white font-medium">mouse scroll</b> to zoom in/out.</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2.5 text-sky-400 font-bold">→</span>
                <span><b className="text-white font-medium">Click and drag</b> the background to rotate or pan.</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2.5 text-sky-400 font-bold">→</span>
                <span><b className="text-white font-medium">Click a node</b> to see its properties.</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2.5 text-sky-400 font-bold">→</span>
                <span><b className="text-white font-medium">Click a link</b> to see connection details.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Instructions;