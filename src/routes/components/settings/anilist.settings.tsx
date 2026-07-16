import { useSettingsStore } from "@/store/settings.store";
import Select from "@/components/ui/select.component";

const options = [
  { value: "none", label: "Выключены" },
  { value: "inapp", label: "Только в приложении" },
  { value: "system_when_open", label: "В приложении + системные, если приложение открыто" },
] as const;

export default function SettingsAniList() {
  const { animeNotifyMode, patch } = useSettingsStore();

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="windows95-text text-muted font-bold w-full">Уведомления аниме</p>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-64">Новые эпизоды из списка "Смотрю"</span>
        <Select
          value={animeNotifyMode}
          onChange={(v) => patch({ animeNotifyMode: v as "none" | "inapp" | "system_when_open" })}
          options={options}
          className="w-72"
        />
      </label>
    </div>
  );
}
