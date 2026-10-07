import { describe, expect, it } from 'vitest';

import { createSignalStore } from '@/lib/state/signal.store';

/**
 * Behavioral tests for the custom signal store.
 *
 * These tests target the player's launch/resume behavior, specifically:
 *  - that subscriptions do not fire stale/surplus updates (which would cause
 *    the player to seek to a wrong position on file launch or resume);
 *  - that batch updates flush subscribers exactly once;
 *  - that derived cells are stable when their dependencies have not changed.
 */
describe('signal store - player-safe subscriptions', () => {
  it('fires subscribers exactly once per distinct value change', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    const calls: number[] = [];
    cell.subscribe(() => calls.push(cell.get()));

    cell.set(1);
    cell.set(2);
    // no-op, same value
    cell.set(2);
    cell.set(1);

    expect(calls).toEqual([1, 2, 1]);
  });

  it('does not fire the same subscriber multiple times inside one batch', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    const calls: number[] = [];
    cell.subscribe(() => calls.push(cell.get()));

    store.batch(() => {
      cell.set(1);
      cell.set(2);
      cell.set(3);
    });

    expect(calls).toEqual([3]);
  });

  it('does not call subscribers of a cell that stayed at its initial value', () => {
    const store = createSignalStore();
    const cell = store.cell(10);
    let calls = 0;
    cell.subscribe(() => calls++);
    expect(calls).toBe(0);
  });

  it('derived cells notify on each value change and converge without staleness', () => {
    const store = createSignalStore();
    const a = store.cell(1);
    const b = store.cell(2);
    const derived = store.derive([a, b], (args) => (args[0] as number) + (args[1] as number));
    const calls: number[] = [];
    derived.subscribe(() => calls.push(derived.get()));

    // change only `a`
    a.set(10);
    // change only `b`
    b.set(20);
    // reset both to original values (derived returns to original)
    a.set(1);
    b.set(2);

    expect(calls).toEqual([12, 30, 21, 3]);
    expect(derived.get()).toBe(3);
  });

  it('derived recomputes in dependency order without re-reading stale state', () => {
    const store = createSignalStore();
    const base = store.cell(0);
    const d1 = store.derive([base], (args) => (args[0] as number) * 2);
    const d2 = store.derive([d1], (args) => (args[0] as number) + 1);
    const d3 = store.derive([d2, base], (args) => (args[0] as number) * (args[1] as number));

    const snapshot: number[] = [];
    const unsub = d3.subscribe(() => {
      snapshot.push(d3.get(), d1.get(), base.get());
    });

    base.set(5);
    base.set(10);

    expect(snapshot).toEqual([55, 10, 5, 210, 20, 10]);

    unsub();
  });

  it('nested batches do not leak partial state to subscribers', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    const updates: number[][] = [];
    cell.subscribe(() => updates.push([cell.get()]));

    store.batch(() => {
      cell.set(1);
      store.batch(() => {
        cell.set(2);
        cell.set(3);
      });
      cell.set(4);
    });

    expect(updates).toEqual([[4]]);
  });

  it('unsubscribe() prevents subsequent notification', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    let calls = 0;
    const unsub = cell.subscribe(() => calls++);
    cell.set(1);
    unsub();
    cell.set(2);
    cell.set(3);
    expect(calls).toBe(1);
  });

  it('multiple subscribers all see the committed value after batch', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    const results: Array<[string, number]> = [];
    cell.subscribe(() => results.push(['first', cell.get()]));
    cell.subscribe(() => results.push(['second', cell.get()]));

    store.batch(() => cell.set(7));

    expect(results.every(r => r[1] === 7)).toBe(true);
  });

  it('set() with the same identity stays silent, fresh-but-equal objects notify (Object.is)', () => {
    const store = createSignalStore();
    const cell = store.cell({ n: 0 });
    let renderCount = 0;
    cell.subscribe(() => {
      renderCount++;
    });

    // same identity twice: silent after the first commit
    const shared = { n: 5 };
    cell.set(shared);
    cell.set(shared);
    expect(renderCount).toBe(1);

    // distinct identities with equal content still notify: the store does
    // not deep-compare, so callers must avoid fresh literals for no-op writes
    cell.set({ n: 5 });
    cell.set({ n: 5 });
    expect(renderCount).toBe(3);
  });
});