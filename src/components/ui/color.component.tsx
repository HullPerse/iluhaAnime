import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { hexToRgba, rgbaToHex } from "@/lib/color.utils";

const PALETTE = [
  "#000000",
  "#808080",
  "#800000",
  "#808000",
  "#008000",
  "#008080",
  "#000080",
  "#800080",
  "#ffffff",
  "#c0c0c0",
  "#ff0000",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#0000ff",
  "#ff00ff",
  "#c0c0c0",
  "#e0e0e0",
  "#a04000",
  "#ff8000",
  "#40ff00",
  "#00ff80",
  "#0040ff",
  "#8000ff",
  "#808080",
  "#a0a0a0",
  "#ff8080",
  "#ffff80",
  "#80ff80",
  "#80ffff",
  "#8080ff",
  "#ff80ff",
  "#404040",
  "#600000",
  "#ff4000",
  "#ffff40",
  "#40ff40",
  "#40ffff",
  "#4040ff",
  "#ff40ff",
  "#a0a0a4",
  "#000000",
  "#c08040",
  "#80ff00",
  "#00c080",
  "#0080ff",
  "#8000c0",
  "#ff0080",
];

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

  const hex = useMemo(() => rgbaToHex({ r, g, b, a: 1 }, false), [r, g, b]);

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
    <div className="flex flex-col gap-2 p-2 windows95-active-border bg-primary">
      {/* Palette grid */}
      <div className="grid grid-cols-8 gap-0.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            className="size-5 border cursor-pointer focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-text"
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
      <div className="flex items-center gap-2 mt-1">
        <div
          className="size-8 shrink-0 windows95-border"
          style={{ background: hex }}
        />
        <div className="flex flex-col gap-1 flex-1">
          <label className="flex items-center gap-1 windows95-text text-text">
            <span className="w-3">R</span>
            <Input
              type="number"
              min={0}
              max={255}
              value={r}
              onChange={(e) => {
                const v = Math.min(
                  255,
                  Math.max(0, Number(e.target.value) || 0),
                );
                setR(v);
                setHexInput(rgbaToHex({ r: v, g, b, a: 1 }, false));
              }}
              className="w-14 h-5 text-[10px]"
            />
            <span className="w-3 ml-1">G</span>
            <Input
              type="number"
              min={0}
              max={255}
              value={g}
              onChange={(e) => {
                const v = Math.min(
                  255,
                  Math.max(0, Number(e.target.value) || 0),
                );
                setG(v);
                setHexInput(rgbaToHex({ r, g: v, b, a: 1 }, false));
              }}
              className="w-14 h-5 text-[10px]"
            />
            <span className="w-3 ml-1">B</span>
            <Input
              type="number"
              min={0}
              max={255}
              value={b}
              onChange={(e) => {
                const v = Math.min(
                  255,
                  Math.max(0, Number(e.target.value) || 0),
                );
                setB(v);
                setHexInput(rgbaToHex({ r, g, b: v, a: 1 }, false));
              }}
              className="w-14 h-5 text-[10px]"
            />
          </label>
          <label className="flex items-center gap-1 windows95-text text-text">
            <span className="w-3">#</span>
            <Input
              value={hexInput.replace("#", "")}
              onChange={(e) => onHexChange(`#${e.target.value}`)}
              className="w-24 h-5 text-[10px] uppercase"
              placeholder="000000"
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-1 mt-1">
        <Button onClick={onCancel}>Отмена</Button>
        <Button onClick={() => onConfirm(hex)}>OK</Button>
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
        className="h-6 w-10 windows95-border cursor-pointer"
        style={{ background: value }}
        onClick={() => {
          setOpen((v) => {
            if (!v && triggerRef.current) {
              const r = triggerRef.current.getBoundingClientRect();
              setPos({ left: r.left, top: r.bottom + 4 });
            }
            return !v;
          });
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      />
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: pos.left,
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
          document.body,
        )}
    </div>
  );
}

export { ColorPickerTrigger };
