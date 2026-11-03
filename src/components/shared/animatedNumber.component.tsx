import { TWEEN_MS } from "@/config/ui/animatedNumber.config";
import { useTweenedValue } from "@/hooks/tweenedValue.hook";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsAtoms } from "@/store/settings.store";

export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (value: number) => string;
}) {
  const animateCounters = useCell(settingsAtoms.animateCounters);
  const shown = useTweenedValue(value, animateCounters ? TWEEN_MS : 0);
  return <>{format(shown)}</>;
}
