import { bench, group } from "@pmndrs/labs";
// Direct bench of the attempt/result helpers against hand-rolled equivalents.
// The helpers back every native invoke and store hydration, so the goal is to
// prove the abstraction is free on the success path and only costs extra when
// a retry or a timeout is actually configured.
// Budget (avg/iter, Ryzen 7 5800X/node 26.3.0, 2026-10-10): plain promise
// x200 8.8us, attempt tuple x200 29.8us, attemptResult x200 42.2us,
// attemptAllLimit 30 items limit 5 12.0us, Promise.all 30 items 1.5us.
// That is about 100ns per call for the legacy shape and 70ns extra for the
// Result wrapper, which is noise against a 5-50ms native invoke.
// Regression threshold is labs minDelta 5%.

import { attempt } from "../../src/lib/utils/attempt.utils";
import { attemptAllLimit, attemptResult } from "../../src/lib/utils/result.utils";

const ITEMS = Array.from({ length: 30 }, (_, index) => index);

function fakeInvoke(payload: { id: number }): Promise<{ id: number }> {
  return Promise.resolve(payload);
}

const PAYLOAD = { id: 7 };

group("attempt @utils @quick", () => {
  bench("attempt tuple x200 (legacy shape)", async () => {
    let sum = 0;
    for (let i = 0; i < 200; i++) {
      const [value, error] = await attempt(fakeInvoke(PAYLOAD));
      if (error === null && value) sum += value.id;
    }
    return sum;
  });

  bench("attemptResult x200 (new shape)", async () => {
    let sum = 0;
    for (let i = 0; i < 200; i++) {
      const result = await attemptResult(fakeInvoke(PAYLOAD));
      if (result.ok) sum += result.value.id;
    }
    return sum;
  });

  bench("plain promise x200 (baseline)", async () => {
    let sum = 0;
    for (let i = 0; i < 200; i++) {
      const value = await fakeInvoke(PAYLOAD);
      sum += value.id;
    }
    return sum;
  });

  bench("attemptAllLimit 30 items limit 5 x1", async () => {
    const results = await attemptAllLimit(ITEMS, 5, (item) => fakeInvoke({ id: item }));
    let sum = 0;
    for (const result of results) if (result.ok) sum += result.value.id;
    return sum;
  });

  bench("Promise.all 30 items x1 (baseline)", async () => {
    const results = await Promise.all(ITEMS.map((item) => fakeInvoke({ id: item })));
    let sum = 0;
    for (const value of results) sum += value.id;
    return sum;
  });
});
