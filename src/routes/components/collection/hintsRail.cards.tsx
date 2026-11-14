import { useI18n } from "@/hooks/i18n.hook";
import { hintLabelFor } from "@/lib/daily/hints.utils";
import type { DailyHintView } from "@/types/api/daily";

export function HintsRail({
  hints,
  current,
}: {
  hints: DailyHintView[];
  current: DailyHintView | undefined;
}) {
  const { t } = useI18n();

  return (
    <aside className="daily-rail">
      <section className="daily-rail-box">
        <h3 className="daily-rail-title">{t("collection.game.hints")}</h3>
        {hints.length > 0 && (
          <ul className="daily-hint-list">
            {hints.map((frame) => (
              <li
                key={frame.slot}
                className="daily-hint-row"
                data-current={frame.slot === current?.slot}
              >
                <span className="daily-hint-num">{frame.slot + 1}</span>
                <span>{hintLabelFor(frame, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
