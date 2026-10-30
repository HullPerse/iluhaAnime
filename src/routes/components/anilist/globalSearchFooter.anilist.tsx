import { Button } from "@/components/ui/button.component";

export default function GlobalSearchFooter({
  global,
  hasNext,
  count,
  loading,
  onLoad,
  label,
}: {
  global: boolean;
  hasNext: boolean;
  count: number;
  loading: boolean;
  onLoad: () => void;
  label: string;
}) {
  if (!global || !hasNext || count === 0) return null;
  return (
    <Button onClick={onLoad} disabled={loading}>
      {loading ? `${label}...` : label}
    </Button>
  );
}
