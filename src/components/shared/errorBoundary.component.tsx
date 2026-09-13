import { CircleX } from "lucide-react";
import { Component } from "react";

import type { ErrorBoundaryProps, ErrorBoundaryState } from "@/types/ui";

import { BigError } from "./error.component";

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <BigError
          error={this.state.error}
          icon={<CircleX className="size-28 animate-pulse text-red-500" />}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
