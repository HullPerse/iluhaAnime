// Read-only snapshot of the real learning data in the app database.
// Answers "what does the ranking model actually see": row counts per
// kind/scope, non-zero counters, history size, and the in-memory projection
// that `buildLearningMaps` produces at startup.
//
// Run: bun scripts/rank-snapshot.ts [--db <path>]
// The database is opened READONLY, so it is safe while the app runs.

import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { buildLearningMaps } from "../src/lib/core/learning.utils";
import { RANKING } from "../src/config/anilist/ranking.config";
import type { LearningStatRow } from "../src/types/search/search";

interface CountRow {
  kind: string;
  scope: string;
  rows: number;
  used: number;
  selected: number;
  ignored: number;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((entry) => entry.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const dbPath = argument("db") ?? `${process.env.APPDATA ?? ""}/iluhaAnime/app_data.sqlite3`;
const db = new DatabaseSync(dbPath, { readOnly: true });

const byKind = db
  .prepare(
    `SELECT kind, scope, COUNT(*) AS rows,
            COALESCE(SUM(use_count), 0) AS used,
            COALESCE(SUM(selected_count), 0) AS selected,
            COALESCE(SUM(ignored_count), 0) AS ignored
     FROM unified_index
     GROUP BY kind, scope
     ORDER BY rows DESC`
  )
  .all() as unknown as CountRow[];

const cutoff = Math.floor(Date.now() / 1000) - RANKING.TTL_DAYS * 86_400;
const learningRows = db
  .prepare(
    `SELECT id, kind, scope, normalized_value AS value,
            use_count AS useCount, selected_count AS selectedCount,
            ignored_count AS ignoredCount, last_used_at AS lastUsedAt
     FROM unified_index
     WHERE (use_count + selected_count + ignored_count) > 0
       AND last_used_at >= ?
     ORDER BY last_used_at DESC`
  )
  .all(cutoff) as unknown as LearningStatRow[];

const maps = buildLearningMaps(learningRows);
const history = db
  .prepare(
    `SELECT value FROM unified_index
     WHERE kind = 'history'
     ORDER BY last_used_at DESC`
  )
  .all() as unknown as Array<{ value: string }>;

const topLearned = [...learningRows]
  .sort(
    (left, right) => right.useCount + right.selectedCount - (left.useCount + left.selectedCount)
  )
  .slice(0, 10)
  .map((row) => ({
    id: row.id,
    ignored: row.ignoredCount,
    selected: row.selectedCount,
    use: row.useCount,
    value: row.value,
  }));

console.log(
  JSON.stringify(
    {
      animeAliases: byKind
        .filter((row) => row.kind === "anime_alias")
        .reduce((sum, row) => sum + row.rows, 0),
      animeTitles: byKind
        .filter((row) => row.kind === "anime" && row.scope === "anilist")
        .reduce((sum, row) => sum + row.rows, 0),
      franchiseTitles: byKind
        .filter((row) => row.kind === "anime" && row.scope === "franchise")
        .reduce((sum, row) => sum + row.rows, 0),
      byKind,
      dbBytes: statSync(dbPath).size,
      dbPath,
      historyRows: history.length,
      learning: {
        projectionBytes: JSON.stringify(maps.suggestionStats).length,
        projectionEntries: Object.keys(maps.suggestionStats).length,
        queryEntries: Object.keys(maps.queryStats).length,
        rows: learningRows.length,
      },
      topLearned,
      ttlDays: RANKING.TTL_DAYS,
    },
    null,
    2
  )
);

db.close();
