import React from 'react';

interface SummaryPromptProps {
    isOpen: boolean;
    onDismiss: () => void;
    onAccept: () => void;
}

export const SummaryPrompt: React.FC<SummaryPromptProps> = ({ isOpen, onDismiss, onAccept }) => {
    if (!isOpen) return null;

    return (
        <div className="absolute bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 border border-gray-200 z-50 animate-fade-in">
            <p className="text-sm font-medium mb-3 text-gray-800">
                Pipeline execution complete. Would you like a detailed summary of the results?
            </p>
            <div className="flex gap-2 justify-end">
                <button 
                    onClick={onDismiss} 
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                >
                    Dismiss
                </button>
                <button 
                    onClick={onAccept} 
                    className="px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors shadow-sm"
                >
                    Summarize Results
                </button>
            </div>
        </div>
    );
};