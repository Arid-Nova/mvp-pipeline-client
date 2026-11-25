import React from 'react';

export const ChatComposer: React.FC<{
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
    /** Disables only the Send action (the text stays editable); does not control the spinner. */
    submitDisabled?: boolean;
    /** Shows the spinner only while a request or plan is actively running. */
    busy?: boolean;
    placeholder?: string;
    /** ID of an element explaining why Send is disabled. */
    submitDescribedBy?: string;
}> = ({ value, onChange, onSubmit, disabled, submitDisabled, busy = false, placeholder = "Ask about architecture, risks...", submitDescribedBy }) => {
    const blocked = Boolean(disabled || submitDisabled || busy);
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
                            if (!submitDisabled) onSubmit();
                        }
                    }}
                    placeholder={placeholder}
                    className="flex-1 max-h-[120px] min-h-[40px] bg-transparent border-none text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:ring-0 resize-none custom-scrollbar placeholder:text-slate-500 m-0 leading-relaxed"
                    disabled={disabled}
                    rows={1}
                />
                
                {/* Submit Button */}
                <button
                    data-testid="chatbot-submit"
                    onClick={onSubmit}
                    disabled={blocked || !value.trim()}
                    title="Send message"
                    aria-describedby={submitDescribedBy}
                    className="shrink-0 w-[36px] h-[36px] flex items-center justify-center rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800/80 disabled:text-slate-600 text-white transition-all shadow-md mb-0.5 mr-0.5 group"
                >
                    {busy ? (
                        <svg className="w-4 h-4 animate-spin text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
