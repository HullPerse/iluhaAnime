import type { AniListCollection } from "@/types/anilist/anilist";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { StatsMediaRow } from "@/types/anilist/anilistStats";
import type { StatsDrillData } from "@/types/core/overview.stats";

export type StatsTab = "overview" | "calendar" | "released";

export interface AiringEntry {
  id: number;
  title: string;
  airingAt: number;
  episode: number | null;
  coverUrl: string | null;
}

export interface CalendarCell {
  date: number;
  entries: AiringEntry[];
}

export interface StatsModalContentProps {
  tab: StatsTab;
  drill: StatsDrillData | null;
  drillRows: StatsMediaRow[];
  scoreFormat: AnilistScoreFormat;
  lists: AniListCollection[];
  userId: number | null;
  selectedDay: number | null;
  dayEntries: AiringEntry[];
  month: number;
  year: number;
  firstDay: number;
  daysInMonth: number;
  calendarCells: CalendarCell[];
  isCurrentMonth: boolean;
  today: number;
  onOpenDetail: (id: number) => void;
  onSelectDay: (day: number | null) => void;
  onDrill: (data: StatsDrillData) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}
