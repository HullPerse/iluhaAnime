import { useRef, useState } from "react";

export function useReaderOverlays() {
  const [pagePicker, setPagePicker] = useState<boolean>(false);
  const [chaptersOpen, setChaptersOpen] = useState<boolean>(false);
  const pageButton = useRef<HTMLButtonElement>(null);
  const chapterButton = useRef<HTMLButtonElement>(null);
  const overlay = pagePicker || chaptersOpen;

  return {
    pagePicker,
    chaptersOpen,
    overlay,
    pageButton,
    chapterButton,
    openPagePicker(open: boolean) {
      if (open) setChaptersOpen(false);
      setPagePicker(open);
    },
    openChapterPicker(open: boolean) {
      if (open) setPagePicker(false);
      setChaptersOpen(open);
    },
    closeOverlay() {
      if (pagePicker) {
        setPagePicker(false);
        pageButton.current?.focus();

        return true;
      }

      if (chaptersOpen) {
        setChaptersOpen(false);
        chapterButton.current?.focus();

        return true;
      }

      return false;
    },
  };
}
