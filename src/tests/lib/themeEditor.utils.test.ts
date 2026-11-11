import { describe, expect, it } from "vitest";

import { editorHeaderKey } from "@/lib/graphics/themeEditor.utils";

describe("editorHeaderKey", () => {
  it("labels a patch as customize", () => {
    expect(editorHeaderKey({ patchMode: true, isEdit: false })).toBe("settings.theme.customize");
  });

  it("lets patch mode win over edit", () => {
    expect(editorHeaderKey({ patchMode: true, isEdit: true })).toBe("settings.theme.customize");
  });

  it("distinguishes editing an existing theme from creating one", () => {
    expect(editorHeaderKey({ patchMode: false, isEdit: true })).toBe(
      "settings.theme.edit.title"
    );
    expect(editorHeaderKey({ patchMode: false, isEdit: false })).toBe(
      "settings.theme.create.title"
    );
  });
});
