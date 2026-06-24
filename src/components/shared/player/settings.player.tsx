import { VideoStreamInfo } from "@/types";
import { getTrackSelection } from "@/lib/storage.utils";
import { Button } from "@/components/ui/button.component";
import Slider from "@/components/ui/range.component";

function Settings({
  settings,
  onChange,
  mediaPath,
  subtitleStreams,
}: {
  settings: any;
  onChange: (p: any) => void;
  mediaPath?: string;
  subtitleStreams: VideoStreamInfo[];
}) {
  const D = {
    rotation: 0,
    flipH: false,
    flipV: false,
    zoom: 1,
    aspectRatio: "contain" as const,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    sepia: 0,
    grayscale: 0,
    subFontSize: 18,
    subFontFamily: "Arial",
    subColor: "#ffffff",
    subBgOpacity: 0,
    subBgColor: "#000000",
  };
  const reset = () => onChange(D);

  const currentSub =
    mediaPath &&
    (() => {
      const idx = getTrackSelection(mediaPath, "sub");
      return idx !== undefined
        ? subtitleStreams.find((s) => s.index === idx)
        : undefined;
    })();
  const isVttSub =
    currentSub &&
    currentSub.codec_name !== "ass" &&
    currentSub.codec_name !== "ssa";

  return (
    <div className="flex flex-col gap-2 windows95-text max-h-80 overflow-y-auto p-2">
      <span className="font-bold">Трансформация</span>
      <Slider
        label="Поворот"
        min={0}
        max={360}
        step={1}
        value={settings.rotation}
        onChange={(v) => onChange({ rotation: v })}
        suffix="°"
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.flipH}
          onChange={(e) => onChange({ flipH: e.target.checked })}
        />
        Отразить по горизонтали
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.flipV}
          onChange={(e) => onChange({ flipV: e.target.checked })}
        />
        Отразить по вертикали
      </label>
      <Slider
        label="Масштаб"
        min={0.1}
        max={3}
        step={0.01}
        value={settings.zoom}
        onChange={(v) => onChange({ zoom: v })}
        suffix="x"
      />
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0">Соотношение</span>
        <select
          value={settings.aspectRatio}
          onChange={(e) => onChange({ aspectRatio: e.target.value })}
          className="flex-1 h-5 windows95-border bg-primary text-[10px] windows95-font"
        >
          <option value="contain">Fit</option>
          <option value="fill">Stretch</option>
          <option value="cover">Crop</option>
          <option value="none">Original</option>
          <option value="scale-down">Scale down</option>
        </select>
      </label>

      <hr className="border-muted my-1" />
      <span className="font-bold">Фильтры</span>
      <Slider
        label="Яркость"
        min={0}
        max={200}
        step={1}
        value={settings.brightness}
        onChange={(v) => onChange({ brightness: v })}
        suffix="%"
      />
      <Slider
        label="Контраст"
        min={0}
        max={200}
        step={1}
        value={settings.contrast}
        onChange={(v) => onChange({ contrast: v })}
        suffix="%"
      />
      <Slider
        label="Насыщенность"
        min={0}
        max={200}
        step={1}
        value={settings.saturation}
        onChange={(v) => onChange({ saturation: v })}
        suffix="%"
      />
      <Slider
        label="Оттенок"
        min={0}
        max={360}
        step={1}
        value={settings.hue}
        onChange={(v) => onChange({ hue: v })}
        suffix="°"
      />
      <Slider
        label="Размытие"
        min={0}
        max={10}
        step={0.5}
        value={settings.blur}
        onChange={(v) => onChange({ blur: v })}
        suffix="px"
      />
      <Slider
        label="Сепия"
        min={0}
        max={100}
        step={1}
        value={settings.sepia}
        onChange={(v) => onChange({ sepia: v })}
        suffix="%"
      />
      <Slider
        label="Ч/Б"
        min={0}
        max={100}
        step={1}
        value={settings.grayscale}
        onChange={(v) => onChange({ grayscale: v })}
        suffix="%"
      />

      {isVttSub && (
        <>
          <hr className="border-muted my-1" />
          <span className="font-bold">Субтитры (VTT)</span>
          <Slider
            label="Размер"
            min={12}
            max={48}
            step={1}
            value={settings.subFontSize}
            onChange={(v) => onChange({ subFontSize: v })}
            suffix="px"
          />
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0">Шрифт</span>
            <select
              value={settings.subFontFamily}
              onChange={(e) => onChange({ subFontFamily: e.target.value })}
              className="flex-1 h-5 windows95-border bg-primary text-[10px] windows95-font"
            >
              <option value="Arial">Arial</option>
              <option value="Tahoma">Tahoma</option>
              <option value="Verdana">Verdana</option>
              <option value="'Courier New'">Courier New</option>
              <option value="Georgia">Georgia</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0">Цвет</span>
            <input
              type="color"
              value={settings.subColor}
              onChange={(e) => onChange({ subColor: e.target.value })}
              className="h-5 w-10 windows95-border cursor-pointer"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0">Фон</span>
            <input
              type="color"
              value={settings.subBgColor}
              onChange={(e) => onChange({ subBgColor: e.target.value })}
              className="h-5 w-10 windows95-border cursor-pointer"
            />
            <Slider
              min={0}
              max={100}
              step={1}
              value={settings.subBgOpacity}
              onChange={(v) => onChange({ subBgOpacity: v })}
              suffix="%"
            />
          </label>
        </>
      )}

      <Button className="mt-1" onClick={reset}>
        Сбросить
      </Button>
    </div>
  );
}

export default Settings;
