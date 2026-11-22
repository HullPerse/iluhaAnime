import { redactProxyUrl } from "@/lib/core/diagnostics/report.utils";

export function ProxyAddress({ value }: { value: string }) {
  const redacted = redactProxyUrl(value);

  return (
    <span className="text-hint block max-w-56 text-xs break-all" title={redacted ?? value}>
      {redacted ?? value}
    </span>
  );
}
