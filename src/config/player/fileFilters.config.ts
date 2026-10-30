/** File extensions treated as external subtitles when dropped or picked. */
export const SUBTITLE_FILTERS = ["srt", "ass", "ssa", "vtt", "sub", "idx"] as const;

/** File extensions treated as external audio tracks when dropped or picked. */
export const AUDIO_FILTERS = [
  "mka",
  "flac",
  "aac",
  "m4a",
  "ac3",
  "dts",
  "mp3",
  "wav",
  "ogg",
  "opus",
] as const;
