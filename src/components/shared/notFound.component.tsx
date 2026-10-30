import { Home, SearchX } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";

export function NotFoundScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="bg-primary windows95-active-border fixed top-1/2 left-1/2 z-50 flex w-xl max-w-[90%] -translate-x-1/2 -translate-y-1/2 flex-col">
      <section className="bg-secondary flex w-full items-center gap-1 p-1">
        <ImageComponent src="/images/w2k_computer.ico" alt="" className="size-4 shrink-0" />
        <span className="windows95-text text-title-text font-bold">
          {t("common.notFound.title")}
        </span>
      </section>
      <section className="bg-primary flex flex-col items-center gap-4 p-4">
        <SearchX className="text-destructive size-20" />
        <span className="text-text text-center text-base font-bold">
          {t("common.notFound.body")}
        </span>
        <Button className="flex h-8 w-28 items-center gap-1" onClick={() => navigate({ to: "/" })}>
          <Home className="size-4" />
          {t("common.notFound.home")}
        </Button>
      </section>
    </div>
  );
}
