import { TooltipRenderProps } from 'react-joyride';

export const ConduitTourTooltip = ({
    index,
    step,
    isLastStep,
    backProps,
    closeProps,
    primaryProps,
    skipProps,
    tooltipProps,
    size
}: TooltipRenderProps) => {
    return (
        <div 
            {...tooltipProps} 
            className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-7 w-[420px] shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 animate-in fade-in zoom-in-95 duration-300 text-left select-none overflow-hidden"
        >
            {/* Glowing Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 via-teal-400 to-emerald-500 opacity-80"></div>

            {/* Subtle ambient glow behind the content */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

            {/* Close Button */}
            <button 
                {...closeProps} 
                className="absolute top-4 right-4 text-slate-500 hover:text-white hover:bg-slate-800 rounded-full p-1.5 transition-all outline-none"
                title="Close Tour"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {/* Content Injection */}
            <div 
                key={index}
                className="text-slate-200 relative z-10 animate-in fade-in slide-in-from-right-2 duration-300 ease-out fill-mode-both"
            >
                {step.content}
            </div>
            
            {/* Footer Area */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-700/50 relative z-10">
                {/* Left Side: Skip & Modern Progress Indicator */}
                <div className="flex items-center gap-4">
                    {!isLastStep && (
                        <button 
                            {...skipProps}
                            className="text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors outline-none"
                        >
                            Skip
                        </button>
                    )}
                    
                    {/* Animated Pill Progress Indicator */}
                    <div className="relative w-[68px] h-2 overflow-hidden flex items-center">
                        <div 
                            className="flex gap-1.5 absolute transition-transform duration-500 ease-out"
                            style={{ 
                                transform: `translateX(-${Math.max(0, Math.min(index - 2, size - 5)) * 12}px)` 
                            }}
                        >
                            {Array.from({ length: size }).map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`h-1.5 rounded-full transition-all duration-500 shrink-0 ${
                                        i === index 
                                            ? 'w-5 bg-gradient-to-r from-teal-400 to-emerald-400 shadow-[0_0_10px_rgba(45,212,191,0.5)]' 
                                            : i < index 
                                                ? 'w-1.5 bg-slate-500' 
                                                : 'w-1.5 bg-slate-800'
                                    }`} 
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Navigation */}
                <div className="flex items-center gap-2">
                    {index > 0 && (
                        <button 
                            {...backProps}
                            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all outline-none"
                        >
                            Back
                        </button>
                    )}
                    <button 
                        {...primaryProps}
                        className={`px-5 py-2 text-xs font-bold text-white rounded-lg transition-all outline-none border ${
                            isLastStep 
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-emerald-400/20 shadow-lg shadow-emerald-900/50' 
                                : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 border-blue-400/20 shadow-lg shadow-blue-900/50'
                        }`}
                    >
                        {isLastStep ? 'Done' : 'Continue'}
                    </button>
                </div>
            </div>
        </div>
    );
};