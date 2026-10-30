import type { Locale } from "@/types/i18n";

type DistanceToken =
  | "lessThanXMinutes"
  | "xMinutes"
  | "aboutXHours"
  | "xDays"
  | "aboutXMonths"
  | "xMonths"
  | "aboutXYears"
  | "overXYears"
  | "almostXYears";

const MINUTES_IN_DAY = 1440;
const MINUTES_IN_MONTH = 43200;
const MINUTES_IN_ALMOST_TWO_DAYS = 2520;

function compareAsc(laterMs: number, earlierMs: number): number {
  const diff = laterMs - earlierMs;
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return diff;
}

function timezoneOffsetMs(dateMs: number): number {
  const date = new Date(dateMs);
  const utc = new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    )
  );
  utc.setUTCFullYear(date.getFullYear());
  return dateMs - utc.getTime();
}

function calendarMonths(laterMs: number, earlierMs: number): number {
  const later = new Date(laterMs);
  const earlier = new Date(earlierMs);
  return (
    (later.getFullYear() - earlier.getFullYear()) * 12 + (later.getMonth() - earlier.getMonth())
  );
}

function isLastDayOfMonth(dateMs: number): boolean {
  const date = new Date(dateMs);
  return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function differenceInMonths(laterMs: number, earlierMs: number): number {
  const sign = compareAsc(laterMs, earlierMs);
  const calendar = Math.abs(calendarMonths(laterMs, earlierMs));
  if (calendar < 1) return 0;
  const working = new Date(laterMs);
  if (working.getMonth() === 1 && working.getDate() > 27) working.setDate(30);
  working.setMonth(working.getMonth() - sign * calendar);
  let lastNotFull = compareAsc(working.getTime(), earlierMs) === -sign;
  if (isLastDayOfMonth(laterMs) && calendar === 1 && compareAsc(laterMs, earlierMs) === 1) {
    lastNotFull = false;
  }
  const result = sign * (calendar - Number(lastNotFull));
  return result === 0 ? 0 : result;
}

const EN_ONE: Record<DistanceToken, string> = {
  lessThanXMinutes: "less than a minute",
  xMinutes: "1 minute",
  aboutXHours: "about 1 hour",
  xDays: "1 day",
  aboutXMonths: "about 1 month",
  xMonths: "1 month",
  aboutXYears: "about 1 year",
  overXYears: "over 1 year",
  almostXYears: "almost 1 year",
};

const EN_OTHER: Record<DistanceToken, string> = {
  lessThanXMinutes: "less than {{count}} minutes",
  xMinutes: "{{count}} minutes",
  aboutXHours: "about {{count}} hours",
  xDays: "{{count}} days",
  aboutXMonths: "about {{count}} months",
  xMonths: "{{count}} months",
  aboutXYears: "about {{count}} years",
  overXYears: "over {{count}} years",
  almostXYears: "almost {{count}} years",
};

function formatEn(token: DistanceToken, count: number, comparison: number): string {
  const result = count === 1 ? EN_ONE[token] : EN_OTHER[token].replace("{{count}}", String(count));
  return comparison > 0 ? `in ${result}` : `${result} ago`;
}

interface RuScheme {
  one?: string;
  singularNominative: string;
  singularGenitive: string;
  pluralGenitive: string;
}

interface RuToken {
  regular: RuScheme;
  past?: RuScheme;
  future?: RuScheme;
}

function declension(scheme: RuScheme, count: number): string {
  if (scheme.one !== undefined && count === 1) return scheme.one;
  const rem10 = count % 10;
  const rem100 = count % 100;
  if (rem10 === 1 && rem100 !== 11) {
    return scheme.singularNominative.replace("{{count}}", String(count));
  }
  if (rem10 >= 2 && rem10 <= 4 && (rem100 < 10 || rem100 > 20)) {
    return scheme.singularGenitive.replace("{{count}}", String(count));
  }
  return scheme.pluralGenitive.replace("{{count}}", String(count));
}

const RU: Record<DistanceToken, RuToken> = {
  lessThanXMinutes: {
    regular: {
      one: "меньше минуты",
      singularNominative: "меньше {{count}} минуты",
      singularGenitive: "меньше {{count}} минут",
      pluralGenitive: "меньше {{count}} минут",
    },
    future: {
      one: "меньше, чем через минуту",
      singularNominative: "меньше, чем через {{count}} минуту",
      singularGenitive: "меньше, чем через {{count}} минуты",
      pluralGenitive: "меньше, чем через {{count}} минут",
    },
  },
  xMinutes: {
    regular: {
      singularNominative: "{{count}} минута",
      singularGenitive: "{{count}} минуты",
      pluralGenitive: "{{count}} минут",
    },
    past: {
      singularNominative: "{{count}} минуту назад",
      singularGenitive: "{{count}} минуты назад",
      pluralGenitive: "{{count}} минут назад",
    },
    future: {
      singularNominative: "через {{count}} минуту",
      singularGenitive: "через {{count}} минуты",
      pluralGenitive: "через {{count}} минут",
    },
  },
  aboutXHours: {
    regular: {
      singularNominative: "около {{count}} часа",
      singularGenitive: "около {{count}} часов",
      pluralGenitive: "около {{count}} часов",
    },
    future: {
      singularNominative: "приблизительно через {{count}} час",
      singularGenitive: "приблизительно через {{count}} часа",
      pluralGenitive: "приблизительно через {{count}} часов",
    },
  },
  xDays: {
    regular: {
      singularNominative: "{{count}} день",
      singularGenitive: "{{count}} дня",
      pluralGenitive: "{{count}} дней",
    },
  },
  aboutXMonths: {
    regular: {
      singularNominative: "около {{count}} месяца",
      singularGenitive: "около {{count}} месяцев",
      pluralGenitive: "около {{count}} месяцев",
    },
    future: {
      singularNominative: "приблизительно через {{count}} месяц",
      singularGenitive: "приблизительно через {{count}} месяца",
      pluralGenitive: "приблизительно через {{count}} месяцев",
    },
  },
  xMonths: {
    regular: {
      singularNominative: "{{count}} месяц",
      singularGenitive: "{{count}} месяца",
      pluralGenitive: "{{count}} месяцев",
    },
  },
  aboutXYears: {
    regular: {
      singularNominative: "около {{count}} года",
      singularGenitive: "около {{count}} лет",
      pluralGenitive: "около {{count}} лет",
    },
    future: {
      singularNominative: "приблизительно через {{count}} год",
      singularGenitive: "приблизительно через {{count}} года",
      pluralGenitive: "приблизительно через {{count}} лет",
    },
  },
  overXYears: {
    regular: {
      singularNominative: "больше {{count}} года",
      singularGenitive: "больше {{count}} лет",
      pluralGenitive: "больше {{count}} лет",
    },
    future: {
      singularNominative: "больше, чем через {{count}} год",
      singularGenitive: "больше, чем через {{count}} года",
      pluralGenitive: "больше, чем через {{count}} лет",
    },
  },
  almostXYears: {
    regular: {
      singularNominative: "почти {{count}} год",
      singularGenitive: "почти {{count}} года",
      pluralGenitive: "почти {{count}} лет",
    },
    future: {
      singularNominative: "почти через {{count}} год",
      singularGenitive: "почти через {{count}} года",
      pluralGenitive: "почти через {{count}} лет",
    },
  },
};

function formatRu(token: DistanceToken, count: number, comparison: number): string {
  const entry = RU[token];
  if (comparison > 0) {
    return entry.future
      ? declension(entry.future, count)
      : `через ${declension(entry.regular, count)}`;
  }
  return entry.past ? declension(entry.past, count) : `${declension(entry.regular, count)} назад`;
}

export function formatDistanceToNowOwn(
  date: number | Date,
  locale: Locale,
  nowMs: number = Date.now()
): string {
  const dateMs = date instanceof Date ? date.getTime() : date;
  const comparison = compareAsc(dateMs, nowMs);
  if (Number.isNaN(comparison)) throw new RangeError("Invalid time value");
  const earlierMs = comparison > 0 ? nowMs : dateMs;
  const laterMs = comparison > 0 ? dateMs : nowMs;
  const seconds = Math.trunc((laterMs - earlierMs) / 1000);
  const offsetSec = (timezoneOffsetMs(earlierMs) - timezoneOffsetMs(laterMs)) / 1000;
  const minutes = Math.round((seconds - offsetSec) / 60);
  let token: DistanceToken;
  let count: number;
  if (minutes < 2) {
    if (minutes === 0) {
      token = "lessThanXMinutes";
      count = 1;
    } else {
      token = "xMinutes";
      count = minutes;
    }
  } else if (minutes < 45) {
    token = "xMinutes";
    count = minutes;
  } else if (minutes < 90) {
    token = "aboutXHours";
    count = 1;
  } else if (minutes < MINUTES_IN_DAY) {
    token = "aboutXHours";
    count = Math.round(minutes / 60);
  } else if (minutes < MINUTES_IN_ALMOST_TWO_DAYS) {
    token = "xDays";
    count = 1;
  } else if (minutes < MINUTES_IN_MONTH) {
    token = "xDays";
    count = Math.round(minutes / MINUTES_IN_DAY);
  } else if (minutes < MINUTES_IN_MONTH * 2) {
    token = "aboutXMonths";
    count = Math.round(minutes / MINUTES_IN_MONTH);
  } else {
    const months = differenceInMonths(laterMs, earlierMs);
    if (months < 12) {
      token = "xMonths";
      count = Math.round(minutes / MINUTES_IN_MONTH);
    } else {
      const rest = months % 12;
      const years = Math.trunc(months / 12);
      if (rest < 3) {
        token = "aboutXYears";
        count = years;
      } else if (rest < 9) {
        token = "overXYears";
        count = years;
      } else {
        token = "almostXYears";
        count = years + 1;
      }
    }
  }
  return locale === "ru" ? formatRu(token, count, comparison) : formatEn(token, count, comparison);
}
