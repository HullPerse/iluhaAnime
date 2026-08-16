import { CircleX, RotateCcw } from "lucide-react";
import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/i18n";

import { Button } from "../ui/button.component";

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
  const { t } = useI18n();
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" />
      <main className="bg-primary windows95-active-border windows95-3d-border fixed top-1/2 left-1/2 z-50 flex w-xl max-w-[90%] -translate-x-1/2 -translate-y-1/2 flex-col">
        <section className="bg-secondary flex w-full items-center justify-between p-1">
          <div className="flex min-w-0 items-center gap-1">
            <ImageComponent
              src="/images/w2k_computer.ico"
              alt=""
              className="size-4 shrink-0"
            />
            <span className="windows95-text font-bold text-white">
              {t("common.error")}
            </span>
          </div>
          {onRetry && (
            <button
              type="button"
              aria-label={t("common.continue")}
              title={t("common.continue")}
              className="windows95-active-border bg-primary text-text windows95-text flex size-4 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
              onClick={onRetry}
            >
              <RotateCcw className="size-2.5" />
            </button>
          )}
        </section>
        <section className="bg-primary flex flex-col items-center gap-4 p-4">
          {icon}
          <span className="text-text text-center text-base font-bold">
            {error.message}
          </span>
          {onRetry && (
            <Button
              className="flex h-8 w-28 items-center gap-1"
              onClick={onRetry}
            >
              <RotateCcw className="size-4" />
              {t("common.continue")}
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
