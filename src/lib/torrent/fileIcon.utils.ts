const VIDEO_EXTS = new Set([
  "avi",
  "flv",
  "m2ts",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ts",
  "vob",
  "webm",
  "wmv",
]);

const AUDIO_EXTS = new Set([
  "aac",
  "ac3",
  "aiff",
  "ape",
  "dts",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "wma",
]);

const SUBTITLE_EXTS = new Set(["ass", "idx", "smi", "srt", "ssa", "sub", "sup", "vtt"]);

const ARCHIVE_EXTS = new Set(["7z", "bz2", "gz", "rar", "tar", "zip"]);

const FONT_EXTS = new Set(["fon", "otf", "ttf", "woff", "woff2"]);

const IMAGE_EXTS = new Set(["bmp", "gif", "jpeg", "jpg", "png", "webp"]);

const TEXT_EXTS = new Set(["cue", "log", "m3u", "m3u8", "md", "nfo", "sfv", "txt"]);

export function torrentFileIcon(fileName: string): string {
  const ext = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  if (VIDEO_EXTS.has(ext)) return "w2k_wmp_11.ico";
  if (AUDIO_EXTS.has(ext)) return "w2k_3.ico";
  if (SUBTITLE_EXTS.has(ext)) return "w98_message_file.ico";
  if (ARCHIVE_EXTS.has(ext)) return "w2k_zip_file.ico";
  if (FONT_EXTS.has(ext)) return "w2k_fonts.ico";
  if (IMAGE_EXTS.has(ext)) return "w2k_jpeg_image.ico";
  if (TEXT_EXTS.has(ext)) return "w2k_notepad_1.ico";
  return "w2k_multiple_files.ico";
}
