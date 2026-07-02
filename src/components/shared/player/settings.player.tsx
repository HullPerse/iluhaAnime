import { Button } from "@/components/ui/button.component";
import Slider from "@/components/ui/range.component";
import Select from "@/components/ui/select.component";
import { ColorPickerTrigger } from "@/components/ui/color.component";
import { Checkbox } from "@/components/ui/checkbox.component";

function Settings({
  settings,
  onChange,
}: {
  settings: any;
  onChange: (p: any) => void;
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
    subBgOpacity: 100,
    subBgColor: "#000000",
  };

  const reset = () => onChange(D);

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
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={settings.flipH}
            onChange={(v) => onChange({ flipH: v })}
          />
          Отразить по горизонтали
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={settings.flipV}
            onChange={(v) => onChange({ flipV: v })}
          />
          Отразить по вертикали
        </label>
      <Slider
        label="Масштаб"
        min={0.1}
        max={3}
        step={0.01}
        value={settings.zoom}
        onChange={(v) => onChange({ zoom: v.toFixed(2) })}
        suffix="x"
      />
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0">Соотношение</span>
        <Select
          className="flex-1"
          value={settings.aspectRatio}
          onChange={(v) => onChange({ aspectRatio: v })}
          options={[
            { value: "contain", label: "Fit" },
            { value: "fill", label: "Stretch" },
            { value: "cover", label: "Crop" },
            { value: "none", label: "Original" },
            { value: "scale-down", label: "Scale down" },
          ]}
        />
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
        <Select
          className="flex-1 w-20"
          value={settings.subFontFamily}
          onChange={(v) => onChange({ subFontFamily: v })}
          options={[
            { value: "Arial", label: "Arial" },
            { value: "Tahoma", label: "Tahoma" },
            { value: "Verdana", label: "Verdana" },
            { value: "'Courier New'", label: "Courier New" },
            { value: "Georgia", label: "Georgia" },
            { value: "Impact", label: "Impact" },
          ]}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0">Цвет</span>
        <ColorPickerTrigger
          value={settings.subColor}
          onChange={(v) => onChange({ subColor: v })}
        />
      </label>

      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0">Фон</span>
        <ColorPickerTrigger
          value={settings.subBgColor}
          onChange={(v) => onChange({ subBgColor: v })}
        />
      </label>

      <Button className="mt-1" onClick={reset}>
        Сбросить
      </Button>
    </div>
  );
}

export default Settings;
