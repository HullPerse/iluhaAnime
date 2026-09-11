import { Users } from "lucide-react";

import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function StudiosSection({
  studios,
  onStudio,
  onClose,
}: {
  studios: Array<{ id: number; name: string }>;
  onStudio?: (id: number, name: string) => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Section header={t("anilist.details.studios")} className="flex flex-wrap gap-1 bg-white">
      {studios.map((s) => (
        <Button
          key={s.id}
          onClick={() => {
            onStudio?.(s.id, s.name);
            onClose?.();
          }}
          className="bg-primary windows95-text flex flex-row gap-1 px-1 underline decoration-dotted"
          variant="ghost"
          title={t("anilist.details.studio.search")}
        >
          <Users className="size-3" /> {s.name}
        </Button>
      ))}
    </Section>
  );
}
