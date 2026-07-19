import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { ArrowLeft, ArrowRight } from "lucide-react";

export interface PaginationBarProps {
  total: number;
  page: number;
  lastPage: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  statusText?: string;
}

export default function AniListPaginationBar({
  total,
  page,
  lastPage,
  from,
  to,
  onPageChange,
  statusText,
}: PaginationBarProps) {
  const [input, setInput] = useState(String(page));

  useEffect(() => {
    setInput(String(page));
  }, [page]);

  return (
    <section className="windows95-border bg-white px-1 py-0.5 flex flex-row items-center justify-between">
      <span className="windows95-text">{statusText}</span>
      <span className="windows95-text">
        {total > 0 && `Показано: ${from}...${to} / ${total}`}
      </span>
      <div className="windows95-text flex flex-row gap-1 items-center">
        <Button size="icon" className="h-6 w-6" onClick={() => onPageChange(page - 1)} disabled={page === 1}>
          <ArrowLeft />
        </Button>
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const num = Number(e.target.value);
            if (Number.isFinite(num) && num >= 1) {
              onPageChange(Math.min(num, lastPage));
            }
          }}
          min={1}
          max={lastPage}
          type="number"
          inputMode="numeric"
          className="windows95-text font-bold windows95-border h-6 w-10 text-center flex items-center justify-center"
        />
        <Button size="icon" className="h-6 w-6" onClick={() => onPageChange(page + 1)} disabled={page === lastPage}>
          <ArrowRight />
        </Button>
      </div>
    </section>
  );
}
