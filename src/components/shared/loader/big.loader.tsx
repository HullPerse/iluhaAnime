import { Box } from "lucide-react";

export function BigLoader() {
  return (
    <div className="bg-primary text-secondary absolute flex h-screen w-screen flex-col items-center justify-center font-extrabold">
      <Box className="size-28 animate-spin" />
    </div>
  );
}
