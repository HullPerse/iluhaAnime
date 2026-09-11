import { Image } from "lucide-react";
import { useEffect, useState } from "react";

import { TabLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import WallpaperCanvas from "./wallpaper.canvas";
import { DITHER_PLACEHOLDER_SRC } from "@/config/utils/dither.config";
import { useWallpaperImage } from "@/hooks/wallpaper.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { buildShadowGradients, buildWallpaperFilter } from "@/lib/search/wallpaper.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useSettingsStore } from "@/store/settings.store";

import DitherSettings from "./dither/settings.dither";
import InputSearch from "./input.search";

function SearchModern() {
  const { t } = useI18n();
  const [ditherModal, setDitherModal] = useState<boolean>(false);
  const filters = useSettingsStore((state) => state.wallpaperFilters);
  const displayShadow = useSettingsStore((state) => state.wallpaperShadow);
  const selectedId = useSettingsStore((state) => state.selectedDitherId);
  const parallax = useSettingsStore((state) => state.wallpaperParallax);
  const scanlines = useSettingsStore((state) => state.wallpaperScanlines);
  const { data, isError } = useWallpaperImage();
  const wallpaperShadowStyle = buildShadowGradients(displayShadow);

  useEffect(() => {
    if (isError) showError(t("common.error"), t("search.dither.load.error"));
  }, [isError, t]);

  if (selectedId !== null && data === undefined && !isError) {
    return <TabLoader className="absolute inset-0 z-20 flex items-center justify-center" />;
  }

  return (
    <section className="relative flex h-full w-full">
      <InputSearch />

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
        parallax={parallax}
      />
      {scanlines && (
        <div className="wallpaper-scanlines pointer-events-none absolute inset-0" aria-hidden="true" />
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
