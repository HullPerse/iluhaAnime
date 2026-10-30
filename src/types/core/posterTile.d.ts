import type { ReactNode } from "react";

export type PosterTilePreview = ReactNode | ((close: () => void) => ReactNode);
