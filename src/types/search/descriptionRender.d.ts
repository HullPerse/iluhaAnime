export interface DescriptionRenderContext {
  openImageLabel: string;
  openSpoilers: ReadonlySet<number>;
  handleToggleSpoiler: (index: number) => void;
  onZoom: (url: string) => void;
}
