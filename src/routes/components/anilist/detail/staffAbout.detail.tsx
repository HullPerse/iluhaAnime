import { useState } from "react";

import Section from "@/components/shared/section.component";
import { useI18n } from "@/hooks/i18n.hook";

export function StaffAboutSection({ about }: { about: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (about === "") {
    return null;
  }
  return (
    <Section
      header={t("anilist.staff.about")}
      className="windows95-text bg-field leading-relaxed whitespace-pre-line"
      expanded={expanded}
      onExpand={() => setExpanded((prev) => !prev)}
    >
      <span className="text-xs">{expanded ? about : about.split("\n")[0]}</span>
    </Section>
  );
}
