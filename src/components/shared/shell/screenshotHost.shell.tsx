import { useScreenshot } from "@/hooks/screenshot.hook";
import ScreenshotModal from "@/components/shared/screenshot/modal.screenshot";

export function ScreenshotHost() {
  const { capture, close } = useScreenshot();

  return capture ? <ScreenshotModal capture={capture} onClose={close} /> : null;
}
