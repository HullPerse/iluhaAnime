import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { ArrowDown, ArrowUp, Check } from "lucide-react";

interface Props {
  dlInput: string;
  ulInput: string;
  dlLimit: number | null;
  ulLimit: number | null;
  onDlChange: (value: string) => void;
  onUlChange: (value: string) => void;
  onApply: () => void;
}

export default function SpeedLimitForm({
  dlInput,
  ulInput,
  dlLimit,
  ulLimit,
  onDlChange,
  onUlChange,
  onApply,
}: Props) {
  const effective = (input: string) => (input === "" ? null : Number(input));

  return (
    <section className="flex items-center gap-2 p-1 windows95-active-border bg-primary">
      <span className="windows95-text"><ArrowDown /></span>
      <Input
        type="number"
        className="w-16"
        placeholder="KB/s"
        value={dlInput}
        onChange={(e) => {
          if (e.target.value === "" || /^\d+$/.test(e.target.value)) {
            onDlChange(e.target.value);
          }
        }}
        onKeyDown={(e) => e.key === "Enter" && onApply()}
        onBlur={onApply}
      />
      <span className="windows95-text"><ArrowUp /></span>
      <Input
        type="number"
        className="w-16"
        placeholder="KB/s"
        value={ulInput}
        onChange={(e) => {
          if (e.target.value === "" || /^\d+$/.test(e.target.value)) {
            onUlChange(e.target.value);
          }
        }}
        onKeyDown={(e) => e.key === "Enter" && onApply()}
        onBlur={onApply}
      />
      <Button
        size="icon"
        className="windows95-text size-6"
        onClick={onApply}
        disabled={effective(dlInput) === dlLimit && effective(ulInput) === ulLimit}
      >
        <Check className="size-4" />
      </Button>
    </section>
  );
}
