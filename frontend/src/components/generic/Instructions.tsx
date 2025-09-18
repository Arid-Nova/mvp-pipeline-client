import React, { useState } from "react";

/**
 * An info icon that expands on hover to show graph instructions.
 */
const Instructions: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="absolute top-4 right-4 z-50 flex items-center cursor-help group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Expanded instruction box with glassmorphism effect */}
      <div
        className={`
          origin-right transition-all duration-300 ease-in-out
          bg-gray-900/50 backdrop-blur-lg ring-1 ring-white/10
          rounded-xl shadow-2xl
          ${isHovered ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'}
        `}
      >
        <div className="p-4 w-72 sm:w-80 md:w-96">
          <h3 className="font-bold text-base mb-2 text-slate-100">
            Graph Controls
          </h3>
          <ul className="text-sm text-slate-300 space-y-1.5">
            <li className="flex items-start">
              <span className="mr-2 text-sky-400">→</span>
              Use <b className="mx-1 text-slate-100">mouse scroll</b> to zoom in/out.
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-sky-400">→</span>
              <b className="mr-1 text-slate-100">Click</b> a node or link for details.
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-sky-400">→</span>
              <b className="mr-1 text-slate-100">Double-click</b> a microservice to expand.
            </li>
          </ul>
        </div>
      </div>

      {/* The Info Icon */}
    <div
        className="
        absolute top-2 right-2
        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center 
        bg-gray-700 ring-1 ring-white/20 text-slate-200
        group-hover:bg-sky-500 group-hover:text-white group-hover:scale-110
        transition-all duration-300"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
        >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 9.75a3.375 3.375 0 016.497-1.458c.378.823.378 1.78 0 2.604-.506 1.1-1.611 1.708-2.622 2.25-.964.518-1.5 1.162-1.5 2.104v.375m0 3.375h.008v.008h-.008v-.008z"
        />
        </svg>
      </div>
    </div>
  )
};

export default Instructions;