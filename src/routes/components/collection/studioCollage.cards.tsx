import StudioCover from "@/routes/components/collection/studioCover.cards";
import type { DitherPreset } from "@/types/graphics/dither";

export default function StudioCollage({
  title,
  collage,
  ditherPreset,
}: {
  title: string;
  collage: string[];
  ditherPreset?: DitherPreset;
}) {
  const covers = Array.from({ length: 4 }, (_, index) => collage[index] ?? "");

  return (
    <div className="cards-studio-grid" aria-label={title}>
      {covers.map((cover, index) => (
        <div key={index} className="cards-studio-cell">
          <StudioCover cover={cover} title={title} ditherPreset={ditherPreset} />
        </div>
      ))}
    </div>
  );
}
