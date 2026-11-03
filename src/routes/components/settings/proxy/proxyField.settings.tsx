import { cn } from "cn";
import { useRef } from "react";

import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { proxyPresetsFor, proxySelectValue } from "@/config/system/proxy.config";
import { useI18n } from "@/hooks/i18n.hook";
import { isValidProxyUrlFor, type ProxyScheme } from "@/lib/core/proxy.utils";

import { ProxyCheck } from "@/routes/components/settings/proxy/proxyCheck.settings";

export function ProxyField({
  label,
  value,
  onChange,
  onCommit,
  test,
  testOkLabel,
  testFailLabel,
  testDisabled = false,
  schemes,
  runToken = 0,
  description,
  className,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  onCommit?: (value: string | null) => void;
  test: () => Promise<string>;
  testOkLabel?: string;
  testFailLabel?: string;
  testDisabled?: boolean;
  schemes?: readonly ProxyScheme[];
  runToken?: number;
  description?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const invalid = !isValidProxyUrlFor(value, schemes);
  const current = value ?? "";
  const presets = proxyPresetsFor(schemes);

  const commit = (next: string | null) => {
    onCommit?.(next);
  };

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-3 gap-y-0.5 min-[560px]:grid-cols-[140px_1fr]",
        className
      )}
    >
      <span className="windows95-text text-text flex items-start text-xs font-bold">{label}</span>
      <div className="flex min-w-0 flex-col gap-1">
        {description && <span className="text-hint text-xs">{description}</span>}
        <div className="flex flex-col gap-1 min-[560px]:flex-row min-[560px]:items-center">
          <Select
            label={label}
            value={proxySelectValue(value, schemes)}
            onChange={(next) => {
              if (next === "custom") {
                inputRef.current?.focus();
                return;
              }
              const resolved = next || null;
              onChange(resolved);
              commit(resolved);
            }}
            options={[
              { value: "", label: t("settings.proxy.no") },
              ...presets.map((url) => ({ value: url, label: url })),
              { value: "custom", label: t("settings.proxy.custom") },
            ]}
            className="w-full min-[560px]:max-w-60"
          />
          <Input
            ref={inputRef}
            value={current}
            onChange={(event) => {
              const next = event.target.value.trim();
              onChange(next || null);
            }}
            onBlur={() => commit(value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            placeholder={presets[0] ?? "socks5://127.0.0.1:10808"}
            spellCheck={false}
            className="w-full min-[560px]:max-w-70"
            aria-label={label}
            aria-invalid={invalid}
          />
        </div>
        {invalid && (
          <span className="text-destructive text-xs" role="alert">
            {t("settings.proxy.invalid")}
          </span>
        )}
        <ProxyCheck
          test={test}
          resetKey={value}
          runToken={runToken}
          invalid={invalid}
          disabled={testDisabled}
          okLabel={testOkLabel}
          failLabel={testFailLabel}
        />
      </div>
    </div>
  );
}
