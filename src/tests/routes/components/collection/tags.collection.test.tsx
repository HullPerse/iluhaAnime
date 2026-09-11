import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FILTER_KEYS } from "@/lib/search/intent.utils";
import { TagsReferenceModal } from "@/routes/components/collection/tags.collection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TagsReferenceModal", () => {
  it("renders nothing when closed", () => {
    render(<TagsReferenceModal open={false} onClose={() => {}} />);
    expect(screen.queryByText(/Search tags|Теги поиска/)).toBeNull();
  });

  it("lists every filter key with an example", () => {
    render(<TagsReferenceModal open onClose={() => {}} />);
    for (const key of Object.keys(FILTER_KEYS)) {
      expect(screen.getByText(key, { exact: true })).toBeTruthy();
    }
    expect(screen.getByText("year>=2000")).toBeTruthy();
    expect(screen.getByText("sort=rating:desc")).toBeTruthy();
  });
});
