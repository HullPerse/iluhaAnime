import { Lock, User } from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniListViewState } from "@/types/anilist";

import AniListLoader from "./loader.anilist";

function LoadingView() {
  return <AniListLoader className="flex-1" />;
}

function FriendErrorView() {
  const { t } = useI18n();
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2">
      <Lock className="text-hint size-8" />
      <span className="windows95-text">{t("anilist.friends.private")}</span>
    </section>
  );
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2">
      <User className="text-hint size-8" />
      <span className="windows95-text">{t("anilist.route.login.prompt")}</span>
      <Button onClick={onLogin}>{t("anilist.route.login")}</Button>
    </section>
  );
}

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
