import { Frown, Meh, Smile, Star } from "lucide-react";
import type { ReactNode } from "react";

const GLYPHS: Record<string, ReactNode> = {
  frown: <Frown className="size-3.5" />,
  meh: <Meh className="size-3.5" />,
  smile: <Smile className="size-3.5" />,
};

export function ScoreGlyph({ icon }: { icon: string }) {
  return <>{GLYPHS[icon] ?? <Star className="size-3 fill-yellow-400 text-yellow-600" />}</>;
}
