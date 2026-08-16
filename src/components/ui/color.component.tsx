import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { PALETTE } from "@/config/colors.config";
import { hexToRgba, rgbaToHex } from "@/lib/color.utils";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";

function ColorPicker({
  value,
  onConfirm,
  onCancel,
}: {
  value: string;
  onConfirm: (hex: string) => void;
  onCancel: () => void;
}) {
  const [r, setR] = useState(() => {
    const rgba = hexToRgba(value);
    return rgba?.r ?? 0;
  });
  const [g, setG] = useState(() => {
    const rgba = hexToRgba(value);
    return rgba?.g ?? 0;
  });
  const [b, setB] = useState(() => {
    const rgba = hexToRgba(value);
    return rgba?.b ?? 0;
  });
  const [hexInput, setHexInput] = useState(value);
  const { t } = useI18n();

  const hex = useMemo(() => rgbaToHex({ a: 1, b, g, r }, false), [r, g, b]);

  const pickColor = useCallback((h: string) => {
    const rgba = hexToRgba(h);
    if (rgba) {
      setR(rgba.r);
      setG(rgba.g);
      setB(rgba.b);
      setHexInput(h);
    }
  }, []);

  const onHexChange = useCallback((input: string) => {
    setHexInput(input);
    const rgba = hexToRgba(input);
    if (rgba) {
      setR(rgba.r);
      setG(rgba.g);
      setB(rgba.b);
    }
  }, []);

  return (
    <div className="windows95-active-border bg-primary flex flex-col gap-2 p-2">
      {/* Palette grid */}
      <div className="grid grid-cols-8 gap-0.5">
        {PALETTE.map((c) => (
          <button
            type="button"
            key={c}
            aria-label={c}
            className="focus-visible:outline-text size-5 cursor-pointer border focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
            style={{
              background: c,
              borderColor: hex === c ? "#ffffff" : "#808080",
              outline: hex === c ? "2px solid #000080" : undefined,
              outlineOffset: hex === c ? "-2px" : undefined,
            }}
            onClick={() => pickColor(c)}
            title={c}
          />
        ))}
      </div>

      {/* Custom color */}
      <div className="mt-1 flex items-center gap-2">
        <div
          className="windows95-border size-8 shrink-0"
          style={{
            background: hex,
            width: "var(--ui-icon-size)",
            height: "var(--ui-icon-size)",
          }}
        />
        <div className="flex flex-1 flex-col gap-1">
          <label className="windows95-text text-text flex items-center gap-1">
            <span className="w-3">R</span>
            <Input
              type="number"
              min={0}
              max={255}
              value={r}
              onChange={(e) => {
                const v = Math.min(
                  255,
                  Math.max(0, Number(e.target.value) || 0)
                );
                setR(v);
                setHexInput(rgbaToHex({ a: 1, b, g, r: v }, false));
              }}
              className="h-5 w-14 text-[10px]"
            />
            <span className="ml-1 w-3">G</span>
            <Input
              type="number"
              min={0}
              max={255}
              value={g}
              onChange={(e) => {
                const v = Math.min(
                  255,
                  Math.max(0, Number(e.target.value) || 0)
                );
                setG(v);
                setHexInput(rgbaToHex({ a: 1, b, g: v, r }, false));
              }}
              className="h-5 w-14 text-[10px]"
            />
            <span className="ml-1 w-3">B</span>
            <Input
              type="number"
              min={0}
              max={255}
              value={b}
              onChange={(e) => {
                const v = Math.min(
                  255,
                  Math.max(0, Number(e.target.value) || 0)
                );
                setB(v);
                setHexInput(rgbaToHex({ a: 1, b: v, g, r }, false));
              }}
              className="h-5 w-14 text-[10px]"
            />
          </label>
          <label className="windows95-text text-text flex items-center gap-1">
            <span className="w-3">#</span>
            <Input
              value={hexInput.replace("#", "")}
              onChange={(e) => onHexChange(`#${e.target.value}`)}
              className="h-5 w-24 text-[10px] uppercase"
              placeholder="000000"
            />
          </label>
        </div>
      </div>

      <div className="mt-1 flex justify-end gap-1">
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
        <Button onClick={() => onConfirm(hex)}>{t("common.ok")}</Button>
      </div>
    </div>
  );
}

function ColorPickerTrigger({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const toggleOpen = () => {
    setOpen((current) => {
      if (!current && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPos({ left: rect.left, top: rect.bottom + 4 });
      }
      return !current;
    });
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !popoverRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keydown);
    };
  }, [open]);

  return (
    <div className="inline-block">
      <div
        ref={triggerRef}
        className="windows95-border h-6 min-h-[var(--ui-control-height)] w-10 cursor-pointer"
        style={{ background: value }}
        onClick={toggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={enterOrSpace(toggleOpen)}
      />
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              left: pos.left,
              position: "fixed",
              top: pos.top,
              zIndex: 9999,
            }}
          >
            <ColorPicker
              value={value}
              onConfirm={(hex) => {
                onChange(hex);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

export { ColorPickerTrigger };
