import { Popover } from "@base-ui/react/popover";
import { useState } from "react";

import { ColorPicker } from "./picker.color";

export function ColorPickerTrigger({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        aria-label={label}
        title={label}
        className="windows95-border h-6 min-h-(--ui-control-height) w-10 cursor-pointer"
        style={{ background: value }}
      />
      <Popover.Portal>
        <Popover.Positioner
          className="z-50 outline-none"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={12}
        >
          <Popover.Popup className="outline-none">
            <ColorPicker
              value={value}
              onConfirm={(hex) => {
                onChange(hex);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
