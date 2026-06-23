import React, { useState, useEffect } from 'react';
import { Notification } from '../../utils/notifications';

interface NotificationToastProps {
    notification: Notification | null;
    onClose: () => void;
}

const NotificationToast = ({ notification, onClose }: NotificationToastProps) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        if (notification && notification.message) {
            setIsVisible(true);
            setIsExiting(false);
            
            const timer = setTimeout(() => {
                setIsExiting(true);
                setTimeout(() => {
                    setIsVisible(false);
                    onClose();
                }, 300); // Wait for fade out animation
            }, notification.duration || 5000);

            return () => clearTimeout(timer);
        }
    }, [notification, onClose]);

    if (!notification || !notification.message || !isVisible) {
        return null;
    }

    const getBackgroundColor = () => {
        switch (notification.type) {
            case 'error':
                return 'bg-red-500';
            case 'warning':
                return 'bg-yellow-500';
            case 'success':
                return 'bg-green-500';
            case 'info':
                return 'bg-blue-500';
            default:
                return 'bg-gray-500';
        }
    };

    const getIcon = () => {
        switch (notification.type) {
            case 'error':
                return '❌';
            case 'warning':
                return '⚠️';
            case 'success':
                return '✅';
            case 'info':
                return 'ℹ️';
            default:
                return 'ℹ️';
        }
    };

    const getTitle = () => {
    switch (notification.type) {
        case 'error':
            return 'Something went wrong!';
        case 'warning':
            return 'Heads up!';
        case 'success':
            return 'All set!'; 
        default:
            return 'Information:';
    }
}

     const handleClose = () => {
        try {
            setIsExiting(true);
            setTimeout(() => {
                setIsVisible(false);
                onClose();
            }, 300);
        } catch (error) {
            console.error('Error closing notification:', error);
            // Force closing if there's an error
            setIsVisible(false);
            onClose();
        }
    };

    return (
        <div 
            className={`
                fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg text-white backdrop-blur-sm
                transform transition-all duration-300 ease-in-out
                ${getBackgroundColor()}
                ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
            `}
            style={{ minWidth: '300px' }}
        >
            <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                    <span className="text-2xl flex-shrink-0">
                        {getIcon()}
                    </span>
                    <div className="flex-1">
                        <h4 className="font-semibold text-base mb-1">
                            {getTitle()}
                        </h4>
                        <p className="text-sm leading-relaxed text-slate-200">
                            {notification.message}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setIsExiting(true);
                        setTimeout(() => {
                            setIsVisible(false);
                            onClose();
                        }, 300);
                    }}
                    onTouchEnd={(e) => {
                        e.preventDefault(); 
                        setIsExiting(true);
                        setTimeout(() => {
                            setIsVisible(false);
                            onClose();
                        }, 300);
                    }}
                    className="ml-2 text-slate-300 hover:text-white transition-colors p-1"
                    aria-label="Close notification"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            {/* Progress bar */}
            {/* You can uncomment this to re-enable the progress bar */}
            {/*
            <div className="mt-4 w-full h-1 bg-white/20 rounded-full overflow-hidden">
                <div 
                    className="h-full rounded-full bg-white transition-all ease-linear"
                    style={{ 
                        width: '100%',
                        animation: `progressShrink ${notification.duration || 5000}ms linear forwards`
                    }}
                />
            </div>
            */}

            {/* Inline style for animation */}
            <style>
                {`
                    @keyframes progressShrink {
                        from { width: 100%; }
                        to { width: 0%; }
                    }
                `}
            </style>
        </div>
    );
};

export default NotificationToast;