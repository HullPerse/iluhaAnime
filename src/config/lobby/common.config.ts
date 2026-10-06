export const LOBBY_STATUS_POLL_MS = 1000;

export const LOBBY_CHAT_MAX_GRAPHEMES = 2000;

/** Mirrors backend CHAT_ATTACHMENT_MAX_BYTES so the frame fits. */
export const LOBBY_CHAT_ATTACHMENT_MAX_BYTES = 180 * 1024;

export const LOBBY_CHAT_IMAGE_MAX = 3;

export const LOBBY_TICKET_INPUT_MAX_CHARS = 4096;

export const LOBBY_TICKET_PREFIX = "iluhaanime://lobby/";

export const LOBBY_MAX_RENDERED_CHAT = 200;

export const LOBBY_MAX_DISPLAY_NAME_CHARS = 48;

/** Re-probe cadence while the address book is open. */
export const LOBBY_PROBE_INTERVAL_MS = 30_000;

export const LOBBY_PING_BAR_COUNT = 5;

/** Ascending RTT thresholds for 5/4/3/2 bars; slower keeps one. */
export const LOBBY_PING_BAR_THRESHOLDS_MS = [30, 60, 120, 250] as const;

/** Duration-match tolerance when hashes differ. */
export const LOBBY_DURATION_TOLERANCE_SEC = 1.0;

export const SESSION_PLAYBACK_EVENT = "session-playback";

export const SESSION_COMMAND_EVENT = "session-command";

export const SESSION_TRACK_EVENT = "session-track";

export const SESSION_ROSTER_EVENT = "session-roster";

export const SESSION_START_EVENT = "session-start-item";

export const SESSION_WAITING_EVENT = "session-waiting";

export const SESSION_HANDOVER_EVENT = "session-host-handover";

export const SESSION_MIGRATE_EVENT = "session-migrate";

export const SESSION_TYPING_EVENT = "session-typing";

export const SESSION_PIN_EVENT = "session-pin";

export const SESSION_REACT_EVENT = "session-react";

export const TYPING_KEEPALIVE_MS = 2000;

/** Past two keep-alives, so one dropped frame never flickers. */
export const TYPING_TTL_MS = 5000;

export const SESSION_PUBLISH_INTERVAL_MS = 250;

export const SESSION_SYNC_INTERVAL_MS = 250;

export const SESSION_OFFSET_LIMIT_MS = 60_000;
