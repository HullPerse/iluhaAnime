import type { ComponentType } from "react";

import type { AniListViewState } from "@/types/anilist/anilist";

import { FriendErrorView } from "./state/friendErrorView.state";
import { LoadingView } from "./state/loadingView.state";
import { LoginView } from "./state/loginView.state";

const STATE_VIEWS: Record<string, ComponentType<{ onLogin: () => void }>> = {
  loading: LoadingView,
  globalLoading: LoadingView,
  friendLoading: LoadingView,
  friendError: FriendErrorView,
  login: LoginView,
};

export default function AniListStateViews({
  view,
  onLogin,
}: {
  view: AniListViewState | null;
  onLogin: () => void;
}) {
  const StateView = view === null ? undefined : STATE_VIEWS[view];
  return StateView ? <StateView onLogin={onLogin} /> : null;
}
