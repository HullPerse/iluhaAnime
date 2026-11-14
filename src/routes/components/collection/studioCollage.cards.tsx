import StudioCover from "@/routes/components/collection/studioCover.cards";

export default function StudioCollage({ title, collage }: { title: string; collage: string[] }) {
  const covers = Array.from({ length: 4 }, (_, index) => collage[index] ?? "");
  return (
    <div className="cards-studio-grid" aria-label={title}>
      {covers.map((cover, index) => (
        <div key={index} className="cards-studio-cell">
          <StudioCover cover={cover} title={title} />
        </div>
      ))}
    </div>
  );
}
