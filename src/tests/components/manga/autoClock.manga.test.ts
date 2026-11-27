import { expect, it } from "vitest";
import { advanceAutoClock } from "@/lib/manga/readerAuto.utils";

it("scrolls to the bottom first, then waits before turning pages and at the chapter end", () => {
  const clock = { elapsed: 0, boundary: 0 };
  const options = {
    dt: 500,
    end: false,
    bottom: false,
    interval: 2,
    pause: 1,
    autoNext: true,
    hasNext: true,
  };

  expect(advanceAutoClock(clock, options)).toBe("scroll");
  expect(clock.elapsed).toBe(0);
  expect(advanceAutoClock(clock, { ...options, bottom: true })).toBe("wait");
  expect(clock.elapsed).toBe(500);
  expect(advanceAutoClock(clock, { ...options, bottom: true, dt: 1500 })).toBe("turn");
  expect(clock.elapsed).toBe(0);

  const endClock = { elapsed: 0, boundary: 0 };
  expect(advanceAutoClock(endClock, { ...options, end: true, bottom: true })).toBe("wait");
  expect(advanceAutoClock(endClock, { ...options, end: true, bottom: true, dt: 600 })).toBe("next");
  expect(
    advanceAutoClock(
      { elapsed: 0, boundary: 0 },
      { ...options, end: true, bottom: true, hasNext: false }
    )
  ).toBe("stop");
});
