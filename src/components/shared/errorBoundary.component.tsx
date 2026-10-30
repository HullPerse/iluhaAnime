import { Component } from "react";

import { toFatalInfo } from "@/lib/core/fatalClassify.utils";
import { readRoutePath } from "@/lib/core/routePath.utils";
import {
  clearFatal,
  isCurrentSessionSafe,
  reportFatal,
  requestSafeMode,
  subscribeFatal,
} from "@/lib/core/report.utils";
import { readThemeName } from "@/lib/core/fatalTheme.utils";
import { attemptSync } from "@/lib/core/attempt.utils";
import type { FatalInfo } from "@/types/core/fatal";
import type { ErrorBoundaryProps, ErrorBoundaryState } from "@/types/core/ui";

import { FatalScreen } from "@/components/shared/fatal/screen.fatal";

interface FatalBoundaryState extends ErrorBoundaryState {
  info: FatalInfo | null;
  live: FatalInfo | null;
  retries: number;
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
      if (live && !this.state.info) this.setState({ live });
    });
  }

  componentWillUnmount() {
    this.stopLive?.();
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
    const info: FatalInfo = {
      ...toFatalInfo(error, {
        scope: "render",
        route: readRoutePath(),
        themeName: readThemeName(),
      }),
      retryCount: this.state.retries,
    };
    this.setState((state) => ({ info, retries: state.retries + 1 }));
    reportFatal(info);
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
          route: readRoutePath(),
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
