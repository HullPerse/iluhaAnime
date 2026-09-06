import type { CameraPoint, CameraTransform, FranchiseCamera } from "@/types/anilist";

export const clampScale = (scale: number, minScale: number, maxScale: number): number =>
  Math.max(minScale, Math.min(maxScale, scale));

export const cameraTransform = (camera: FranchiseCamera): CameraTransform => ({
  scale: camera.scale,
  x: camera.x,
  y: camera.y,
});

export const worldToScreen = (point: CameraPoint, transform: CameraTransform): CameraPoint => ({
  x: point.x * transform.scale + transform.x,
  y: point.y * transform.scale + transform.y,
});

export const screenToWorld = (point: CameraPoint, transform: CameraTransform): CameraPoint => ({
  x: (point.x - transform.x) / transform.scale,
  y: (point.y - transform.y) / transform.scale,
});

export const zoomCameraAt = (
  camera: FranchiseCamera,
  pointer: CameraPoint,
  factor: number,
  minScale: number,
  maxScale: number
): FranchiseCamera => {
  const scale = clampScale(camera.scale * factor, minScale, maxScale);
  if (scale === camera.scale) return camera;
  const world = screenToWorld(pointer, cameraTransform(camera));
  return {
    scale,
    x: pointer.x - world.x * scale,
    y: pointer.y - world.y * scale,
  };
};

export const panCameraBy = (camera: FranchiseCamera, dx: number, dy: number): FranchiseCamera => ({
  ...camera,
  x: camera.x + dx,
  y: camera.y + dy,
});

export const cameraCenteredOn = (
  world: CameraPoint,
  viewport: { width: number; height: number },
  scale: number
): FranchiseCamera => ({
  scale,
  x: viewport.width / 2 - world.x * scale,
  y: viewport.height / 2 - world.y * scale,
});
