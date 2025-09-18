import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  setNotification: (notification: any) => void;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component:", error, errorInfo);
    // Call the notification function passed in as a prop
    this.props.setNotification({
        type: 'error',
        message: `A rendering error occurred: ${error.message}`
    });
  }

  public render() {
    // If an error occurred, you can choose to render nothing, or a minimal fallback.
    // Here we'll render nothing, as the toast will provide the feedback.
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;