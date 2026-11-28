import { describe, expect, it } from "vitest";

import { cardSourceLabelKey } from "@/config/cards/labels.config";

describe("cardSourceLabelKey", () => {
  it("maps completion grants written as status to the completion label", () => {
    expect(cardSourceLabelKey("status")).toBe("collection.source.completion");
  });

  it("keeps the daily source label", () => {
    expect(cardSourceLabelKey("daily")).toBe("collection.source.daily");
  });
});
