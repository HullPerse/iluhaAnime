export interface CropResizeOptions {
  minSize?: number;
  ratio?: number | null;
  snapThreshold?: number;
}

export interface CropStartOptions {
  snapThreshold?: number;
  square?: boolean;
}
