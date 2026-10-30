export const resolveEnabledIndex = (
  tabs: readonly { disabled?: boolean }[],
  index: number
): number => {
  if (!tabs[index]?.disabled) return index;
  for (let step = 1; step < tabs.length; step += 1) {
    const forward = (index + step) % tabs.length;
    if (!tabs[forward]?.disabled) return forward;
  }
  return index;
};
