export interface VideoStreamInfo {
  index: number;
  codec_type: string;
  codec_name: string;
  language: string | null;
  title: string | null;
  is_default: boolean;
  file_path?: string | null;
}

export type VideoType = {
  path: string;
  file: string;
  initialTime?: number;
  remuxSrc?: string;
} | null;

export type ChapterType = {
  start_time: number;
  end_time: number;
  title: string;
};

export type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";
export type ScanType = {
  current: number;
  total: number;
} | null;
