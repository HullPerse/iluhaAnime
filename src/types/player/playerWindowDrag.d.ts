export interface WindowDragHandlers {
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseMove: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseUp: () => void;
  consumeDrag: () => boolean;
}
