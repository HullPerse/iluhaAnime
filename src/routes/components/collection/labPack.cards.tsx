import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { OpenedCard } from "@/types/api/cards";

import PackOpen from "@/routes/components/collection/packOpen.cards";

const BASE_INTRO_MS = 5_000;
const SPEEDS = [0.5, 1, 2] as const;

export default function LabPack({ cards }: { cards: readonly OpenedCard[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<boolean>(false);
  const [run, setRun] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1);

  const replay = () => {
    setRun((value) => value + 1);
    setOpen(true);
  };

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div
        data-testid="lab-pack-preview"
        className="cards-pack shrink-0"
        role="img"
        aria-label={t("collection.pack.wrapper")}
      >
        <span className="cards-pack-label">{t("collection.cards")}</span>
        <span className="cards-pack-hint">{cards.length}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="windows95-text text-hint m-0">
          Интро 5 секунд, переворот только по клику. Скорость меняет длительность интро.
        </p>
        <label className="windows95-text flex items-center gap-2">
          Скорость
          <select
            className="windows95-border bg-field text-text h-6 px-1"
            value={speed}
            disabled={open}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          <Button className="h-6 px-2 text-xs" onClick={replay}>
            Открыть пак
          </Button>
          <Button className="h-6 px-2 text-xs" onClick={replay}>
            Повторить
          </Button>
        </div>
        <p className="windows95-text text-hint m-0">
          Интро: {Math.round(BASE_INTRO_MS / speed)} мс. Переворот: 220 мс на карточку.
        </p>
      </div>
      {open && (
        <PackOpen
          key={run}
          cards={cards}
          introMs={Math.round(BASE_INTRO_MS / speed)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
