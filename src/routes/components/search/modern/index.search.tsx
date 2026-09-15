import { cn } from "cn";
import { Image } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { TabLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { DITHER_PLACEHOLDER_SRC } from "@/config/utils/dither.config";
import { useWallpaperImage } from "@/hooks/wallpaper.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { shouldDimMascot } from "@/lib/search/mascot.utils";
import { buildShadowGradients, buildWallpaperFilter } from "@/lib/search/wallpaper.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useSettingsStore } from "@/store/settings.store";

import DitherSettings from "./dither/settings.dither";
import InputSearch from "./input.search";
import WallpaperCanvas from "./wallpaper.canvas";

const MASCOT_SRC = "/avatar.png";

function SearchModern() {
  const { t } = useI18n();
  const [ditherModal, setDitherModal] = useState<boolean>(false);
  const filters = useSettingsStore((state) => state.wallpaperFilters);
  const displayShadow = useSettingsStore((state) => state.wallpaperShadow);
  const selectedId = useSettingsStore((state) => state.selectedDitherId);
  const scanlines = useSettingsStore((state) => state.wallpaperScanlines);
  const showMascot = useSettingsStore((state) => state.searchMascotEnabled);
  const [docked, setDocked] = useState<boolean>(false);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [mascot, setMascot] = useState<HTMLDivElement | null>(null);
  const [dimmed, setDimmed] = useState<boolean>(false);
  const stageRef = useRef<HTMLElement>(null);
  const { data, isError } = useWallpaperImage();
  const wallpaperShadowStyle = buildShadowGradients(displayShadow);

  useEffect(() => {
    if (isError) showError(t("common.error"), t("search.dither.load.error"));
  }, [isError, t]);

  useLayoutEffect(() => {
    if (panel === null || mascot === null) {
      setDimmed(false);
      return;
    }
    const measure = () => {
      const next = shouldDimMascot(mascot.getBoundingClientRect(), panel.getBoundingClientRect());
      setDimmed((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(mascot);
    const stage = stageRef.current;
    if (stage !== null) observer.observe(stage);
    return () => observer.disconnect();
  }, [panel, mascot]);

  const mascotVisible = showMascot && !docked;

  if (selectedId !== null && data === undefined && !isError) {
    return <TabLoader className="absolute inset-0 z-20 flex items-center justify-center" />;
  }
  return (
    <section ref={stageRef} className="relative flex h-full w-full">
      {mascotVisible && (
        <div
          ref={setMascot}
          data-testid="search-mascot"
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 z-50 size-54 transition-opacity duration-200 motion-reduce:transition-none lg:size-64",
            dimmed ? "opacity-50" : "opacity-100"
          )}
        >
          <ImageComponent src={MASCOT_SRC} alt="" className="h-full w-full" />
        </div>
      )}

      <InputSearch onDockedChange={setDocked} panelRef={setPanel} />

      <Button
        size="icon"
        className="absolute top-2 right-2 z-10"
        title={t("search.dither.title")}
        onClick={() => setDitherModal(true)}
      >
        <Image className="size-5" />
      </Button>

      <WallpaperCanvas
        src={data?.url ?? DITHER_PLACEHOLDER_SRC}
        alt="placeholder"
        className="h-full w-full"
        filter={buildWallpaperFilter(filters)}
      />
      {scanlines && (
        <div
          className="wallpaper-scanlines pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
      )}
      {wallpaperShadowStyle !== undefined && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: wallpaperShadowStyle }}
        />
      )}

      {ditherModal && <DitherSettings onClose={() => setDitherModal(false)} />}
    </section>
  );
}

export default SearchModern;
