import { describe, expect, it } from "vitest";

import { formatDistanceToNowOwn } from "@/lib/core/search/distance.utils";

const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

const ORACLE: [number, string][] = [
  [10, "меньше минуты назад"],
  [50, "1 минуту назад"],
  [90, "2 минуты назад"],
  [300, "5 минут назад"],
  [2640, "44 минуты назад"],
  [3000, "около 1 часа назад"],
  [7200, "около 2 часов назад"],
  [82800, "около 23 часов назад"],
  [108000, "1 день назад"],
  [172800, "2 дня назад"],
  [864000, "10 дней назад"],
  [2592000, "около 1 месяца назад"],
  [3456000, "около 1 месяца назад"],
  [4320000, "около 2 месяцев назад"],
  [6048000, "2 месяца назад"],
  [17280000, "7 месяцев назад"],
  [34560000, "около 1 года назад"],
  [43200000, "больше 1 года назад"],
  [69120000, "около 2 лет назад"],
  [-7200, "приблизительно через 2 часа"],
];

describe("distance oracle", () => {
  it.each(ORACLE)("delta %is formats as %s", (delta, expected) => {
    const dateMs = NOW - delta * 1000;
    expect(formatDistanceToNowOwn(dateMs, "ru", NOW)).toBe(expected);
  });

  it("rejects invalid dates with a stable RangeError", () => {
    expect(() => formatDistanceToNowOwn(Number.NaN, "ru", NOW)).toThrow(
      new RangeError("Invalid time value")
    );
  });

  it("accepts Date objects identically to timestamps", () => {
    const dateMs = NOW - 7200 * 1000;
    expect(formatDistanceToNowOwn(new Date(dateMs), "ru", NOW)).toBe(
      formatDistanceToNowOwn(dateMs, "ru", NOW)
    );
  });
});
