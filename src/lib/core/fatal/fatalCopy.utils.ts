import type { FatalInfo } from "@/types/core/fatal";

export const formatFatalCopy = (info: FatalInfo): string => {
  const lines = [
    `[fatal.${info.kind}] scope=${info.scope} route=${info.route} theme=${info.themeName} time=${new Date(info.timestamp).toISOString()}`,
    info.message,
  ];
  if (info.stack) lines.push(info.stack);
  return lines.join("\n");
};
