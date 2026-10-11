import { Component } from "react";

import { toFatalInfo } from "@/lib/fatal/classify.utils";
import {
  clearFatal,
  isCurrentSessionSafe,
  reportFatal,
  requestSafeMode,
  subscribeFatal,
} from "@/lib/fatal/report.utils";
import { attemptSync } from "@/lib/utils/attempt.utils";
import type { FatalInfo } from "@/types/fatal";
import type { ErrorBoundaryProps, ErrorBoundaryState } from "@/types/ui";

import { FatalScreen } from "./fatal/screen.fatal";

interface FatalBoundaryState extends ErrorBoundaryState {
  info: FatalInfo | null;
  live: FatalInfo | null;
  retries: number;
}

function readThemeName(): string {
  const dataset = typeof document !== "undefined" ? document.documentElement?.dataset : undefined;
  if (dataset?.theme) return dataset.theme;
  if (typeof localStorage === "undefined") return "win95";
  const [raw, readError] = attemptSync(() => localStorage.getItem("themeVars"));
  if (readError !== null || !raw) return "win95";
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || typeof parsed !== "object" || parsed === null) return "win95";
  const name = (parsed as { themeName?: unknown }).themeName;
  return typeof name === "string" ? name : "win95";
}

function readRoute(): string {
  if (typeof window !== "undefined" && typeof window.location?.pathname === "string") {
    return window.location.pathname;
  }
  return "/";
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, FatalBoundaryState> {
  state: FatalBoundaryState = { error: null, info: null, live: null, retries: 0 };
  private stopLive: (() => void) | null = null;

  static getDerivedStateFromError(error: Error): Partial<FatalBoundaryState> {
    return { error };
  }

  componentDidMount() {
    clearFatal();
    this.stopLive = subscribeFatal((live) => {
      if (live) this.setState({ live });
    });
  }

  componentWillUnmount() {
    this.stopLive?.();
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
    const info: FatalInfo = {
      ...toFatalInfo(error, { scope: "render", route: readRoute(), themeName: readThemeName() }),
      retryCount: this.state.retries,
    };
    reportFatal(info);
    this.setState((state) => ({ info, retries: state.retries + 1 }));
  }

  private reload(safe: boolean): void {
    if (safe) requestSafeMode();
    if (this.props.onResetCache) {
      const [, cacheError] = attemptSync(() => this.props.onResetCache?.());
      if (cacheError !== null) console.error("Fatal cache reset failed:", cacheError);
    }
    clearFatal();
    if (this.props.onReloadPage) this.props.onReloadPage();
    else window.location.reload();
  }

  private handleRetry = (): void => {
    clearFatal();
    this.setState({ error: null, info: null, live: null });
  };

  render() {
    if (!this.state.error && !this.state.live) return this.props.children;
    const base = this.state.info ?? this.state.live;
    const fatal: FatalInfo =
      base ??
      ({
        ...toFatalInfo(this.state.error, {
          scope: "render",
          route: readRoute(),
          themeName: readThemeName(),
        }),
        retryCount: this.state.retries,
      } satisfies FatalInfo);
    return (
      <FatalScreen
        info={fatal}
        safe={isCurrentSessionSafe()}
        onReload={() => this.reload(false)}
        onSafeReload={() => this.reload(true)}
        onRetry={this.handleRetry}
      />
    );
  }
}
