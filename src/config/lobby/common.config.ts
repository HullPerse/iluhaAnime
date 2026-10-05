/** Watch Party lobby constants (lobby.md §13). */

/** How often the lobby tab polls `session_status` while a session is active. */
export const LOBBY_STATUS_POLL_MS = 1000;

/** Cap on a single outgoing chat line, in graphemes. */
export const LOBBY_CHAT_MAX_GRAPHEMES = 2000;

/**
 * Cap on a `.torrent` attached to a chat line, in raw bytes. Mirrors the
 * backend `CHAT_ATTACHMENT_MAX_BYTES` (protocol.rs) so the frame fits.
 */
export const LOBBY_CHAT_ATTACHMENT_MAX_BYTES = 180 * 1024;

/** Max image previews embedded under one chat message (Discord-like cap). */
export const LOBBY_CHAT_IMAGE_MAX = 3;

/** Cap on a pasted ticket, generous enough for the encoded share string. */
export const LOBBY_TICKET_INPUT_MAX_CHARS = 4096;

/** Share-string scheme for a session ticket. */
export const LOBBY_TICKET_PREFIX = "iluhaanime://lobby/";

/** Oldest chat lines are dropped from the tail we render. */
export const LOBBY_MAX_RENDERED_CHAT = 200;

/** Display name length cap. */
export const LOBBY_MAX_DISPLAY_NAME_CHARS = 48;

/**
 * Tolerance (seconds) for a "compatible" duration match when hashes differ.
 */
export const LOBBY_DURATION_TOLERANCE_SEC = 1.0;

/* ------------------------------------------------------------------ *
 * Player ↔ session bridge (P3). Event names mirror the backend
 * `session::commands` constants.
 * ------------------------------------------------------------------ */

/** The host's authoritative playback snapshot. */
export const SESSION_PLAYBACK_EVENT = "session-playback";

/** A control action the local player must apply. */
export const SESSION_COMMAND_EVENT = "session-command";

/** The room's track selection changed. */
export const SESSION_TRACK_EVENT = "session-track";

/** The participant roster changed. */
export const SESSION_ROSTER_EVENT = "session-roster";

/** The room started a plan item (host opens the local file). */
export const SESSION_START_EVENT = "session-start-item";

/** The room's held start changed (missing peers / cleared). */
export const SESSION_WAITING_EVENT = "session-waiting";

/** The outgoing host chose this guest to take the room over. */
export const SESSION_HANDOVER_EVENT = "session-host-handover";

/** The room moved to a new host (payload: its peer id). */
export const SESSION_MIGRATE_EVENT = "session-migrate";

/** A peer started or stopped typing (payload `{ peerId, active }`). */
export const SESSION_TYPING_EVENT = "session-typing";

/** Keep-alive cadence (ms) for `typing(true)` while the draft keeps growing. */
export const TYPING_KEEPALIVE_MS = 2000;

/**
 * How long (ms) a receiver shows a peer as typing after its last frame.
 * Comfortably past two keep-alives, so one dropped frame never flickers.
 */
export const TYPING_TTL_MS = 5000;

/** Host publish cadence while playing (ms). */
export const SESSION_PUBLISH_INTERVAL_MS = 250;

/** Guest sync evaluation cadence (ms). */
export const SESSION_SYNC_INTERVAL_MS = 250;

/** Guest offset (ms) is clamped to this magnitude. */
export const SESSION_OFFSET_LIMIT_MS = 60_000;
