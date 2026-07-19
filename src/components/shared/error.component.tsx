import { Component, type ReactNode, type ErrorInfo } from "react";
import { CircleX, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export function BigError({ error, icon }: { error: Error; icon: ReactNode }) {
  return (
    <main className="absolute flex h-screen w-screen flex-col items-center justify-center gap-4 px-2 font-extrabold text-text">
      {icon}
      <span className="text-center text-xl text-text">{error.message}</span>
    </main>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="absolute flex h-screen w-screen flex-col items-center justify-center gap-4 px-2 font-extrabold text-text">
          <CircleX className="size-28 animate-pulse text-red-500" />
          <span className="text-center text-xl text-text">
            {this.state.error.message || "Произошла ошибка"}
          </span>
          <button
            className="windows95-btn flex items-center gap-1 px-4 py-1 text-sm"
            onClick={() => this.setState({ error: null })}
          >
            <RotateCcw className="size-4" />
            Продолжить
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
