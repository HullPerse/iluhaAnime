import type { CorrectionEvidence, CorrectionReason, SpellWordSpan } from "@/types/search/search";

export interface ParsedTitleAttributes {
  season: number | null;
  episode: number | null;
  year: number | null;
  remainder: string;
  markers: string[];
  explicit: boolean;
}

export interface TitleHypothesis {
  animeId: number | null;
  title: string;
  season: number | null;
  episode: number | null;
  year: number | null;
  remainder: string;
  score: number;
}

export interface SpellingWithReason {
  correction: string;
  reason: CorrectionReason;
  evidence: CorrectionEvidence;
  spans?: SpellWordSpan[];
  titleId?: number;
  confidence?: number;
}
