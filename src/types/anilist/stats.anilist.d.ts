import type { AniListCollection } from "@/types/anilist/anilist";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { StatsMediaRow } from "@/types/anilist/anilistStats";
import type { StatsDrillData } from "@/types/core/overview.stats";

export type StatsTab = "overview" | "calendar" | "released";

export type StatsCalendarMode = "list" | "season";

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
  calendarMode: StatsCalendarMode;
  isCurrentMonth: boolean;
  seasonError: boolean;
  seasonLoading: boolean;
  today: number;
  onCalendarMode: (mode: StatsCalendarMode) => void;
  onOpenDetail: (id: number) => void;
  onRetrySeason: () => void;
  onSelectDay: (day: number | null) => void;
  onDrill: (data: StatsDrillData) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}
