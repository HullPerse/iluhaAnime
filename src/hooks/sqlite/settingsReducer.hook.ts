import { useMemo, useReducer } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  SqliteDatabaseInfo,
  SqliteRowsPage,
  SqliteTableInfo,
  SortState,
} from "@/types/core/sqlite";

export interface SqliteSettingsState {
  object: "tables" | "backup";
  databases: SqliteDatabaseInfo[];
  tables: SqliteTableInfo[];
  selectedDatabase: string;
  selectedTable: string;
  rows: SqliteRowsPage | null;
  filterInput: string;
  filter: string;
  page: number;
  display: "pagination" | "scroll";
  accRows: Array<unknown>[];
  hideId: boolean;
  sort: SortState;
  loading: boolean;
  loadingRows: boolean;
  error: string | null;
  pendingDelete: string[] | null;
  selectedRows: Record<string, string[]>;
  pendingBatchDelete: boolean;
  deleting: boolean;
}

export type SqliteSettingsAction =
  | { type: "set"; key: keyof SqliteSettingsState; value: unknown }
  | { type: "selectDatabase"; database: string }
  | { type: "selectTable"; table: string }
  | { type: "commitFilter"; filter: string }
  | { type: "toggleColumnSort"; column: string }
  | { type: "toggleRow"; keys: string[] }
  | { type: "toggleAllRows"; keys: string[][] }
  | { type: "requestRowDelete"; keys: string[] }
  | { type: "requestBatchDelete" }
  | { type: "cancelRowDelete" }
  | { type: "cancelBatchDelete" };

export interface SqliteSettingsTransitions {
  selectDatabase: (database: string) => void;
  selectTable: (table: string) => void;
  commitFilter: (filter: string) => void;
  toggleColumnSort: (column: string) => void;
  toggleRow: (keys: string[]) => void;
  toggleAllRows: (keys: string[][]) => void;
  requestRowDelete: (keys: string[]) => void;
  requestBatchDelete: () => void;
  cancelRowDelete: () => void;
  cancelBatchDelete: () => void;
}

export type SqliteSettingsFieldSetters = {
  [K in keyof SqliteSettingsState as `set${Capitalize<K>}`]: Dispatch<
    SetStateAction<SqliteSettingsState[K]>
  >;
};

export const INITIAL_SQLITE_SETTINGS_STATE: SqliteSettingsState = {
  object: "tables",
  databases: [],
  tables: [],
  selectedDatabase: "",
  selectedTable: "",
  rows: null,
  filterInput: "",
  filter: "",
  page: 1,
  display: "pagination",
  accRows: [],
  hideId: true,
  sort: null,
  loading: false,
  loadingRows: false,
  error: null,
  pendingDelete: null,
  selectedRows: {},
  pendingBatchDelete: false,
  deleting: false,
};

function rowKey(keys: string[]): string {
  return keys.join(" | ");
}

function withToggledRow(
  state: SqliteSettingsState,
  keys: string[]
): SqliteSettingsState {
  const id = rowKey(keys);
  const selectedRows = { ...state.selectedRows };
  if (selectedRows[id]) delete selectedRows[id];
  else selectedRows[id] = keys;
  return { ...state, selectedRows };
}

function withToggledAllRows(
  state: SqliteSettingsState,
  keys: string[][]
): SqliteSettingsState {
  const selectedRows = { ...state.selectedRows };
  const allSelected = keys.length > 0 && keys.every((row) => Boolean(selectedRows[rowKey(row)]));
  for (const row of keys) {
    const id = rowKey(row);
    if (allSelected) delete selectedRows[id];
    else selectedRows[id] = row;
  }
  return { ...state, selectedRows };
}

export function sqliteSettingsReducer(
  state: SqliteSettingsState,
  action: SqliteSettingsAction
): SqliteSettingsState {
  switch (action.type) {
    case "set": {
      const current = state[action.key];
      const next =
        typeof action.value === "function"
          ? (action.value as (previous: unknown) => unknown)(current)
          : action.value;
      if (Object.is(next, current)) return state;
      return { ...state, [action.key]: next };
    }
    case "selectDatabase": {
      return {
        ...state,
        selectedDatabase: action.database,
        tables: [],
        selectedTable: "",
        rows: null,
        page: 1,
      };
    }
    case "selectTable": {
      return { ...state, selectedTable: action.table, page: 1, sort: null };
    }
    case "commitFilter": {
      return { ...state, filter: action.filter.trim(), page: 1 };
    }
    case "toggleColumnSort": {
      const current = state.sort;
      let sort: SortState = null;
      if (current?.column !== action.column) sort = { column: action.column, direction: "asc" };
      else if (current.direction === "asc") sort = { column: action.column, direction: "desc" };
      return { ...state, sort, page: 1 };
    }
    case "toggleRow": {
      return withToggledRow(state, action.keys);
    }
    case "toggleAllRows": {
      return withToggledAllRows(state, action.keys);
    }
    case "requestRowDelete": {
      return { ...state, pendingDelete: action.keys };
    }
    case "requestBatchDelete": {
      return { ...state, pendingBatchDelete: true };
    }
    case "cancelRowDelete": {
      return { ...state, pendingDelete: null };
    }
    case "cancelBatchDelete": {
      return { ...state, pendingBatchDelete: false };
    }
  }
}

export function useSqliteSettingsState(): SqliteSettingsState &
  SqliteSettingsFieldSetters &
  SqliteSettingsTransitions {
  const [state, dispatch] = useReducer(sqliteSettingsReducer, INITIAL_SQLITE_SETTINGS_STATE);
  const setters = useMemo((): SqliteSettingsFieldSetters => {
    const set = <K extends keyof SqliteSettingsState>(key: K) => {
      return (value: SetStateAction<SqliteSettingsState[K]>) => {
        dispatch({ type: "set", key, value });
      };
    };
    return {
      setObject: set("object"),
      setDatabases: set("databases"),
      setTables: set("tables"),
      setSelectedDatabase: set("selectedDatabase"),
      setSelectedTable: set("selectedTable"),
      setRows: set("rows"),
      setFilterInput: set("filterInput"),
      setFilter: set("filter"),
      setPage: set("page"),
      setDisplay: set("display"),
      setAccRows: set("accRows"),
      setHideId: set("hideId"),
      setSort: set("sort"),
      setLoading: set("loading"),
      setLoadingRows: set("loadingRows"),
      setError: set("error"),
      setPendingDelete: set("pendingDelete"),
      setSelectedRows: set("selectedRows"),
      setPendingBatchDelete: set("pendingBatchDelete"),
      setDeleting: set("deleting"),
    };
  }, []);
  const transitions = useMemo((): SqliteSettingsTransitions => {
    return {
      selectDatabase: (database) => dispatch({ type: "selectDatabase", database }),
      selectTable: (table) => dispatch({ type: "selectTable", table }),
      commitFilter: (filter) => dispatch({ type: "commitFilter", filter }),
      toggleColumnSort: (column) => dispatch({ type: "toggleColumnSort", column }),
      toggleRow: (keys) => dispatch({ type: "toggleRow", keys }),
      toggleAllRows: (keys) => dispatch({ type: "toggleAllRows", keys }),
      requestRowDelete: (keys) => dispatch({ type: "requestRowDelete", keys }),
      requestBatchDelete: () => dispatch({ type: "requestBatchDelete" }),
      cancelRowDelete: () => dispatch({ type: "cancelRowDelete" }),
      cancelBatchDelete: () => dispatch({ type: "cancelBatchDelete" }),
    };
  }, []);
  return { ...state, ...setters, ...transitions };
}
