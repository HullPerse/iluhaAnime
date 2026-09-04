import { Inbox } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export default function SearchEmptyState({ visible }: { visible: boolean }) {
  const { t } = useI18n();
  if (!visible) return null;
  return (
    <section className="ui-empty-state flex-1 flex-col">
      <Inbox className="size-8" />
      <span className="windows95-text">{t("search.nothing.found")}</span>
      <span className="windows95-text text-xs">{t("search.try.different")}</span>
    </section>
  );
}
