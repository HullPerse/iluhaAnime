import { CircleX } from "lucide-react";
import { Component } from "react";
import type { ReactNode } from "react";

import { BigError } from "./error.component";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
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
