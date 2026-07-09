import React from 'react';

import CitationList from "./CitationList";
import ConfidencePanel from "./ConfidencePanel";
import { ChatbotFlag } from "../../services/types";
import { ChatMessageModel } from "./useChatbotState";
import QualificationNotice from "./QualificationNotice";

export const ChatMessage: React.FC<{ message: ChatMessageModel }> = ({ message }) => {
    const isUser = message.role === "user";
    const flags: ChatbotFlag[] = message.response?.flags || [];
    const isUnavailable = flags.includes("model_unavailable");

    return (
        <div className={`flex flex-col w-full ${isUser ? "items-end" : "items-start"} mb-6 group animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out`}>
            <div className={`flex items-center gap-2 mb-2 px-1 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                {isUser ? (
                    <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-sm">
                        <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                ) : (
                    <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-cyan-500/10 to-blue-600/15 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-sm">
                        <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                    </div>
                )}
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                    {isUser ? "You" : "AridNova Assistant"}
                </span>
            </div>

            <div className={`w-full max-w-[88%] rounded-2xl px-4 py-3.5 text-sm shadow-md ${
                isUser 
                    ? "bg-gradient-to-br from-cyan-600 to-blue-600 text-slate-200 rounded-tr-sm" 
                    : isUnavailable 
                        ? "bg-rose-950/40 border border-rose-500/20 text-rose-200 rounded-tl-sm backdrop-blur-md" 
                        : "bg-slate-800/70 border border-white/5 text-slate-200 rounded-tl-sm backdrop-blur-md"
            }`}>
                {isUser ? (
                    <div className="whitespace-pre-wrap leading-relaxed break-words font-medium">{message.content}</div>
                ) : (
                    <div className="flex flex-col w-full">
                        <div data-testid="answer-section">
                            <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-slate-400/80 uppercase tracking-widest mb-2">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                                </svg>
                                Direct answer
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed break-words text-[13.5px] text-slate-200">{message.content}</div>
                        </div>

                        {message.response && (
                            <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-4">
                                <ConfidencePanel response={message.response} />
                                <QualificationNotice response={message.response} />
                                <CitationList citations={message.response.citations || []} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatMessage;