import React from 'react';

export const ChatComposer: React.FC<{
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
}> = ({ value, onChange, onSubmit, disabled }) => {
    return (
        <div className="p-4 bg-slate-900/95 backdrop-blur-lg border-t border-white/5 shrink-0 w-full rounded-b-2xl">
            {/* Unified Input Capsule */}
            <div className="relative flex items-end gap-2 p-1.5 bg-slate-950/50 border border-white/10 rounded-2xl shadow-inner focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/50 transition-all">
                <textarea
                    data-testid="chatbot-input"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSubmit();
                        }
                    }}
                    placeholder="Ask about architecture, risks..."
                    className="flex-1 max-h-[120px] min-h-[40px] bg-transparent border-none text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:ring-0 resize-none custom-scrollbar placeholder:text-slate-500 m-0 leading-relaxed"
                    disabled={disabled}
                    rows={1}
                />
                
                {/* Submit Button */}
                <button
                    data-testid="chatbot-submit"
                    onClick={onSubmit}
                    disabled={disabled || !value.trim()}
                    title="Send message"
                    className="shrink-0 w-[36px] h-[36px] flex items-center justify-center rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800/80 disabled:text-slate-600 text-white transition-all shadow-md mb-0.5 mr-0.5 group"
                >
                    {disabled ? (
                        <svg className="w-4 h-4 animate-spin text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.212 8H18" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                    )}
                </button>
            </div>
            
            <div className="text-center mt-2">
                <span className="text-[9px] text-slate-500 font-medium">Press <kbd className="font-mono bg-slate-800/50 px-1 py-0.5 rounded text-slate-400">Enter</kbd> to send, <kbd className="font-mono bg-slate-800/50 px-1 py-0.5 rounded text-slate-400">Shift + Enter</kbd> for new line</span>
            </div>
        </div>
    );
};

export default ChatComposer;