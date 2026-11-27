import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ReaderLoupe } from "@/routes/components/manga/reader/loupe.reader";
import { ReaderToolsSettings } from "@/routes/components/manga/reader/toolsSettings.reader";
import { patchSettings } from "@/store/settings.store";

let dialog: HTMLDialogElement | null = null;

afterEach(() => {
  cleanup();
  patchSettings({ mangaLoupeHideCursor: true });
  dialog?.remove();
  dialog = null;
});

it("renders under the pointer outside a transformed scroll row", () => {
  dialog = document.createElement("dialog");
  const row = document.createElement("div");
  row.style.transform = "translateY(140px)";
  const image = document.createElement("img");
  image.src = "blob:page";
  image.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  row.append(image);
  dialog.append(row);
  document.body.append(dialog);

  render(<ReaderLoupe image={image} />);
  act(() => {
    image.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 300, clientY: 200, altKey: true })
    );
  });

  const loupe = document.querySelector<HTMLElement>("[data-reader-loupe]");

  expect(loupe).not.toBeNull();
  expect(loupe?.parentElement).toBe(dialog);
  expect(loupe?.style.left).toBe("180px");
  expect(loupe?.style.top).toBe("80px");
});

it("hides the image cursor only while the loupe is visible", () => {
  const image = document.createElement("img");
  image.style.cursor = "zoom-in";
  image.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  dialog = document.createElement("dialog");
  dialog.append(image);
  document.body.append(dialog);
  const { unmount } = render(<ReaderLoupe image={image} />);
  const moveWithAlt = () => {
    image.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 300, clientY: 200, altKey: true })
    );
  };

  expect(image.style.cursor).toBe("zoom-in");
  act(moveWithAlt);
  expect(image.style.cursor).toBe("none");
  act(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" })));
  expect(image.style.cursor).toBe("zoom-in");
  act(moveWithAlt);
  act(() => window.dispatchEvent(new Event("blur")));
  expect(image.style.cursor).toBe("zoom-in");
  act(moveWithAlt);
  unmount();
  expect(image.style.cursor).toBe("zoom-in");
});

it("keeps the loupe visible with the cursor when hiding is unchecked", () => {
  const image = document.createElement("img");
  image.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  dialog = document.createElement("dialog");
  dialog.append(image);
  document.body.append(dialog);
  render(
    <>
      <ReaderLoupe image={image} />
      <ReaderToolsSettings autoRunning={false} onAutoToggle={() => undefined} />
    </>
  );
  const checkbox = screen.getByRole("checkbox", { name: "Скрывать курсор при работе лупы" });
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(checkbox);
  expect(checkbox.getAttribute("aria-checked")).toBe("false");

  fireEvent(
    image,
    new MouseEvent("pointermove", {
      bubbles: true,
      clientX: 300,
      clientY: 200,
      altKey: true,
    })
  );
  expect(dialog.querySelector("[data-reader-loupe]")).not.toBeNull();
  expect(image.style.cursor).toBe("");
});
