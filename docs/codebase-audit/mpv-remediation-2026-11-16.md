# mpv remediation

The user approved all packages from the read-only audit on 2026-11-16.

Work order: patch native ownership and event delivery; guard playback operations and watch persistence; repair recovery, track selection and IPC validation; verify accessibility and performance candidates; reconcile documentation.

Validation: regression tests, targeted and full Vitest, TypeScript, lint, Rust tests and formatting. Live playback and transport checks are reported separately from unit evidence.

Rollback: revert only this task's changes. No commits or publication are authorized.

## Implemented behavior

Native callback memory is owned by a typed Box and events use a bounded ordered worker. Instance identities reject stale native events. Player lifecycle operations and multi-command mutations are serialized; native polling and database work run on blocking workers. The application handles both its Close button and the OS close request before destroying mpv.

Open requests carry identities. An older local load cannot consume a newer pending request. Stream selections share a request counter and ignore stale resolutions and completions. Only EOF triggers automatic next-episode playback. Local file failures and initial-session retry have recovery paths.

Rust owns durable watch writes. The frontend keeps only its UI progress mirror. Position samples must match the loaded file; stream history identity activates on file-loaded and is cleared for local playback. Replacement, playlist navigation, EOF and close flush the old session in order.

Track choices persist only after a successful command, distinguish type and ID, and do not roll back a newer file's tracks. Disabled subtitles are a first-class persisted choice (media schema 1; existing numeric track choices remain valid). Sidecars load before track restoration and their commands carry the expected video path. Preference patches merge under a native writer lock so separate windows do not lose unrelated choices.

Events and pending requests are validated at the frontend boundary. Direct plugin IPC permissions are removed; the app limits mpv commands and property writes. Stream URLs and header sizes are validated. Local playback clears inherited HTTP headers and proxy settings. Remote-DNS proxy schemes are preserved; routes requiring libcurl are rejected when the running engine does not expose that backend.

Timeline and volume sliders have keyboard controls, accessible values and pointer cancellation on focus loss. Native-source prefetch runs at most three requests at once. Playlist metadata uses one JSON property read instead of two scalar reads per item. Snapshot polling shares the observed-property parser and does not overwrite a newer event revision.

## Scope limits and review disposition

The attempted broad source-module split was rejected by automatic approval review as too fragile for the critical native integration. It was not executed. Functional fixes and the reduction of snapshot branching proceed without that restructuring. Existing large orchestration files are a known maintenance exception for this change; their separation remains a distinct review package.

Native DLL crashes cannot be recovered reliably inside the same process. Process isolation, native-wrapper replacement, external proxy endpoint verification and GPU/HDR coverage are not inferred from unit tests. They require their own runtime evidence or architecture disposition.

## Verification record

Before fixing stream ownership, both new stale-resolution regressions failed by opening the old stream. After the fix they passed. The latest completed targeted frontend run at this stage passed 43 files / 392 tests; the latest native player run passed 31 tests. Final checks are recorded after the implementation is complete.

Final results:

- `bun run typecheck`: passed, including after the 5.2.5 changelog update.
- `bun run lint`: zero warnings and zero errors.
- `bun run test`: 4081 passed / 1 failed across 371 files. The failure was a route-surface lazy-load timeout in `modules.route.test.tsx`; its focused rerun passed all 11 tests. This is recorded as a flaky full-suite result, not a completely green full run.
- `bun run build`: passed.
- `bun run check:commands`: 291 TypeScript names / 291 native registrations, no missing registration.
- `bun run codegen:ipc:check`: generated bindings are up to date.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline --lib`: 813 passed, zero failed, 15 ignored.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline -p tauri-plugin-libmpv --lib`: ordered delivery and shutdown regression passed (1 test).
- Live player E2E: 8 passed, zero failed, zero skipped, zero console errors. Evidence: `src-tauri/target-e2e/harness/out/2026-11-16T01-20-57/report.md`. Scope: opening actual media, rendered playback state, shaders/cabinet, compact modes and fullscreen.
- Locale and media-store checks after the release notes update: 17 passed. Persistence coverage includes the schema-0 numeric choice upgrade and the new disabled-subtitle choice.

No production profile was used by the live harness. External proxy endpoints, HDR/GPU combinations, long-duration playback and forced native crashes were not exercised. No mutation/fuzz tool is configured; no mutation score or leak-free claim is made. The rejected broad module split remains unimplemented. The 5.2.5 release notes list the user-facing fixes.
