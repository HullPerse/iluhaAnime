# iluhaAnime Watch Party (lobby)

Status: v1.3 plan, decisions locked, protocol, D16 UI flow, lobby.route screens and the sync
algorithm detailed. Not implemented, no production code changed.
Document: this single file is the Watch Party document. No `.docs/` file is created or changed
by this plan; the project `.docs/` contract is referenced only where relevant (design, testing,
security). Every lobby decision lives here.
Source: ChatGPT design text plus the user's decisions across three Q/A rounds. Images in
`images/` were NOT readable in this session (no vision tool), so their content is not part of
this audit. The transport benchmark lives in `plans/lobby-bench/` (scratch, gitignored).

## 0. Locked decisions

- D1 Connection: LAN and remote. Transport is `iroh` (N0 preset), so peers connect by node id
  / room code, not by port forwarding. LAN works through iroh's local discovery.
- D2 Topology: a new route `lobby.route` in the main window holds connect and the live lobby
  (roster, chat, playlist, sources, controls). The video opens in the existing separate player
  window, which receives session state and the sync overlay from Rust.
- D3 Media: each user points at a local file and it opens directly. If a user has no file,
  they take the host's torrent, or the host hands out a link. No automatic public-torrent
  search.
- D4 Start gate: the host cannot start playback until every participant is ready (their file
  is present and verified for the current item).
- D5 Playlist: a per-user playlist. Each entry is either a direct path/link or a folder mapped
  to the host's folder, matched by hash/title.
- D6 Control: host-only by default; the host grants and revokes moderator rights.
- D7 Sync tracks: host presses -> all participants align audio/sub tracks to the host and their
  offsets are set to the host's offsets. A participant presses -> only their own tracks align
  and their offsets are set to the host's. Offsets are copied, never zeroed.
- D8 Identity: local nickname by default, optional AniList linking (nickname, avatar, media
  tag, score).
- D9 Shared: timeline, pause, speed. Personal: audio/sub track, volume, A/V offset, filters.
- D10 Security: room token in the handshake. The host is a mandatory relay for peer messages.
- D11 Moderators: only the host grants and revokes them; moderators cannot promote others.
- D12 Broadcast cadence: host pushes a timeline snapshot every 250 ms and immediately on every
  host/moderator command.
- D13 Media plan and sources: a session has an ordered playlist; each item can carry several
  sources (local file/folder, magnet, `.torrent`, `iluhaAnime://torrent/...`, host-seeded
  torrent). Sources can be added at room creation or at any time in a live lobby.
- D14 Source scope: sources are edited both on the room media plan and on each playlist entry.
- D15 Source authors: only the host adds sources. Participants only attach their own local copy.
- D16 Host torrent: seeded in place from the original folder via
  `create_torrent_from_folder`, with per-episode file selection.
- D17 Avatars: `boring-avatars`. Seed = the lobby UUID for non-AniList users; for AniList
  users the seed is the AniList nickname (and the AniList avatar image is used when present).
- D18 Transport: `iroh` with the N0 preset from the start (accepted tradeoffs below).

## 0.1 Decision log: choices, what was rejected, and why

Reasons are marked (stated) when the user gave them, and (inferred) when derived from the
tradeoffs presented. "Round" refers to the Q/A round.

**D1 connection - LAN and remote**
- Choice: work locally and remotely; round 1 connected by manual address, then superseded by
  iroh (D18), so the address model became a room code / node id with no port forwarding.
- Why: watch with friends both in a LAN and over the internet (stated).
- Rejected: LAN-only; remote-only.
- Change: latest decision wins, manual `host:port` is dropped in favor of iroh addressing.

**D2 topology - route plus separate player window**
- Choice: `lobby.route` in the main window for connect and the lobby; video in the existing
  separate player window.
- Why: keep setup and management in the app, keep video in its own window (stated); the player
  window already exists.
- Rejected: one lobby window with embedded video only.

**D3 media source - own file first**
- Choice: attach a local file and open it directly; otherwise take the host's torrent or link.
- Why: everyone watches their own copy at full quality; no forced download when a file exists
  (stated).
- Rejected: custom host-to-peer file transfer as the primary path.

**D4 start gate - all must be ready**
- Choice: the host cannot start until every participant has the current item.
- Why: never start with someone missing the file (stated).

**D5 playlist - per-user, folder matched by hash/title**
- Choice: a per-user playlist; each entry is a direct path/link or a folder mapped to the
  host's folder, matched by hash/title.
- Why: multi-episode sessions where each person has their own file layout (stated).

**D6 control - host-only plus moderators**
- Choice: host-only by default; the host grants and revokes moderators.
- Why: one authority prevents timeline chaos, and the host can delegate (stated).
- Rejected: shared control for everyone; request control by default.

**D7 sync tracks - align to host and copy the host's offsets**
- Choice: host presses -> all align to host and offsets are set to the host's; a participant
  presses -> only their own align and their offsets are set to the host's.
- Why: everyone matches the host's exact A/V timing; a guest action never changes others
  (stated).
- Rejected: warn-only on mismatch; fully independent tracks.

**D8 and D17 identity and avatars - local default, AniList optional, boring-avatars**
- Choice: local nickname by default, optional AniList linking; `boring-avatars` seeded by the
  lobby UUID for local users and by the AniList nickname for linked users.
- Why: nobody is forced to log in, while AniList adds avatar, media tag and score (stated);
  a deterministic avatar from the room UUID keeps identity stable inside a room (inferred).
- Rejected: mandatory AniList login; local-only with no AniList; DiceBear, minidenticons,
  jdenticon for avatars.

**D9 shared vs personal - timeline shared, quality personal**
- Choice: timeline, pause and speed are shared; audio/sub track, volume, A/V offset and
  filters are personal.
- Why: the timeline must match, but audio quality and preferences must not be forced on others
  (stated).
- Rejected: shared volume; per-user speed.

**D10 security - room token plus host as relay**
- Choice: a room token in the handshake, and the host relays all peer messages.
- Why: access control and a single channel to the host (stated).
- Rejected: password with direct P2P; password without a token.

**D11 moderators - host grants and revokes only**
- Choice: only the host grants and revokes moderator rights.
- Why: keep one authority for rights (inferred).
- Rejected: moderators can promote others; session-only moderators.

**D12 broadcast cadence - 250 ms plus on command**
- Choice: a snapshot every 250 ms and immediately on every host/moderator command.
- Why: balance traffic and correction accuracy while commands stay instant (inferred).
- Rejected: commands-only plus a 1 s heartbeat; 100 ms.

**D13 and D14 sources - room plan and per entry, live editable**
- Choice: sources are edited on the room media plan and on each playlist entry, at creation or
  in a live lobby.
- Why: fix a missing source without recreating the room, and support per-episode granularity
  (stated).
- Rejected: only per playlist entry; only one source for the whole session.

**D15 source authors - host only**
- Choice: only the host adds sources; participants attach their own local copy.
- Why: one consistent release version, avoids mismatched versions (inferred).
- Rejected: any participant can add sources; host plus moderators.

**D16 host torrent - seed in place with episode selection**
- Choice: seed in place from the original folder via `create_torrent_from_folder`, with
  per-episode file selection.
- Why: no copy time or extra disk, share only the needed files (inferred).
- Rejected: copy into a shared folder; always share the whole folder.

**Public torrent search - disabled**
- Choice: no automatic search; only paste a link/magnet or take the host's torrent.
- Why: avoid noise and unexpected sources, keep control over what enters the lobby (inferred).
- Rejected: automatic search by title/episode.

**D18 transport - iroh (N0) from v1**
- Choice: iroh with the N0 preset as the transport.
- Why: no port forwarding, works for non-technical friends, encryption and LAN discovery
  included, all in one dependency (inferred from the chosen user experience).
- Accepted cost: 331 crates, ~13.3 MB binary, a public relay and discovery dependency that
  adds a capability and privacy entry.
- Rejected: tokio TCP + JSON (the recommended option, 24 crates, ~0.5 MB); TCP without UPnP.
- Reversible: the protocol stays behind a `Transport` trait, so the transport can be swapped
  without touching the session core.

### Explicitly rejected by the user (summary)
- TCP + JSON transport, and TCP without UPnP.
- Mandatory AniList login; local-only identity; DiceBear, minidenticons, jdenticon avatars.
- Automatic public-torrent search.
- Shared volume; per-user speed.
- Direct P2P with a password; password without a token.
- Moderators promoting others; session-only moderators.
- Copy-to-shared-folder seeding; whole-folder seeding.
- Any-participant or host+moderator source authoring.
- Sources limited to per-entry only, or to a single source for the whole session.
- Warn-only or fully independent track sync.
- Commands-only or 100 ms broadcast cadence.

### Deferred by the plan, not user decisions
- P2P multi-source chunk distribution, voice chat, tolerant/keyframe matching, and a
  self-hosted iroh relay. These are the plan's own deferrals with return conditions (section
  11), not choices the user made.

## 1. Audit: what exists vs what is needed

### 1.1 Building blocks already present (Clear)

- Player Rust core: `src-tauri/src/player/` over `tauri-plugin-libmpv`. Snapshot push at
  100 ms while dirty (`player-state`), tracks via `player-tracks`, chapters via
  `player-chapters`, lifecycle via `player-event`.
- Separate player window: label `player`, route `/player-window` (`__root.tsx`), created by
  `player_open`; close destroys mpv and the window.
- Player overlay UI in `src/routes/components/player/media/`.
- Per-file persist: `src/store/media.store.ts` (position, sub/audio offset, track picks);
  Rust is authoritative for watch position (`watch.rs` + `app_cache`).
- Per-user prefs: `src/store/player.store.ts` (volume, settings, profile, eof, hwdec,
  seekMode, autoHide).
- Local file index: `file_index.rs` (`rebuild/refresh/search_file_index`) plus the persisted
  unified index.
- Torrent stack: `librqbit` with `create_torrent_from_folder`, `start_torrent_download`,
  magnet handling, per-torrent limits, SOCKS5 proxy.
- Deep links: `deeplink.rs` parses `iluhaanime://torrent/<40 hex>`; frontend `parsePastedLink`
  / `openTorrent` exist.
- AniList: auth, profile, search, released-anime poller.
- SQLite KV cache: `app_db` `get/put/delete_app_cache`.
- i18n: `src/lib/locale/` (en/ru domain files) via `useI18n`.
- Window creation pattern: `player_open` (`WebviewWindowBuilder`), chrome persisted.

### 1.2 Blockers

- B1 No cross-window shared state. The main window (`lobby.route`) and the `player` window are
  separate webviews with separate JS contexts and separate Zustand stores. The session state,
  roster, authority, and relay MUST live in Rust (`AppHandle` managed state); both windows read
  it through commands/events. A React-only lobby is impossible.
- B2 No declared network session capability. `.docs/SECURITY.md` has no inbound listener, no
  peer channel, no discovery. Adding one is Blocker-class until SECURITY.md and DECISIONS.md
  are updated before merge.
- B3 No media identity. Only the path is known; nothing hashes a file. Matching (D5) and the
  ready gate (D4) need size + duration + content hash. `read_file_bytes` only accepts
  `.torrent`, so a new bounded, streamed, cancellable hashing command is required.

### 1.3 Risks

- R1 The player snapshot is event-driven (dirty, 100 ms), with no monotonic reference
  timestamp, no RTT, no peer clock offset. Sub-150 ms drift cannot be measured or corrected
  without an explicit heartbeat + clock estimate. This is the core new work.
- R2 `speed` is a persisted user preference. Drift correction by micro rate change must use a
  separate, non-persisted factor and must not overwrite the host/user speed.
- R3 Every playback command hits mpv directly. Host-only mode requires intercepting guest
  controls as requests and letting host/moderator controls broadcast.
- R4 Window lifecycle kills the player session. The session must outlive both windows, so it
  is Rust-owned.
- R5 Single mpv / single player label: `PLAYER_WINDOW_LABEL` is a constant and every
  `player_*` command assumes one instance. The label/instance must be parameterized, or the
  session reuses the one player.
- R6 No identity/auth/message bounding. Need peer id, display name, room token, frame cap, and
  no full-path leakage to peers.
- R7 Ready gate must be computed from the whole playlist per peer and survive reconnects.

### 1.4 Gaps

- G1 Room lifecycle, roster, roles, moderators, ready-check, countdown, chat: none.
- G2 Connect UI (iroh node id / room code): none.
- G3 Media matching (hash/size/duration) and playlist folder mapping: none.
- G4 Torrent sharing UI inside the lobby, clickable magnet/deep links: none.
- G5 Per-user sync offset/compensation UI: only per-file audio/sub delay exists.
- G6 No lobby route, tab/flag, settings, or i18n keys. Only routes are `/`, `/error`,
  `/player-window`.
- G7 No external player control surface (fixed label, local only).
- G8 No networking/session test harness.

### 1.5 Reuse opportunities (minimalism)

- R-1 Chat links: reuse `deeplink.rs` parsing and `parsePastedLink`/`openTorrent`; add a magnet
  branch to the chat renderer.
- R-2 Torrent sharing: reuse `create_torrent_from_folder` + `start_torrent_download`.
- R-3 "Find my copy": reuse `search_file_index`.
- R-4 Identity: reuse AniList profile and search.
- R-5 Persistence: reuse `app_db` app_cache.
- R-6 Renderer: reuse `/player-window` and its overlay; add a session strip.
- R-7 Broadcast loop: reuse the `player::state::attach` ticker + `emit` pattern.

## 2. Critical verdict on the pasted design

Directionally right, over-scoped. Good: three-system split, host-authoritative snapshots with
`revision`/`updatedAt`/`mediaId`, command-vs-state separation, drift thresholds. Weak: it
treats the two-window reality as a detail (here it forces Rust ownership), commits full P2P
chunk distribution and voice chat too early, treats speed-based drift correction as routine
(it is the last resort), and assumes LAN-first. The torrent-sharing requirement makes the
media path simpler than the design's custom transfer: reuse the existing torrent stack.

## 3. Target architecture

Rust owns truth; both windows are thin views.

```
main window: lobby.route            player window: /player-window
   connect, roster, chat,              video + controls + sync strip
   playlist, sources, ready             (driven by session state)
        |                                        |
        |  invoke(session_*) / listen(session-*) |
        +------------- Rust Session Core --------+
                        SessionHost (managed state)
                        |            |            |
                 Transport trait   Playback Authority   Media Identity
                 iroh (N0)         (existing player)     hash + ffprobe + file_index
```

New module `src-tauri/src/session/`:
- `mod.rs` constants + command re-exports (mirror `player/mod.rs`).
- `protocol.rs` `PROTOCOL_VERSION`, `ClientMessage`, `ServerMessage`, `PeerInfo`,
  `PlaybackState`, `ControlAction`, `PlaylistEntry`, frame encode/decode + size cap.
- `transport.rs` `Transport` trait + iroh implementation: N0 endpoint, room code / node id
  addressing, one bidirectional stream per guest (or a QUIC datagram channel for heartbeats),
  framed JSON on top. The protocol stays transport-agnostic.
- `host.rs` endpoint accept loop, handshake, roster, relay, broadcast.
- `client.rs` connect by node id / room code, handshake, reconnect, local peer.
- `sync.rs` clock estimation (RTT + offset), expected position, drift classification.
- `media.rs` identity (hash + size + duration + tracks) and match levels.
- `playlist.rs` per-peer playlist mapping and the ready gate.
- `state.rs` `SessionHost` + serialized `SessionSnapshot`.
- `commands.rs` the `session_*` commands.

Frontend:
- `src/routes/lobby.route.tsx` (main window: connect, room, roster, chat, playlist, sources,
  ready).
- `src/routes/components/lobby/` UI.
- `src/store/session.store.ts` read-only mirror fed by events.
- `src/hooks/session/events.hook.ts`; `src/lib/session/`; `src/config/lobby/`.
- Player window: optional session strip (lag, roster, host controls, sync buttons, chat toggle).

## 3.1 Lobby protocol (detailed)

### Transport and framing
- iroh QUIC. Control traffic runs on one bidirectional QUIC stream per guest (ordered,
  reliable). Heartbeats and drift reports may use QUIC datagrams (unreliable, low latency);
  the default is the reliable stream until proven otherwise (see Q-protocol-frames).
- Frame = u32 little-endian length + UTF-8 JSON. Hard cap 256 KB; a larger frame closes the
  connection with Error RATE_LIMITED.
- Every frame is a tagged object: `{ "v": 1, "seq": <u64>, "t": "<type>", ... }`. `v` is the
  protocol version; a mismatch is rejected during the handshake.
- The host relays guest-to-guest traffic (D10): it re-addresses and rebroadcasts and never
  trusts a guest-supplied sender field.

### Addressing and handshake
- The host binds an iroh endpoint (N0) and shows a room code derived from its node id plus a
  session nonce, together with a separate room token.
- Connect sequence:
  1. Guest opens a connection to the host node id.
  2. Guest -> Hello { v, peerId, displayName, token, anilistUserId? }.
  3. Host validates v and token; on failure -> Error { code: BAD_VERSION | BAD_TOKEN } then close.
  4. Host -> Welcome { protocol, sessionId, hostId, yourPeerId, roster, mediaPlan }.
  5. Host broadcasts Roster to everyone.
  6. Guest starts ping/pong and immediately receives the current PlaybackState.

### Messages: client -> host
- Hello { v, peerId, displayName, token, anilistUserId? }
- TimePing { seq, t1 }
- StateReport { mediaTime, isPlaying, rate, buffering, mediaId, ready, items: [{ itemId,
  present, verified }] }
- RequestControl { action }
- RequestTrackSync {}
- TrackPick { audio, sub, audioDelay, subDelay }
- Chat { text }
- Bye {}

### Messages: host -> client
- Welcome { protocol, sessionId, hostId, yourPeerId, roster, mediaPlan }
- Roster { peers: [{ peerId, displayName, avatarSeed, anilistUserId?, role, connection, ready,
  driftMs, rttMs, buffering }] }
- MediaPlan { items: [{ itemId, order, title, identity { sha256, size, duration }, sources:
  [{ sourceId, kind, label, status }] }] }
- PlaybackState { revision, mediaId, position, isPlaying, rate, updatedAtMono }
- Command { revision, action }
- TimePong { seq, t1, t2 }
- TrackSync { mediaId, audio, sub, audioDelay, subDelay }
- SourceUpdate { itemId, sourceId, kind, value?, status }
- ReadyState { peerId, ready, items }
- Chat { from, text, at, links }
- Kick { reason }
- Error { code, message }
- Bye {}

### Action shape (shared, used by Control and RequestControl)
- play {} ; pause {} ; seek { position } ; rate { rate }.

### State and revisions
- PlaybackState is a snapshot, commands are events. `revision` is monotonic and increases on
  every state change. A guest ignores any PlaybackState or Command with revision <= the last
  applied one.
- `mediaId` guards cross-episode races: a command whose mediaId differs from the guest's
  current item is ignored.
- On (re)join only the latest snapshot is sent, never a command history.

### Clock sync
- Guest-initiated. The guest sends TimePing { seq, t1 } every 1 s; the host replies
  TimePong { seq, t1, t2 } (t2 = host now on receipt). The guest estimates RTT and the host
  clock offset by EWMA, treating the host processing step as part of the RTT.
- Guest expected position: expected = position + (guestNow + offset - updatedAtMono) * rate -
  rtt/2. The full estimator, thresholds and correction are in section 5.1.

### Control flow
- Host or moderator control: the UI applies locally, the host broadcasts Command, guests
  apply it. Every action bumps revision.
- Guest in host-only mode: controls are intercepted and sent as RequestControl. The host
  ignores it (host-only) or applies and broadcasts (moderator). The guest UI shows "request
  sent".
- Duplicate suppression: each Command carries its revision; guests drop already-applied ones.

### Ready gate
- Each guest reports per-item presence and verification in StateReport.
- Host aggregates into ReadyState; Start is enabled only when every peer is present and
  verified for every item of the current plan (D4).
- On reconnect the gate is recomputed from current reports, not from transient UI.

### Track sync (D7)
- Host presses: host -> TrackSync (broadcast) with the host's audio, sub and delays.
- Guest presses: guest -> RequestTrackSync; host replies with a unicast TrackSync.
- Guests set their tracks and offsets to the received values; nothing else is overwritten.

### Chat and links
- Host relays Chat to everyone. Text is bounded (for example 2000 chars) and rate-limited.
- The renderer detects magnets and `iluhaAnime://torrent/...`, marks them clickable and
  visually distinct, and can add the parsed source to the lobby (reuse deeplink parsing).

### Reconnect rules
- Heartbeat timeout (default 6 s) marks a peer stale in the roster; it is kept for a grace
  window (default 30 s) then removed.
- A guest reconnecting with the same peerId and a valid token restores its peer record and
  receives Welcome + latest PlaybackState + MediaPlan + Roster.
- A host restart loses the room in v1 (no host migration); recorded as deferred.

### Error codes
- BAD_VERSION, BAD_TOKEN, ROOM_FULL, NOT_READY, KICKED, RATE_LIMITED, INTERNAL. Each surfaces
  in the UI with a next action.

### Limits
- Frame 256 KB; roster cap from the room setting; ping 1 s; heartbeat timeout 6 s; chat
  bounded and rate-limited.

### New Tauri commands and events (IPC surface)
- session_create, session_join, session_leave, session_state
- session_set_playlist, session_add_source, session_remove_source, session_create_torrent
- session_control, session_request_control, session_force_resync, session_sync_tracks
- session_chat, session_set_ready, session_set_identity
- Events: session-state, session-roster, session-event (global emit; both windows listen).

## 4. Media plan and sources (D3, D5, D13, D14, D15, D16)

The session has a media plan: an ordered playlist of items. Each item can carry several
sources; one source per item must resolve to a verified local file before the item counts as
ready. Sources are edited both on the room media plan and per playlist entry, and only by the
host.

Source types: local file/folder (folder maps by hash/title), magnet, `.torrent` path,
`iluhaAnime://torrent/<40 hex>`, host-seeded torrent.

Add-source UI:
- One smart input that auto-detects the type (magnet, `.torrent` path, iluhaAnime link, drive
  path), plus "Browse file" and "Create torrent".
- Per-source status: resolving metadata -> downloading (progress, speed, peers, ETA,
  pause/resume) -> verifying -> ready. Errors show a next action.
- Chat: any magnet or deep link renders as a distinct clickable chip with an "add to lobby"
  action.
- Host "Share via torrent": choose a file, several files, or a folder -> reuse
  `create_torrent_from_folder` -> seed in place with per-episode selection -> show a share card
  with the magnet, the `.torrent` path and the deep link, plus "post to chat".
- No automatic public-torrent search. A participant without a file either takes the host's
  torrent or attaches their own copy.

Flow:
1. Host picks the item; the app computes identity (hash + size + duration).
2. Participants attach a source; local files are compared by identity, torrent downloads are
   verified on completion.
3. Ready gate (D4): the host's Start stays disabled until every participant has the current
   item verified; recomputed from session state on reconnect.

## 4.1 Host torrent: detailed UI flow (D16)

Goal: the host turns a local file, several files, or a folder into a torrent, seeds it in
place, and shares a magnet, a `.torrent` file, or a deep link. No automatic public-torrent
search (D3).

### Entry points
- Room media plan or a playlist entry -> "Add source" -> "Create torrent".
- A host-only "Share" action on an item.
- A participant without a file sees "Ask host for a file"; the host gets a prompt.

### Step 1 - Choose what to share
- Choice: "Folder" (preferred) or "Files".
- Folder uses the existing dialog plugin; Files is a multi-select.
- Show the chosen path(s) and a note that the folder is shared from its current location.

### Step 2 - Preview and select episodes
- List detected video files: name, size, and the parsed episode via the existing anitomy
  parsing.
- Checkboxes, all selected by default, with "Select all" and "Select none".
- Show total size and the selected count.
- Warn on: no video files; non-video files in the folder; a very large selection; a network or
  removable drive; a path under a temp directory.

### Step 3 - Create and seed
- Reuse `create_torrent_from_folder` (or a file-list variant for the Files path).
- Progress: hashing percent and the current file, cancelable. Cancel cleans up the pending
  torrent.
- If a torrent with the same infohash already exists, reuse it instead of creating a duplicate.
- On success: show name, total size, file count, infohash, and that seeding runs in place.
- Warn that moving or deleting the files stops the share.

### Step 4 - Share
- Outputs with copy/save actions: magnet link, `.torrent` file (existing save dialog), and
  `iluhaAnime://torrent/<infohash>` deep link.
- Actions: "Copy magnet", "Save .torrent", "Post to chat".
- A share card shows live seeding state: peers connected, uploaded bytes, per-item status.
- All three outputs are also clickable chips in chat; a guest can add the source from chat.

### Step 5 - In the lobby (guest side)
- The host source appears on the item as a "Host torrent" chip with a "Download" action.
- Download reuses `start_torrent_download` (magnet) and the existing torrent progress UI.
- On completion the app verifies the item identity (size + hash). A mismatch warns and offers
  to re-download.
- When verification passes, the item counts toward the ready gate (D4).

### Editing later (D13, D14)
- The host can reopen this flow from any item's source list at any time in a live lobby to add,
  replace, or remove a source.
- Removing a source stops seeding after a confirmation and never deletes files.

### States to design
- empty (no video found), loading (hashing), error (file moved or locked, disk full), disabled
  (not host), dirty (selection changed), stale (source unreachable), recovery (re-pick path).
- Seeding status vocabulary: preparing, seeding, paused, error, stopped.

## 5. Playback sync (proposed)

Host authority: `position` at `updated_at_mono` (host monotonic), `rate`, `is_playing`,
`media_id`. Snapshots (250 ms + on each command) are separate from commands.

Guest expected position:
`expected = position + (guest_now - offset - updated_at_mono) * rate - rtt/2`, where `offset`
and `rtt` come from ping/pong smoothing (iroh gives a QUIC connection, so RTT is cheap to
sample).

Drift `d = local_time - expected`, thresholds (in `config/lobby`):
- `|d| <= 150 ms`: nothing.
- `150-500 ms`: gentle correction via a non-persisted speed factor.
- `500 ms - 2 s`: stronger correction or a short seek.
- `> 2 s`: hard resync.
- Reconnect/buffering: pause-local, resync on resume.

Player strip shows per participant: host time, local time, signed drift, RTT, sync quality,
buffering, rate, connection, plus a manual resync button. Network latency and video drift are
shown separately. Two explicit actions: "Sync tracks" (D7) and "Sync time" (hard resync).

## 5.1 Sync algorithm (detailed with pseudocode)

This refines section 3.1: Ping/Pong are guest-initiated, so one exchange gives both liveness
and a clock offset. The host is authoritative; guests converge to it. All time is a monotonic
clock (Rust `Instant` / JS `performance.now()`), never wall clock.

### Parameters (defaults, in src/config/lobby)

- PING_INTERVAL_MS = 1000
- EVAL_INTERVAL_MS = 250 (matches the 250 ms host broadcast)
- RTT_EWMA_ALPHA = 0.2
- OFFSET_EWMA_ALPHA = 0.1
- DRIFT_EWMA_ALPHA = 0.3
- RTT_OUTLIER = minRtt * 4 + 20 ms (ignore these for the offset sample)
- DRIFT_DEADBAND_MS = 150
- DRIFT_SOFT_MS = 500
- DRIFT_SEEK_MS = 2000
- MAX_RATE_ADJUST = 0.05 (max 5 percent correction)
- RATE_GAIN = MAX_RATE_ADJUST / DRIFT_SOFT_MS (per ms)
- STABLE_SAMPLES = 3 (hysteresis before acting)
- HIST = 8 (samples kept)

### Clock sync (RTT and offset)

Guest sends TimePing, host replies TimePong. Two timestamps plus the round trip give the
offset, the same math as NTP with the host processing step folded into the RTT.

```
state:
  seq = 0
  min_rtt = None
  rtt_est = None
  offset_est = 0          # host_clock - guest_clock, ms
  pending = {}

loop every PING_INTERVAL_MS:
  seq += 1
  t1 = now_mono()
  pending[seq] = t1
  send TimePing { seq, t1 }

on TimePong { seq, t1, t2 }:      # t2 = host now on receipt
  t3 = now_mono()
  if seq not in pending: return    # stale
  pending.remove(seq)
  rtt = t3 - t1
  offset = t2 - (t1 + rtt / 2)
  if min_rtt is None or rtt < min_rtt: min_rtt = rtt
  rtt_est = ewma(rtt_est, rtt, RTT_EWMA_ALPHA)
  if rtt > min_rtt * 4 + 20: return     # outlier: keep rtt, drop the offset sample
  offset_est = ewma(offset_est, offset, OFFSET_EWMA_ALPHA)
```

Host clock now, as seen by the guest: `host_now() = now_mono() + offset_est`.

Liveness: the host treats an incoming TimePing as proof the guest is alive, and the guest
treats a TimePong or PlaybackState as proof the host is alive (heartbeat timeout 6 s).

### Expected position

```
def guest_host_now(): return now_mono() + offset_est

def expected(snapshot):
  if snapshot.isPlaying:
    elapsed = guest_host_now() - snapshot.updatedAtMono
    return snapshot.position + elapsed * snapshot.rate - rtt_est / 2
  else:
    return snapshot.position
```

The `- rtt_est / 2` compensates for the one-way delay already inside the last snapshot.

### Drift and classification

Signed drift: positive means the guest is ahead of the host, negative means behind. Only
evaluate while playing, not while seeking or buffering.

```
loop every EVAL_INTERVAL_MS while playing and not compensating_for_seek:
  local = mpv.time_pos() * 1000      # ms
  exp   = expected(current_snapshot) * 1000
  d     = local - exp
  drift_smooth = ewma(drift_smooth, d, DRIFT_EWMA_ALPHA)

  action = classify(drift_smooth)
  stable = (action == last_action) ? stable + 1 : 0
  last_action = action
  if action == NONE or stable >= STABLE_SAMPLES:
    apply(action)

def classify(d):
  a = abs(d)
  if a <= DRIFT_DEADBAND_MS: return NONE
  if a <= DRIFT_SOFT_MS:     return SOFT
  if a <= DRIFT_SEEK_MS:     return MEDIUM
  return HARD
```

### Correction

Correction is a separate multiplier, never the store's or host's speed: effective speed is
`host_rate * correction`. The host rate from PlaybackState is the shared value; the correction
only nudges timing and returns to 1.0 when the drift is inside the deadband. mpv preserves
pitch on speed changes (scaletempo), so changes up to 5 percent are acceptable.

```
apply(action):
  switch action:
    NONE:
      correction = 1.0
      set_mpv_speed(host_rate)
    SOFT, MEDIUM:
      maxAdjust = (action == SOFT) ? MAX_RATE_ADJUST : MAX_RATE_ADJUST * 2
      # ahead (d > 0) -> slow down; behind (d < 0) -> speed up
      target = 1.0 - clamp(d * RATE_GAIN, -maxAdjust, +maxAdjust)
      correction = ewma(correction, target, 0.5)
      set_mpv_speed(host_rate * correction)
    HARD:
      force_resync()

def force_resync():
  correction = 1.0
  drift_smooth = 0
  last_action = NONE
  stable = 0
  set_mpv_speed(host_rate)
  seek_exact(expected(current_snapshot))   # absolute+exact
  awaiting_restart = true
```

### Events that reset sync

- Host Command seek/play/pause/rate: apply, then force_resync (a seek snaps to the exact
  expected position instead of crawling there through rate correction).
- playback-restart: awaiting_restart = false; drift_smooth = 0.
- Buffering start: suspend correction and the drift loop. Buffering end: force_resync.
- Reconnect: apply the latest PlaybackState snapshot, clear correction, force_resync.
- Media change (new mediaId): drop old samples, reset offset history, force_resync.
- Pause: no correction while paused; on play the guest uses the host's paused position.

### Manual actions

- "Sync time" (host or a participant): force_resync for the caller; a host broadcast sends a
  fresh PlaybackState with a bumped revision, and every guest force_resyncs to it.
- "Sync tracks" (D7): unrelated to timing; sets track ids and A/V offsets to the host's values.

## 6. Identity, avatar, chat, media tag (D8, D17)

- Identity: AniList profile when linked; otherwise a local nickname stored in app_cache.
- Avatar: `boring-avatars`. Non-AniList: seed = lobby UUID. AniList: seed = AniList nickname,
  and the AniList avatar image when present.
- Roster shows avatar, name, role, connection, ready, source status.
- Media tag: AniList search for the current item; show cover and score.
- Chat: bounded text, system messages (join/leave/start/episode change/ready), reactions, and
  clickable magnet / `iluhaAnime://torrent/...` links rendered distinctly.

## 7. UI map

`lobby.route` (main window):
- Create room: name, optional password, max peers, display name, media plan/sources.
- Join: room code / node id (iroh); no port forwarding.
- Room: roster (roles, moderators, ready, source status, connection), chat, playlist with
  per-user mapping, sources, ready gate, host controls, personal controls, "Sync time",
  "Sync tracks".
- Diagnostics: RTT, drift, buffering, media_id, connection type (direct/relay/LAN).
- Required states: loading, empty, error (connect/version/token), disabled, stale (heartbeat
  lost), recovery (reconnecting).

Player window (session active): compact roster strip, lag badge, host-control lock indicator,
the two sync buttons, chat toggle.

Windows 95 style per `.docs/DESIGN.md`; all strings via i18n; color never the only signal.

## 7.1 lobby.route screens: layout, states, texts

Navigation: `lobby.route` has four modes in local state: Home, Create, Join, Room. Switching
is instant (no router). Room has a left rail with tabs: Roster, Playlist, Chat, Diagnostics.
Strings are i18n keys (en canonical, ru mirror). Cyrillic below is intentional locale data;
punctuation stays ASCII.

### Shared shell
- Windows 95 window using `ui-panel` / `ui-toolbar`, matching `player.route` and settings
  panels.
- Top bar: room name, room code with a copy button, connection type, participant count, Leave.
- Bottom status line: connection state, ready gate summary, last error.
- Focus: visible Win95 dotted focus on every control; keyboard navigation for tabs, lists and
  dialogs; color is never the only state signal.

### Home
- Layout: title, two primary buttons (Create room, Join room), display name and avatar
  preview, Recent rooms list.
- States: empty recents; stale recent entry (unreachable) greyed with a retry.
- Interactions: clicking a recent entry jumps to Join prefilled.
- Texts:
  - lobby.home.title - "Watch party" / "Совместный просмотр"
  - lobby.home.create - "Create room" / "Создать комнату"
  - lobby.home.join - "Join room" / "Присоединиться"
  - lobby.home.recent - "Recent rooms" / "Недавние комнаты"
  - lobby.home.recent.empty - "No rooms yet" / "Комнат пока нет"
  - lobby.home.displayName - "Your name" / "Ваше имя"
  - lobby.home.displayName.hint - "Shown in the roster" / "Показывается в списке участников"

### Create room
- Fields: room name, optional password, max participants, media plan (add item and sources).
- States:
  - default; dirty (unsaved name);
  - loading while binding the iroh endpoint: "Creating room...";
  - error: endpoint bind failed, no network, torrent unavailable (inline with a next action);
  - disabled: Create greyed until the name is non-empty and the media plan has at least one
    item.
- Interactions: Add item opens the source picker (local file/folder, magnet, .torrent, deep
  link, Create torrent); each item shows its identity once computed.
- Texts:
  - lobby.create.title - "Create room" / "Создать комнату"
  - lobby.create.name - "Room name" / "Название комнаты"
  - lobby.create.name.required - "Enter a room name" / "Введите название комнаты"
  - lobby.create.password - "Password (optional)" / "Пароль (необязательно)"
  - lobby.create.maxPeers - "Max participants" / "Максимум участников"
  - lobby.create.mediaPlan - "Media plan" / "План просмотра"
  - lobby.create.addItem - "Add item" / "Добавить элемент"
  - lobby.create.create - "Create room" / "Создать"
  - lobby.create.creating - "Creating room..." / "Создание комнаты..."
  - lobby.create.error.bind - "Could not start the room. Check your connection and try again."
    / "Не удалось создать комнату. Проверьте подключение и повторите."

### Join room
- Fields: room code or node id, token, display name.
- States: default; dirty; loading "Connecting..." with a cancel; and specific errors with a
  next action each: BAD_VERSION ("update the app"), BAD_TOKEN ("check the room token"),
  ROOM_FULL, UNREACHABLE, KICKED.
- Texts:
  - lobby.join.title - "Join room" / "Присоединиться"
  - lobby.join.code - "Room code" / "Код комнаты"
  - lobby.join.code.placeholder - "Paste the host code" / "Вставьте код хоста"
  - lobby.join.token - "Token" / "Токен"
  - lobby.join.connect - "Join" / "Войти"
  - lobby.join.connecting - "Connecting..." / "Подключение..."
  - lobby.join.error.badVersion - "Connection failed: app versions differ. Update the app."
    / "Не удалось подключиться: разные версии приложения. Обновите приложение."
  - lobby.join.error.badToken - "Connection failed: wrong room token."
    / "Не удалось подключиться: неверный токен комнаты."
  - lobby.join.error.roomFull - "The room is full." / "Комната заполнена."
  - lobby.join.error.unreachable - "Host not found. Check the code and try again."
    / "Хост не найден. Проверьте код и повторите."
  - lobby.join.error.kicked - "You were removed from the room." / "Вас исключили из комнаты."

### Room - header
- Shows room name, code with copy, connection type (Direct / Relay / LAN), N participants, and
  Leave. Leave confirms for the host ("Close the room for everyone?").
- Texts:
  - lobby.room.leave - "Leave" / "Выйти"
  - lobby.room.leave.confirmHost - "Close the room for everyone?" / "Закрыть комнату для всех?"
  - lobby.room.copyCode - "Copy code" / "Копировать код"
  - lobby.room.connection.direct - "Direct" / "Напрямую"
  - lobby.room.connection.relay - "Relay" / "Через релей"
  - lobby.room.connection.lan - "LAN" / "Локальная сеть"

### Room - Roster tab
- Row: avatar, name, role (Host/Moderator/Viewer), connection state, ready flag, drift ms, rtt
  ms, buffering.
- Host actions per row: Promote/Demote, Kick (with confirm).
- States: empty (just you), stale peer (greyed, "Reconnecting"), offline, ready/unready.
- Texts:
  - lobby.roster.title - "Participants" / "Участники"
  - lobby.roster.role.host - "Host" / "Хост"
  - lobby.roster.role.moderator - "Moderator" / "Модератор"
  - lobby.roster.role.viewer - "Viewer" / "Зритель"
  - lobby.roster.ready - "Ready" / "Готов"
  - lobby.roster.unready - "Not ready" / "Не готов"
  - lobby.roster.reconnecting - "Reconnecting" / "Переподключение"
  - lobby.roster.drift - "Lag" / "Отставание"
  - lobby.roster.kick - "Kick" / "Исключить"
  - lobby.roster.kick.confirm - "Remove this participant?" / "Исключить участника?"
  - lobby.roster.promote - "Make moderator" / "Сделать модератором"
  - lobby.roster.demote - "Remove moderator" / "Снять модератора"

### Room - Playlist tab (media plan)
- Ordered list of items. Each row: order, title, identity state (Matched / Missing / Mismatch),
  source chips, and the per-user mapping action.
- Host: Add item, Create torrent, Add/remove source, reorder (up/down), remove, replace the
  active item.
- Participant: "Use my file", "Pick folder", "Download from host"; the row shows the match.
- Ready gate header: "Ready 2/3" with a Start button; Start is disabled until all are ready,
  with a reason line ("Waiting for Kira").
- States: computing identity, empty plan, error (file moved), disabled (not ready), stale
  (source unreachable), recovery (re-pick).
- Texts:
  - lobby.playlist.title - "Playlist" / "Плейлист"
  - lobby.playlist.addItem - "Add item" / "Добавить элемент"
  - lobby.playlist.useMyFile - "Use my file" / "Указать свой файл"
  - lobby.playlist.pickFolder - "Pick folder" / "Выбрать папку"
  - lobby.playlist.download - "Download from host" / "Скачать у хоста"
  - lobby.playlist.matched - "Matched" / "Совпадает"
  - lobby.playlist.missing - "Missing" / "Нет файла"
  - lobby.playlist.mismatch - "Different file" / "Другой файл"
  - lobby.playlist.readyGate - "Ready {ready}/{total}" / "Готовы {ready}/{total}"
  - lobby.playlist.waitingFor - "Waiting for {names}" / "Ожидание: {names}"
  - lobby.playlist.start - "Start" / "Начать"
  - lobby.playlist.start.disabled - "Waiting for everyone to be ready"
    / "Ждём, пока все будут готовы"
  - lobby.playlist.source.hostTorrent - "Host torrent" / "Торрент хоста"
  - lobby.playlist.source.magnet - "Magnet" / "Магнит"
  - lobby.playlist.source.file - "Local file" / "Локальный файл"

### Room - Chat tab
- Message list: system (join/leave/start/episode/ready) and user messages, reactions.
- Link chips: magnet and `iluhaAnime://torrent/...` render as distinct clickable chips with
  "Add to lobby".
- Composer: text field and Send; disabled while disconnected.
- States: empty, rate-limited, read-only for kicked/left, stale (offline banner).
- Texts:
  - lobby.chat.title - "Chat" / "Чат"
  - lobby.chat.placeholder - "Message" / "Сообщение"
  - lobby.chat.send - "Send" / "Отправить"
  - lobby.chat.empty - "No messages yet" / "Сообщений пока нет"
  - lobby.chat.rateLimited - "You are sending messages too fast" / "Слишком часто"
  - lobby.chat.sys.joined - "{name} joined" / "{name} присоединился"
  - lobby.chat.sys.left - "{name} left" / "{name} вышел"
  - lobby.chat.sys.started - "Playback started" / "Воспроизведение началось"
  - lobby.chat.sys.episode - "Now playing: {title}" / "Сейчас: {title}"
  - lobby.chat.sys.ready - "{name} is ready" / "{name} готов"
  - lobby.chat.link.add - "Add to lobby" / "Добавить в лобби"

### Room - Diagnostics tab
- Rows: connection type, protocol version, RTT, host clock offset, local drift, buffering,
  media_id, frames dropped, source seeding state.
- Texts:
  - lobby.diag.title - "Diagnostics" / "Диагностика"
  - lobby.diag.rtt - "RTT" / "Задержка"
  - lobby.diag.drift - "Drift" / "Отставание"
  - lobby.diag.buffering - "Buffering" / "Буферизация"
  - lobby.diag.connection - "Connection" / "Соединение"

### Player window session strip (not lobby.route)
- Compact bar: room name, participant count, lag badge, host-lock indicator, "Sync time" and
  "Sync tracks" buttons, chat toggle, leave.
- Texts:
  - lobby.sync.time - "Sync time" / "Синхронизировать время"
  - lobby.sync.tracks - "Sync tracks" / "Синхронизировать дорожки"
  - lobby.sync.done - "Synchronized" / "Синхронизировано"

## 8. Security and capability budget (before merge)

New capabilities recorded here. The project security contract in `.docs/SECURITY.md` would
normally also be updated before merge; this plan keeps the single record in this file instead:
- iroh outbound/inbound QUIC (UDP) through the N0 preset: public relay and discovery services,
  plus peer-to-peer direct paths. This is external infrastructure and a privacy decision; it
  can be self-hosted later.
- Streamed file hashing (bounded, cancellable, off the UI thread).
- Torrent create/seed (already capability-reviewed under `librqbit`).

Mitigations: room token (128-bit) in the handshake with attempt bounding; protocol version
check; framed parser with a hard frame cap; bounded, sanitized display names and chat with link
escaping; never send full local paths to peers (filename + identity only); bounded roster and
message rate; heartbeat timeout marks a peer stale.

## 9. Transport decision and benchmark

Decision: iroh (N0) from v1 (D18). The benchmark below is the evidence behind the accepted
tradeoff; it was measured before the decision.

Measured on this machine (Windows, localhost, message = a realistic ~234-byte PlaybackState
JSON, 3000 round trips).

Round-trip latency:
- TCP + length-prefixed JSON: mean 0.075 ms, p50 0.068 ms, p99 0.146 ms, ~13400 rt/s.
- WebSocket (tokio-tungstenite): mean 0.052 ms, p50 0.047 ms, p99 0.100 ms, ~19400 rt/s.
- QUIC (quinn + rustls): mean 0.064 ms, p50 0.059 ms, p99 0.115 ms, ~15700 rt/s.

JSON codec: encode 200k messages in 77 ms (616 MB/s), decode 200k in 69 ms.

Cost (cold release build, unique crates, linked release binary):
- TCP + JSON: 24 crates, ~7 s, ~0.5 MB binary.
- + WebSocket: 60 crates, ~11 s.
- + QUIC (quinn/rustls/rcgen): 73 crates, ~16 s.
- iroh 1.3 (N0: QUIC + relays + discovery): 331 crates, ~86 s, ~13.3 MB binary.

Why iroh despite the cost: no port forwarding, hole punching with relay fallback, mDNS LAN
discovery, encrypted transport and key-based peer identity, all in one dependency. This is the
UX the user chose. Accepted costs: 331 crates, ~13.3 MB binary, a public relay/discovery
dependency and its capability/privacy entry. The message protocol stays transport-agnostic
behind the `Transport` trait, so if the relay dependency or churn becomes a problem the
transport can be replaced without touching the session core.

## 10. Dependencies

- Backend: `iroh` 1.3 (N0), `tokio`, `serde`, `serde_json`; new `sha2` for identity (the
  project already has `sha1`). Torrent sharing reuses `librqbit`. `iroh` pulls `quinn`/`rustls`
  transitively.
- Frontend: `boring-avatars` (React). Nothing else new.
- No benchmark needed for the sync hot path: messages are tiny and the codec runs at hundreds
  of MB/s.

## 11. Phased plan (file-level)

P0 Decisions: keep this file as the single lobby document. No `.docs/` changes and no code.

P1 Rust session core, no networking:
- `session/{mod,state,protocol,media,playlist,commands}.rs`; register `SessionHost` and
  commands in `lib.rs`; identity/hash commands.
- Tests: protocol roundtrip + version reject + frame cap, identity compare, ready gate.

P2 iroh transport + handshake + roster + heartbeat + clock sync:
- `session/{transport,host,client,sync}.rs`; loopback host/client over iroh; reconnect test.
- Tests: handshake accept/reject, roster diff, RTT/offset math, drift boundaries.

P3 Playback authority:
- Parameterize the player window label/instance or drive the single player from the session.
- Intercept guest controls; broadcast host/moderator commands; apply on guests.
- `session_force_resync`, `session_sync_tracks`; drift strip in the player overlay.
- Tests: expected-position, correction thresholds, reconnect resync.

P4 Lobby UI: route, components, session store, events hook, config, i18n (en/ru), tab flag,
settings, `boring-avatars`. Tests: store reducers, roster states, route states.

P5 Media + playlist: identity UI, playlist mapping, folder match via `file_index`, ready gate.

P6 Torrent sharing: reuse `create_torrent_from_folder` + `start_torrent_download`, clickable
chat links, per-episode selection, integrity verify on download.

P7 Deferred: multi-source chunks, voice chat, tolerant/keyframe matching, self-hosted iroh
relay. Each with a return condition.

## 12. Test matrix

- Rust unit: protocol encode/decode, version/frame-cap reject, clock/RTT/offset, drift at each
  boundary, identity compare, playlist mapping, ready gate transitions, handshake auth, roster
  add/remove/stale, revision ordering, frame decoder on random bytes (no panic).
- Rust integration: loopback iroh session, reconnect, hard resync, torrent share path.
- Frontend: session store reducers, lag formatting, lobby route states, control interception
  (guest seek becomes a request, host seek broadcasts), chat link rendering (magnet + deep link
  distinct and clickable), `boring-avatars` seed rules (UUID vs AniList nickname), i18n keys.

## 13. Remaining open items

Resolved (see 14): Q-avatar-fallback -> AniList image + boring fallback (14.5); Q-iroh-relay ->
public N0; Q-protocol-frames -> reliable stream; Q-timeout -> 6 s liveness / 30 s grace (plus
the 30 s guest-exit pause in 14.3).

- Q-avatar-fallback: for AniList users, use the AniList avatar image and fall back to
  boring-avatars seeded by the nickname (current interpretation), or always use the generated
  avatar. Minor; confirm during P4.
- Q-iroh-relay: accept the public N0 relay for v1, or plan a self-hosted relay from the start.
- Q-protocol-frames: whether heartbeats use a QUIC datagram channel or the reliable stream.
- Q-timeout: heartbeat timeout and reconnect window values (defaults in `config/lobby`).

## 14. v2 wave - decided scope (2026-10-04)

Q&A round outcome. "Now" = implement this wave; "Design" = document only.

### 14.0 Dispositions

- Rejected: P2P swarm / multi-source chunks, voice chat, self-hosted relay, keyframe matching,
  tolerant matching (replaced by the compatibility report, 14.1), Option B per-window
  `PlayerHost`.
- Design only (implement later): host migration (14.7).
- Now: compatibility report + per-user file assignment (14.1), playlist flow (14.2),
  restart/reconnect (14.3), chat download QoL + `.torrent` attach (14.4), AniList avatar
  (14.5), auto-verify on download completion (14.6), `player-2` harness cleanup (14.8).

### 14.1 Per-user file assignment + compatibility report (replaces tolerant matching)

- The host defines the playlist (cap 10 items). Each item carries the host identity: size,
  duration, SHA-256, video params.
- Each participant assigns their own local file per item. The assignment runs an automatic
  compatibility analysis: size, duration delta, SHA-256, video params (codec, resolution, fps,
  bitrate).
- Verdicts: `Exact` (SHA-256 equal) -> ready; `Compatible` (duration within tolerance and video
  params match) -> ready with a notice; `Risky` / `Incompatible` -> not ready, show the delta
  table (host vs guest) so the user sees the minimal difference.
- Only `Exact` + `Compatible` open the ready gate. The analysis runs automatically when a path
  is set, and is a pure function over two `MediaIdentity` values, reusable as a standalone
  "compare two files" tool.

### 14.2 Playlist flow (no auto-next)

- No "play next on end" behaviour. When a video ends the host (or a moderator) manually clicks
  the next item in the playlist to start it.
- The playlist shows, per item, which participants are missing the file.
- When the host starts an item some participant is missing, playback pauses for everyone and
  each missing participant gets a prompt (point at a file, or download). Everyone else sees
  "Waiting for <name>".
- Waiting is unbounded (no auto-start, no auto-kick); the missing-file state and any in-lobby
  download progress are shown in the participant list.
- Starters: host + moderators (D6 rights).

### 14.3 Restart / reconnect

- On app restart while in a lobby, the session and the user's identity (id, nickname, other
  session data) are restored.
- Lobby not started: reconnect and restore identity.
- Lobby started, video playing: playback pauses for everyone and the roster shows "<name> left
  the lobby". A 30 s liveness timeout distinguishes a real exit from a short lag/VPN blip.
- The host resumes playback manually. On reconnect after resume, the returning participant
  syncs to the host immediately.

### 14.4 Chat download QoL + `.torrent` attachment

- A magnet, an `iluhaanime://torrent/<hex>` link, or an attached `.torrent` in chat opens the
  torrent file-selection modal and starts the download. Convenience only; NOT bound to a
  playlist item (the participant still assigns their own file per item).
- `.torrent` attachments: host + moderators only, capped at the frame size.
- File selection at download time: the guest picks which files to download (existing torrent
  stack / librqbit file selection).

### 14.5 AniList avatar

- Linked participants: fetch the AniList avatar image, cache it in a new DB table keyed by
  AniList id, fall back to boring-avatars seeded by nickname when it is missing or fails to
  load.

### 14.6 Auto-verify on download completion

- When a host-torrent download finishes, automatically compute the identity and flip the item
  to verified (feeding the ready gate). On mismatch, warn and offer to re-download.

### 14.7 Host migration (design only)

- On host loss (heartbeat timeout) the room elects a new host automatically: moderators first,
  then participants in roster order. The room keeps the same room code / token; the new host
  re-hosts the endpoint and guests reconnect seamlessly.
- State that survives: roster + media plan + position/pause + chat. On host loss playback
  auto-pauses to wait for the absent host; the new host can also just (re)start playback.
- A returning original host rejoins as an ordinary guest.
- Requires session-state replication to election candidates; implementation is a separate wave.

### 14.8 `player-2` harness cleanup + wave order

- `player-2` is a debug-only harness window (`player/harness.rs`, `GUEST_WINDOW_LABEL`) that
  never receives `player-state` (emitted to `player` only), so its UI is stale, and it is never
  closed. Fix: destroy the window when the run ends (success or failure). Option B
  (per-window `PlayerHost`) is rejected.
- Wave order (dependency/risk first, checks after each step):
  1. `player-2` cleanup (isolated, debug-only).
  2. Compatibility report + per-item identity assignment (backend pure function + UI).
  3. Playlist flow (manual start, missing-file wait, progress).
  4. Auto-verify on download completion + per-episode selection.
  5. Chat download QoL + `.torrent` attachment.
  6. Restart/reconnect.
  7. AniList avatar DB cache.
  8. Host migration doc (already 14.7).
