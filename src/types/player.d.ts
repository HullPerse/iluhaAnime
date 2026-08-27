export interface VideoStreamInfo {
  index: number;
  codec_type: string;
  codec_name: string;
  language: string | null;
  title: string | null;
  is_default: boolean;
  is_forced: boolean;
  is_comment: boolean;
  bit_rate?: number | null;
  channels?: number | null;
  sample_rate?: number | null;
  width?: number | null;
  height?: number | null;
  file_path?: string | null;
}
