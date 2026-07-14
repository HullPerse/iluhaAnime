import type { SettingsScraper } from "@/types";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { qualities, languages, encodings } from "@/config/scraper.config";

interface Props {
  settings: SettingsScraper;
  onChange: (patch: Partial<SettingsScraper>) => void;
}

export default function SearchFiltersBar({ settings, onChange }: Props) {
  return (
    <section className="flex flex-row gap-2 w-full">
      <div className="flex flex-row gap-1 items-center">
        <span className="text-text windows95-text">Качество:</span>
        {qualities.map((q) => (
          <Button
            key={q}
            variant={settings.quality === q ? "outline" : "default"}
            onClick={() => onChange({ quality: q as SettingsScraper["quality"] })}
            className="windows95-border"
          >
            {q === "all" ? "Все" : q}
          </Button>
        ))}
      </div>
      <div className="flex flex-row gap-1 items-center">
        <span className="text-text windows95-text">Язык:</span>
        {languages.map((l) => (
          <Button
            key={l}
            variant={settings.language === l ? "outline" : "default"}
            onClick={() => onChange({ language: l as SettingsScraper["language"] })}
            className="windows95-border"
          >
            {l === "all" ? "Все" : l}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-text windows95-text">Сортировка:</span>
        <Select
          className="w-22"
          value={settings.sort}
          onChange={(v) => onChange({ sort: v as SettingsScraper["sort"] })}
          options={[
            { value: "seeders", label: "Сидеры" },
            { value: "leechers", label: "Личи" },
            { value: "size", label: "Размер" },
          ]}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-text windows95-text">Кодек:</span>
        <Select
          className="w-22"
          value={settings.encoding}
          onChange={(v) => onChange({ encoding: v as SettingsScraper["encoding"] })}
          options={encodings.map((enc) => ({
            value: enc,
            label: enc === "all" ? "Все" : enc,
          }))}
        />
      </div>
    </section>
  );
}
