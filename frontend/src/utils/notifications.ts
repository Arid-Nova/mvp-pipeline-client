// Define the notification interface
export interface Notification {
    type: 'error' | 'warning' | 'success' | 'info';
    message: string;
    duration?: number;
}

// Error notification for errorenous IR files.
let notificationCallback: ((notification: Notification) => void) | null = null;

/**
 * Sets the callback function that will be triggered to show a notification.
 * This should be called once from your main App component.
 * @param callback The function to call to display a notification.
 */
export function setNotificationCallback(callback: (notification: Notification) => void): void {
    notificationCallback = callback;
}

/**
 * Triggers the notification callback to display an error toast.
 * @param message The error message to display.
 */
export function showError(message: string): void {
    if (notificationCallback) {
        notificationCallback({
            type: 'error',
            message: message,
            duration: 5000 // 5 seconds
        });
    } else {
        console.error('Error:', message);
    }
}

/**
 * Triggers the notification callback to display an success toast.
 * @param message The error message to display.
 */
export function showSuccess(message: string): void {
    if (notificationCallback) {
        notificationCallback({
            type: 'success',
            message: message,
            duration: 5000
        });
    } else {
        console.error('Success:', message);
    }
}

// Rendering error capture.
let isRenderingErrorCooldown = false;

/**
 * Shows a toast for a rendering error, but only allows it to be shown
 * once every 5 seconds to prevent spamming the user.
 * @param message The error message to display.
 */
export function showRenderingError(message: string): void {
    if (notificationCallback && !isRenderingErrorCooldown) {
        isRenderingErrorCooldown = true;
        setTimeout(() => {
            isRenderingErrorCooldown = false;
        }, 5000); // 5 second cooldown

        notificationCallback({
            type: 'warning', 
            message: message,
            duration: 5000
        });
    } else {
        console.warn(message);
    }
}