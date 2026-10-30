import { Lock } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";

export function FriendErrorView() {
  const { t } = useI18n();
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2">
      <Lock className="text-hint size-8" />
      <span className="windows95-text">{t("anilist.friends.private")}</span>
    </section>
  );
}
