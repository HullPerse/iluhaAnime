import { User } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniListViewState } from "@/types/anilist";

export default function AniListStateViews({
  view,
  onLogin,
}: {
  view: AniListViewState | null;
  onLogin: () => void;
}) {
  const { t } = useI18n();
  switch (view) {
    case "loading":
    case "globalLoading": {
      return (
        <section className="flex flex-1 items-center justify-center">
          <SmallLoader />
        </section>
      );
    }
    case "login": {
      return (
        <section className="flex flex-1 flex-col items-center justify-center gap-2">
          <User className="text-hint size-8" />
          <span className="windows95-text">{t("anilist.route.login.prompt")}</span>
          <Button onClick={onLogin}>{t("anilist.route.login")}</Button>
        </section>
      );
    }
    default: {
      return null;
    }
  }
}
