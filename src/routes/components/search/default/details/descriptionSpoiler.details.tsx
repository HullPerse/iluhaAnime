import Section from "@/components/shared/section.component";
import { SpoilerBody } from "@/routes/components/search/default/details/spoilerBody.details";

export function DescriptionSpoiler({
  index,
  title,
  body,
  open,
  onToggle,
}: {
  index: number;
  title: string;
  body: string;
  open: boolean;
  onToggle: (index: number) => void;
}) {
  return (
    <Section
      header={title || "..."}
      expanded={open}
      onExpand={() => onToggle(index)}
      className="bg-surface"
    >
      <SpoilerBody body={body} />
    </Section>
  );
}
