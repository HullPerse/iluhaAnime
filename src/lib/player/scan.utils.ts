export function fingerprint(paths: string[], extensions: string[]): string {
  return `${extensions.join(",")}\n${paths.join("\n")}`;
}
