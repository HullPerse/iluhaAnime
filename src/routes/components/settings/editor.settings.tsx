import { useState } from "react";
import Modal from "@/components/shared/modal.component";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color.component";
import { useThemeStore } from "@/store/theme.store";
import type { ThemeDefinition } from "@/types/theme";

const COLOR_KEYS: { key: keyof ThemeDefinition["colors"]; label: string }[] = [
  { key: "background", label: "Рабочий стол" },
  { key: "primary", label: "Фон" },
  { key: "secondary", label: "Акцент" },
  { key: "text", label: "Текст" },
  { key: "muted", label: "Приглушённый" },
  { key: "highlight", label: "Ссылки" },
  { key: "destructive", label: "Ошибка" },
  { key: "success", label: "Успех" },
  { key: "surface", label: "Поверхность" },
  { key: "winHighlight", label: "Светлая кромка" },
  { key: "winShadow", label: "Тёмная кромка" },
];

export default function ThemeEditor({
  theme,
  onClose,
}: {
  theme?: ThemeDefinition;
  onClose: () => void;
}) {
  const addCustomTheme = useThemeStore((s) => s.addCustomTheme);
  const isEdit = !!theme;
  const defaults: ThemeDefinition["colors"] = {
    background: "#222222",
    primary: "#c0c0c0",
    secondary: "#000080",
    text: "#000000",
    muted: "#808080",
    highlight: "#0000ff",
    destructive: "#800000",
    success: "#008000",
    linkHover: "#ff0000",
    surface: "#d0d0d0",
    winHighlight: "#ffffff",
    winShadow: "#808080",
  };

  const [name, setName] = useState(theme?.label ?? "");
  const [colors, setColors] = useState(theme?.colors ?? defaults);

  const patchColor = (key: keyof ThemeDefinition["colors"], value: string) =>
    setColors((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!name.trim()) return;
    const safeName = `custom-${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
    addCustomTheme({
      name: safeName,
      label: name.trim(),
      colors: { ...colors },
    });
    onClose();
  };

  return (
    <Modal
      header={isEdit ? "Редактировать тему" : "Создать тему"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 p-2">
        <label className="flex items-center gap-2 windows95-text text-text">
          <span className="w-24 shrink-0">Название</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Моя тема"
          />
        </label>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {COLOR_KEYS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 windows95-text text-text"
            >
              <span className="w-28 shrink-0">{label}</span>
              <ColorPickerTrigger
                value={colors[key]}
                onChange={(v) => patchColor(key, v)}
              />
              <span className="text-[10px] text-muted font-mono">
                {colors[key]}
              </span>
            </label>
          ))}
        </div>

        {/* Live preview */}
        <div
          className="windows95-border flex items-center justify-center self-center"
          style={{ width: 300, height: 60, background: colors.primary }}
        >
          <span
            className="windows95-text font-bold px-1 py-0.5"
            style={{
              background: colors.secondary,
              color: colors.text,
            }}
          >
            {name.trim() || "Предпросмотр"}
          </span>
        </div>

        <div className="flex justify-end gap-1 mt-1">
          <Button onClick={onClose}>Отмена</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
