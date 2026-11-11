import type { ReactNode } from "react";

import type { NewsRun } from "@/types/news/news";

/** Renders one block's inline runs. Links leave the app instead of navigating the webview. */
export default function RunsNews({
  runs,
  onOpen,
}: {
  runs: readonly NewsRun[];
  onOpen: (url: string) => void;
}) {
  return (
    <>
      {runs.map((run, index) => {
        let content: ReactNode = run.text;
        if (run.italic) content = <em>{content}</em>;
        if (run.bold) content = <strong>{content}</strong>;
        const href = run.href;
        if (href === undefined) return <span key={index}>{content}</span>;
        return (
          <a
            key={index}
            href={href}
            className="text-highlight hover:text-link-hover underline"
            onClick={(event) => {
              event.preventDefault();
              onOpen(href);
            }}
          >
            {content}
          </a>
        );
      })}
    </>
  );
}
