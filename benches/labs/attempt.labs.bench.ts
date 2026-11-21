import { bench, group } from "@pmndrs/labs";

import { attempt } from "@hullperse/hp_utils/attempt";
import { attemptAllLimit, attemptResult } from "@hullperse/hp_utils/result";

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
