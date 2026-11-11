import RunsNews from "@/routes/components/news/runs.news";
import type { NewsBlock } from "@/types/news/news";

/** Renders the article body. Quote blocks keep the source's blockquote intent. */
export default function ContentNews({
  blocks,
  onOpen,
}: {
  blocks: readonly NewsBlock[];
  onOpen: (url: string) => void;
}) {
  return (
    <div className="windows95-text text-text flex flex-col gap-1.5">
      {blocks.map((block, index) =>
        block.kind === "quote" ? (
          <blockquote
            key={index}
            className="border-muted text-hint my-0 border-l-2 py-0 pr-0 pl-2 leading-relaxed italic"
          >
            <RunsNews runs={block.runs} onOpen={onOpen} />
          </blockquote>
        ) : (
          <p key={index} className="m-0 leading-relaxed">
            <RunsNews runs={block.runs} onOpen={onOpen} />
          </p>
        )
      )}
    </div>
  );
}
