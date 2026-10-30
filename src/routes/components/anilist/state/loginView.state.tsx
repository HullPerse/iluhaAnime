import { User } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export function LoginView({ onLogin }: { onLogin: () => void }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2">
      <User className="text-hint size-8" />
      <span className="windows95-text">{t("anilist.route.login.prompt")}</span>
      <Button onClick={onLogin}>{t("anilist.route.login")}</Button>
    </section>
  );
}
