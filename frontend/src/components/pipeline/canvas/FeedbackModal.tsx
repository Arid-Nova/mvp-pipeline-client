import React, { useState } from 'react';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (rating: number, comment: string) => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState("");

    if (!isOpen) return null;

    const handleSubmit = () => {
        onSubmit(rating, comment);
        // Reset state for future (if needed)
        setRating(0);
        setComment("");
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm transition-opacity">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 flex flex-col gap-4 relative overflow-hidden">
                
                {/* Decorative Top Accent */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>

                <div className="text-center mt-2">
                    <h2 className="text-xl font-bold text-slate-100 mb-2">How is your experience?</h2>
                    <p className="text-sm text-slate-400">
                        We noticed you've been busy! How is CONDUIT handling your architectural analysis so far?
                    </p>
                </div>

                {/* Star Rating System */}
                <div className="flex justify-center gap-2 my-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => setRating(star)}
                        >
                            <svg 
                                className={`w-10 h-10 transition-colors ${
                                    star <= (hoverRating || rating) 
                                    ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' 
                                    : 'text-slate-700'
                                }`} 
                                fill="currentColor" 
                                viewBox="0 0 24 24"
                            >
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                        </button>
                    ))}
                </div>

                {/* Conditional Text Box */}
                {rating > 0 && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Any additional thoughts? (Optional)
                        </label>
                        <textarea 
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="What do you like? What is frustrating? Anything you miss?"
                            className="w-full h-24 bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-none"
                        />
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
                    <button 
                        onClick={onClose}
                        className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors px-4 py-2"
                    >
                        Skip for now
                    </button>
                    
                    <button 
                        onClick={handleSubmit}
                        disabled={rating === 0}
                        className={`px-6 py-2 rounded-lg text-sm font-bold shadow-md transition-all ${
                            rating > 0 
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95' 
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                    >
                        Submit Feedback
                    </button>
                </div>
            </div>
        </div>
    );
};