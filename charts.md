# Charts module and AniList statistics audit

Date: 2026-10-24.
Scope: an in-house `charts` module, first consumed by the AniList Statistics modal, Overview tab.
Status: audit and plan complete. Implementation deferred until ordered. Full plan: `.docs/features/anilist-stats.md`.

## 1. What exists today

- `src/routes/components/anilist/stats.anilist.tsx` (451 lines) holds one modal with three tabs. Overview renders a KPI line plus status, genre and studio lists from `lists`; Calendar renders a month grid of next airings; Released renders the notification feed.
- `src/lib/anilist/activity.utils.ts` already has a per-day activity map and a year grid (`buildActivityMap`, `buildYearGrid`, `selectInitialDayKey`), used by `activity/calendarTab.activity.tsx`. It is the only heatmap in the app and it has no tests.
- `src/lib/collection/stats.utils.ts` is the only other aggregate model (status counts, rating distribution, hours per year) and it belongs to the local collection.
- No chart package is installed. The only drawing-related dependency is `d3-force`, used by the franchise graph.
- Visual precedent for charts is hand-drawn SVG or divs: franchise graph, heatmap cells, progress blocks. There is no shared chart primitive.

Data available today:

- `lists` (`AniListCollection[]`) arrives from `get_anilist_lists` through the `anilistData` query. `COLLECTION_QUERY` in `src-tauri/src/anilist/auth.rs` selects id, titles, episodes, averageScore, popularity, startDate, genres, tags, cover, banner, status and nextAiringEpisode. `parse_list_entry` fills `duration`, `format`, `season`, `season_year`, `studios`, `end_date` and `description` with null or empty values.
- `User.statistics { anime { ... } }` is not queried. The AniList schema exposes count, meanScore, standardDeviation, minutesWatched, episodesWatched, formats, statuses, scores, lengths, releaseYears, startYears, genres, tags, countries, voiceActors, staff and studios. Each statistic object carries count, meanScore, minutesWatched and mediaIds, and `formats`, `statuses`, `scores`, `lengths`, `releaseYears`, `startYears`, `genres`, `tags`, `countries`, `voiceActors`, `staff` and `studios` accept limit and sort arguments (verified in the AniList reference for UserStatistics).
- The activity feed (`get_anilist_activity`) reads page 1 only, 50 items, so it cannot back a year heatmap.

## 2. Findings

No Blockers.

Risk:

- R1 Custom lists are double counted. AniList returns custom list groups in `MediaListCollection.lists` (the group object has `isCustomList`), and both the overview and the calendar loop over every group without dedupe, so a title in a custom list is counted twice and its airing appears twice. `collectAllEntries` in `lib/anilist/group.utils.ts` already dedupes by media id and is not used here.
- R2 Top studios never renders. `parse_list_entry` sets `studios: vec![]`, so `summary.topStudios` is always empty.
- R3 Mean score is wrong outside POINT_10. The overview averages raw `entry.score` with `score != null`, so a POINT_100 account sees a mean near 80 and a `0` score (meaning no rating) is counted as a rating. `normalizeToTen` and `formatMeanScore` exist in `lib/anilist/score.utils.ts` and are unused here.
- R4 Watch time cannot be computed from the list payload. `duration` is null and `episodes` is the series length, not watched time. Any local hours figure would rest on an invented minutes-per-episode constant. `UserStatistics.minutesWatched` is the honest source.
- R5 No data layer. Aggregation lives inside the route component; there is no AniList stats module and no test for the overview. The calendar math in `activity.utils.ts` is untested too.
- R6 Hardcoded palettes. `CELL_LEVELS` in `src/config/anilist/activity.config.ts` is the GitHub green ramp and `getStatusColor` returns fixed hex values, so both ignore the theme. A chart module must not repeat this pattern.
- R7 Hover and focus are improvised. Heatmap cells use native `title` attributes and `disabled` for empty days; DESIGN requires the shared tooltip for text and forbids native titles on controls. One focusable-mark model has to replace per-cell attributes.
- R8 Responsive size is unmeasured. Charts need a measured width; the modal is `w-3xl` with `max-h-[80%]`, so every chart must fit 768 px and fall back to one column. jsdom has no ResizeObserver; tests stub it (precedent: `src/tests/hooks/modalResize.hook.test.tsx`).

Gap:

- G1 The statistics entry point is a calendar icon with a native `title` and no accessible name, while the dialog is titled Statistics.
- G2 Overview has no empty, partial or stale state. An empty account shows zeros with no explanation and nothing says when the data was fetched.
- G3 `score_format` is not passed to the overview even though `detail.scoreFormat` is available.
- G4 Score extremes, rewatch counts, custom lists, notes and completion ratio are computed nowhere.
- G5 No i18n keys exist for the new labels, and count strings need en and ru plural forms.
- G6 Chart math placement needs a decision: a new `src/lib/charts` folder requires explicit user approval per DEVELOPMENT.md.

Cleanup:

- C1 `topEntries` is a route-local helper that belongs with the aggregation.
- C2 The tab row uses `Button` toggles instead of the shared tabs component; not a chart concern, but this surface is being rebuilt.
- C3 `getStatusColor` duplicates color decisions that belong to a single chart palette or the theme.

Optimization:

- O1 One pass over deduped entries builds every local aggregate, with no per-block refiltering.
- O2 SVG only, with a mark cap and an "other" bucket, keeps the modal responsive without a canvas.
- O3 Score-vs-community comparisons must be binned or sampled, never one node per title.

Clear:

- The year-grid math, `dayKey`, `monthLabel` and the existing month calendar are reusable.
- TanStack Query already caches the list payload, so local aggregates need no new fetch.
- `AnimatedNumber` and the `animateCounters` setting already cover KPI counters.
- The shared `Modal` header, back action and scroll container fit a multi-card layout.

## 3. Library audit

The real question is which renderer survives this project's constraints: a Windows 95 surface with 1px borders and theme tokens, a 768 px modal, about six chart types, keyboard-first interaction, jsdom tests, and no new dependency unless it earns its place.

- `@tanstack/charts` 1.1.0 (MIT, 1.0 published 2026-10-05). The only candidate built as a grammar: marks, scales, transforms, interactions, renderers, custom marks against a scene protocol, typed and tree-shakable. It is three weeks old, so the API is still settling, and its look would be replaced by Win95 overrides anyway. Best fit if the module outgrows this tab or needs canvas.
- `recharts` 3.10.1 (MIT). React 19 in peers, familiar declarative API, defaults that are exactly wrong for this design. The published package is about 7.5 MB unpacked and adds `react-is`. Keyboard access runs through its accessibility layer, not focusable marks, and there are no custom marks below the component level.
- `echarts` 6.1.0 (Apache-2.0). The most capable option (crosshair, brush, built-in aria option, theming) and the heaviest, about 60 MB unpacked. Imperative canvas or SVG renderer, its own JSON theme system instead of CSS variables. Too much for a statistics tab.
- `@visx/shape` 4.0.0 (MIT). Primitives rather than charts: scales, axes and interaction stay your job. Close to the in-house option but with a dependency and d3 modules underneath. Rejected while the needed primitives are few and the project already draws SVG by hand.
- `@nivo/core` 0.99.0 (MIT). Many chart types with polished defaults and React 19 in peers. Heavy dependency graph and a visual language to fight. Rejected.
- `chart.js` 4.6.1 with `react-chartjs-2` (MIT). Canvas first and plugin-based, about 6 MB unpacked. Canvas loses focusable marks and crisp 1px Win95 lines. Rejected.
- `lightweight-charts` 5.2.1 (Apache-2.0). Financial time series with its own canvas and interaction model. Wrong domain. Rejected.
- `uplot` 1.6.32 (MIT, about 545 KB unpacked). Fast canvas time series with a minimal API, but no React integration, no axes composition, and the performance it buys is for data the app does not have. Rejected.
- `@observablehq/plot` 0.6.17 (ISC). Declarative statistical grammar that renders SVG, strong for exploratory charts, imperative and not React-shaped. Revisit only if binned or density charts become a requirement.
- `victory` 37.3.6 (MIT). React components with animation and React Native support, aging API surface, heavy, animation-led defaults that conflict with the motion policy. Rejected.

Verdict: build on SVG in-house and add no dependency. `@tanstack/charts` is the single candidate to revisit if the scope widens, because it is the only one that would not be replaced wholesale by Win95 overrides.

## 4. Feature audit (the ten borrowed ideas)

1. Crosshair and tooltip. Adopt the applicable part: pointer-following vertical guide on cartesian charts, nearest-index resolution, one shared tooltip listing every visible series, values through i18n. Skip chart-to-chart cursor sync and multi-axis cursors.
2. Animated transitions. Partially adopt. The project bans reduced-motion queries by explicit order and limits animation to user-initiated state changes under 200 ms. Data morphing on every fetch violates both. Adopt KPI counters through `AnimatedNumber` (respects `animateCounters`), hover and focus emphasis at about 120 ms, and no bar or line interpolation.
3. Activity heatmap. Already exists. Do not build a second one. Later: move `CELL_LEVELS` to theme tokens, add a real tooltip, and decide whether Overview reuses the grid or shows a year column chart. True per-day data needs activity-feed paging.
4. Brush, zoom, pan, range sync. Reject for v1. There is no dense time series, and drag gestures collide with window dragging, vim and the hint layer. Period selection is a control, not a brush.
5. Layered marks. Adopt in reduced form: a frame whose children are marks sharing one scale, plus reference lines (mean, target). No independent Y axes; a second axis doubles label and tooltip cost.
6. Theming through CSS variables. Adopt as the module's first rule: no hex in components, series colors from existing tokens plus `color-mix`, 1px borders, hatch patterns for extra series. Dedicated `--color-chart-*` keys are a separate decision that touches the theme schema and editor.
7. Smart axes and labels. Adopt: nice ticks, compact numbers, skipped labels, margins derived from tick width, locale-aware dates. No rotated labels unless a block proves it needs them.
8. Real-time updates without flicker. Reject. Data changes on refetch only, and normal reconciliation is enough. Stable keys per series mark remain required.
9. Interactive legend. Defer. Every v1 block is single-series, so a legend component would be scaffolding. Return when a block has more than one toggleable series; then use checkbox legend items, hover emphasis, and session state.
10. Export and accessibility. Split. Accessibility is v1: roving tabindex across marks, arrow traversal, `aria-live` value readout, text summary, visible focus. Export is deferred: PNG needs a canvas pass over the SVG, CSV needs a destination. "Copy data" through the clipboard plugin is the cheapest future option.

## 5. What the Overview tab could show

Source legend: L = list payload (local), S = `User.statistics`, A = activity feed (page 1 only).

Headline:

1. Titles tracked, episodes watched, hours watched, mean score, completion rate. S only; when statistics is unavailable the block shows the error state instead of borrowed numbers. v1.
2. Rewatch count and notes count. L. Later, small.
3. Last refreshed time and a manual refresh. Query meta. v1, stale state.

Taste:

4. Score distribution histogram with mean and one-sigma band. S `scores`. v1.
5. Status mix ratio bar. S `statuses` or L. v1.
6. Format mix strip. S `formats`. v1 at medium scope.
7. My score vs community average: diverging bars for the largest gaps. L. Later, because it needs title rows rather than a pure chart.
8. Completion rate by genre. L, needs a cross-tab. v1 at medium scope.

History:

9. Watched by year, columns with drill-down. S `startYears`. v1.
10. Release-year profile, columns. S `releaseYears`. v1 at medium scope.
11. Monthly timeline of additions and completions over 12 or 24 months. L timestamps. Later, because the dates are derived and the label has to say so.
12. Series-length buckets. S `lengths`. Later.
13. Daily heatmap. Existing component. Later or moved, never duplicated.

Creators:

14. Top genres with count and mean score. S `genres` or L. v1.
15. Top studios with count. S `studios`. v1, also closes R2.
16. Top tags. S `tags`. Later.
17. Top seiyuu, staff, countries. S. Reject for the Overview; no user task behind them.

Honesty rules for these blocks:

- Hours watched comes from AniList's own minute count, never from an assumed episode length.
- "Watched by year" uses AniList `startYear` statistics; list `createdAt` is not a watch date.
- Every score figure is normalized through `score_format` before display.

## 6. Module shape

- `src/lib/charts/`: pure math. `scale.utils.ts` (linear and band scales, nice ticks), `geometry.utils.ts` (bar rects, stacked ratio segments, nearest index), `format.utils.ts` (compact numbers, percent, hours, bucket labels). Tests mirror to `src/tests/lib/charts/`.
- `src/components/shared/charts/`: `frame.chart.tsx` (measured plot, margins, grid, aria label), `ticks.chart.tsx`, `bar.chart.tsx`, `column.chart.tsx` (also covers the histogram, with reference lines and the sigma band), `ratio.chart.tsx` (100% stacked strip), `tooltip.chart.tsx`.
- `src/hooks/chartCursor.hook.ts`: the one cursor model shared by pointer and arrow keys.
- `src/config/charts/`: palette token order, hatch patterns, mark caps, block limits.
- `src/lib/anilist/stats.utils.ts`: deduped entries, normalized scores, local aggregates, block data builders, drill-down rows. Pure and tested.
- `src/routes/components/anilist/stats/`: `overview.stats.tsx`, `card.stats.tsx`, `mediaRows.stats.tsx`. No card-per-file split.
- Rust: `get_anilist_statistics` in `src-tauri/src/anilist/stats.rs`, plus TS types, a query key, a hook, and loading, error and stale states.

Frame contract sketch, not final: a measured parent supplies width and height, the caller builds scales, children are marks, one `activeIndex` lives in the chart, and the tooltip renders in a positioned layer inside the frame.

Non-goals for this module: a general charting library, manga statistics, live or streaming data, canvas rendering, and a second heatmap implementation.

## 7. Assumptions

- The modal shows the logged-in user's statistics. Friend mode has no statistics entry (`AniListFriendHeader` carries no stats button), so the surface stays self-only.
- AniList statistics is anime-only, which matches the app.
- The three existing tabs stay. Overview becomes a scrollable card column with a KPI strip.
- `User.statistics` is filtered by the same privacy the user set on AniList; private entries are included for the owner, which matches the list payload.

## 8. Decisions (2026-10-24)

- Data: AniList `User.statistics` for aggregates, the cached list payload for drill-down and the completion-by-genre cross-tab.
- Renderer: in-house SVG. No chart dependency.
- V1: nine blocks (KPI strip plus eight charts).
- Interaction: hover and keyboard on one cursor model, click and Enter open the drill-down.
- Width: the dialog widens on the Overview tab only; Calendar and Released keep `w-3xl`.
- Palette: existing tokens plus `color-mix` and hatch fills. No new theme keys.
- Motion: KPI counters through `AnimatedNumber` (respects `animateCounters`), marks snap, hover and focus around 120 ms. No data morphing, no reduced-motion queries.
- Placement: `src/components/shared/charts/`, `src/lib/charts/`, `src/config/charts/`, approved as a new lib domain.
- Documentation: `.docs/features/anilist-stats.md` holds the full plan; this file holds the audit and the checklist.
- Implementation: deferred until the user orders it.

## 9. Plan checklist

Audit and decisions:

- [x] Read the project contract, the stats modal, and the AniList data sources.
- [x] Audit the ten candidate libraries against the project constraints.
- [x] Audit the ten borrowed features and pick what applies.
- [x] Write the full plan to `.docs/features/anilist-stats.md`.
- [x] Record the decisions in `.docs/DECISIONS.md`.

Data source (Rust):

- [ ] `src-tauri/src/anilist/stats.rs`: query, structs, `parse_statistics`.
- [ ] Register the module and the `get_anilist_statistics` command.
- [ ] Fixture tests: full payload, empty groups, missing statistics, studio mapping, query limits.

Data source (TypeScript):

- [ ] `AniListStatistics` types in `src/types/anilist.d.ts`.
- [ ] `getStatistics` in `src/api/anilist.api.ts` plus its API test.
- [ ] `anilistStatistics` key in `src/lib/query/keys.utils.ts`.
- [ ] `useAnilistStatistics` in `src/hooks/anilist/stats.hook.ts` plus its test.
- [ ] Pass the query through `anilist.route.tsx` and `secondaryModals.anilist.tsx`.

Chart math:

- [ ] `src/lib/charts/scale.utils.ts` plus tests.
- [ ] `src/lib/charts/format.utils.ts` plus tests.
- [ ] `src/lib/charts/geometry.utils.ts` plus tests.

Chart primitives:

- [ ] `frame.chart.tsx` with a measured plot and aria label.
- [ ] `ticks.chart.tsx`.
- [ ] `bar.chart.tsx`.
- [ ] `column.chart.tsx` with reference lines and the sigma band.
- [ ] `ratio.chart.tsx`.
- [ ] `tooltip.chart.tsx`.
- [ ] `src/hooks/chartCursor.hook.ts` plus tests.

View model:

- [ ] `src/lib/anilist/stats.utils.ts` with `buildStatsOverview` and `buildMediaRows`.
- [ ] Tests: custom-list dedupe, score format, empty model, completion rate, genre sample, drill-down rows.

Surface:

- [ ] `stats/card.stats.tsx` and `stats/mediaRows.stats.tsx`.
- [ ] `stats/overview.stats.tsx` with loading, error, empty and stale states.
- [ ] Rewire `stats.anilist.tsx`, remove the inline summary, widen the dialog on Overview only, and fix the entry button label.
- [ ] en and ru locale keys with plural forms.
- [ ] Component tests for KPIs, states, focus tooltip, arrow traversal, drill-down.

Verification and docs:

- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`.
- [ ] `cargo check`, `cargo test`, `cargo clippy` for `src-tauri`.
- [ ] SECURITY capability line and the DESIGN charts subsection.
- [ ] Update this checklist and the feature file with what shipped.
- [ ] Manual visual check in the desktop window (not possible from the agent session).
