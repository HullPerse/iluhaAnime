import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ReaderLoupe } from "@/routes/components/manga/reader/loupe.reader";

let dialog: HTMLDialogElement | null = null;

afterEach(() => {
  cleanup();
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
