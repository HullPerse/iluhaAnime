import { describe, expect, it } from "vitest";

import {
  INITIAL_SQLITE_SETTINGS_STATE,
  sqliteSettingsReducer,
} from "@/hooks/sqlite/settingsReducer.hook";

describe("sqliteSettingsReducer", () => {
  it("replaces one field without touching the others", () => {
    const next = sqliteSettingsReducer(INITIAL_SQLITE_SETTINGS_STATE, {
      type: "set",
      key: "selectedDatabase",
      value: "anime",
    });

    expect(next.selectedDatabase).toBe("anime");
    expect(next.page).toBe(INITIAL_SQLITE_SETTINGS_STATE.page);
    expect(next.rows).toBe(INITIAL_SQLITE_SETTINGS_STATE.rows);
  });

  it("resolves a functional update against the current value", () => {
    const state = { ...INITIAL_SQLITE_SETTINGS_STATE, page: 2 };

    const next = sqliteSettingsReducer(state, {
      type: "set",
      key: "page",
      value: (page: number) => page + 1,
    });

    expect(next.page).toBe(3);
  });

  it("keeps the previous state when the value is unchanged", () => {
    const state = { ...INITIAL_SQLITE_SETTINGS_STATE, error: "boom" };

    const next = sqliteSettingsReducer(state, {
      type: "set",
      key: "error",
      value: "boom",
    });

    expect(next).toBe(state);
  });

  it("resets dependent browse state when the database changes", () => {
    const state = {
      ...INITIAL_SQLITE_SETTINGS_STATE,
      selectedDatabase: "old",
      tables: [{ name: "anime", rowCount: 1, columns: [] }],
      selectedTable: "anime",
      rows: {
        database: "old",
        table: "anime",
        columns: ["id"],
        rows: [[1]],
        total: 1,
        page: 1,
        pageSize: 50,
      },
      page: 3,
    };

    const next = sqliteSettingsReducer(state, {
      type: "selectDatabase",
      database: "new",
    });

    expect(next.selectedDatabase).toBe("new");
    expect(next.tables).toEqual([]);
    expect(next.selectedTable).toBe("");
    expect(next.rows).toBeNull();
    expect(next.page).toBe(1);
  });

  it("resets page and sort when the table changes", () => {
    const state = {
      ...INITIAL_SQLITE_SETTINGS_STATE,
      selectedTable: "old",
      page: 2,
      sort: { column: "name", direction: "asc" as const },
    };

    const next = sqliteSettingsReducer(state, { type: "selectTable", table: "new" });

    expect(next.selectedTable).toBe("new");
    expect(next.page).toBe(1);
    expect(next.sort).toBeNull();
  });

  it("trims the committed filter and returns to the first page", () => {
    const state = { ...INITIAL_SQLITE_SETTINGS_STATE, page: 4 };

    const next = sqliteSettingsReducer(state, { type: "commitFilter", filter: "  name ~ a  " });

    expect(next.filter).toBe("name ~ a");
    expect(next.page).toBe(1);
  });

  it("cycles the column sort ascending, descending, then off", () => {
    const asc = sqliteSettingsReducer(
      { ...INITIAL_SQLITE_SETTINGS_STATE, page: 2 },
      { type: "toggleColumnSort", column: "name" }
    );
    const desc = sqliteSettingsReducer(asc, { type: "toggleColumnSort", column: "name" });
    const off = sqliteSettingsReducer(desc, { type: "toggleColumnSort", column: "name" });

    expect(asc.sort).toEqual({ column: "name", direction: "asc" });
    expect(asc.page).toBe(1);
    expect(desc.sort).toEqual({ column: "name", direction: "desc" });
    expect(off.sort).toBeNull();
  });

  it("toggles one row and then the whole page", () => {
    const one = sqliteSettingsReducer(INITIAL_SQLITE_SETTINGS_STATE, {
      type: "toggleRow",
      keys: ["1"],
    });
    const two = sqliteSettingsReducer(one, { type: "toggleRow", keys: ["2"] });
    const removed = sqliteSettingsReducer(two, { type: "toggleRow", keys: ["1"] });

    expect(one.selectedRows).toEqual({ "1": ["1"] });
    expect(two.selectedRows).toEqual({ "1": ["1"], "2": ["2"] });
    expect(removed.selectedRows).toEqual({ "2": ["2"] });

    const all = sqliteSettingsReducer(INITIAL_SQLITE_SETTINGS_STATE, {
      type: "toggleAllRows",
      keys: [["1"], ["2"]],
    });
    const cleared = sqliteSettingsReducer(all, {
      type: "toggleAllRows",
      keys: [["1"], ["2"]],
    });

    expect(all.selectedRows).toEqual({ "1": ["1"], "2": ["2"] });
    expect(cleared.selectedRows).toEqual({});
  });

  it("opens and cancels both delete confirmations", () => {
    const row = sqliteSettingsReducer(INITIAL_SQLITE_SETTINGS_STATE, {
      type: "requestRowDelete",
      keys: ["1"],
    });
    const batch = sqliteSettingsReducer(row, { type: "requestBatchDelete" });
    const rowCancelled = sqliteSettingsReducer(batch, { type: "cancelRowDelete" });
    const batchCancelled = sqliteSettingsReducer(rowCancelled, { type: "cancelBatchDelete" });

    expect(row.pendingDelete).toEqual(["1"]);
    expect(batch.pendingBatchDelete).toBe(true);
    expect(rowCancelled.pendingDelete).toBeNull();
    expect(batchCancelled.pendingBatchDelete).toBe(false);
  });

  it("stores list and selection replacements by reference", () => {
    const rows = {
      database: "db",
      table: "anime",
      columns: ["id"],
      rows: [[1]],
      total: 1,
      page: 1,
      pageSize: 50,
    };
    const selected = { "1": ["1"] };

    const next = sqliteSettingsReducer(INITIAL_SQLITE_SETTINGS_STATE, {
      type: "set",
      key: "rows",
      value: rows,
    });
    const selectedNext = sqliteSettingsReducer(next, {
      type: "set",
      key: "selectedRows",
      value: selected,
    });

    expect(selectedNext.rows).toBe(rows);
    expect(selectedNext.selectedRows).toBe(selected);
  });
});
