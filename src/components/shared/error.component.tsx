import { Component, type ReactNode, type ErrorInfo } from "react";
import { CircleX, RotateCcw, X } from "lucide-react";
import { Button } from "../ui/button.component";
import ImageComponent from "@/components/ui/image.component";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export function BigError({
  error,
  icon,
  onRetry,
}: {
  error: Error;
  icon: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" />
      <main className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col w-xl max-w-[90%] bg-primary windows95-active-border windows95-3d-border">
        <section className="flex items-center justify-between bg-secondary w-full p-1">
          <div className="flex items-center gap-1 min-w-0">
            <ImageComponent
              src="/icons/w2k_computer.ico"
              alt=""
              className="size-4 shrink-0"
            />
            <span className="text-white windows95-text font-bold">Ошибка</span>
          </div>
          {onRetry && (
            <button
              className="size-4 flex items-center justify-center windows95-active-border bg-primary text-text windows95-text cursor-pointer hover:brightness-110 active:translate-x-px active:translate-y-px"
              onClick={onRetry}
            >
              <X className="size-2.5" />
            </button>
          )}
        </section>
        <section className="flex flex-col items-center gap-4 p-4 bg-primary">
          {icon}
          <span className="text-center text-base text-text font-bold">
            {error.message}
          </span>
          {onRetry && (
            <Button
              className="flex items-center gap-1 w-28 h-8"
              onClick={onRetry}
            >
              <RotateCcw className="size-4" />
              Продолжить
            </Button>
          )}
        </section>
      </main>
    </>
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
