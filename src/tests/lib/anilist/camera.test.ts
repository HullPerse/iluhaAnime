import { describe, expect, it } from "vitest";

import {
  cameraCenteredOn,
  cameraTransform,
  clampScale,
  panCameraBy,
  screenToWorld,
  worldToScreen,
  zoomCameraAt,
} from "@/lib/anilist/camera.utils";

describe("cameraTransform / worldToScreen / screenToWorld", () => {
  it("converts world points to screen with scale and offset", () => {
    const transform = cameraTransform({ scale: 2, x: 10, y: -5 });
    expect(worldToScreen({ x: 3, y: 4 }, transform)).toEqual({ x: 16, y: 3 });
  });

  it("round-trips world <-> screen", () => {
    const transform = cameraTransform({ scale: 1.5, x: 42, y: -17 });
    const point = { x: 100, y: 200 };
    expect(screenToWorld(worldToScreen(point, transform), transform)).toEqual(point);
  });
});

describe("clampScale", () => {
  it("clamps within the given bounds", () => {
    expect(clampScale(0.05, 0.1, 5)).toBe(0.1);
    expect(clampScale(2, 0.1, 5)).toBe(2);
    expect(clampScale(10, 0.1, 5)).toBe(5);
  });
});

describe("zoomCameraAt", () => {
  it("keeps the world point under the pointer fixed while zooming in", () => {
    const camera = { scale: 1, x: 0, y: 0 };
    const pointer = { x: 200, y: 150 };
    const next = zoomCameraAt(camera, pointer, 1.5, 0.1, 5);
    expect(next.scale).toBe(1.5);
    const worldBefore = screenToWorld(pointer, cameraTransform(camera));
    const worldAfter = screenToWorld(pointer, cameraTransform(next));
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it("keeps the world point fixed while zooming out", () => {
    const camera = { scale: 2, x: 50, y: 50 };
    const pointer = { x: 300, y: 100 };
    const next = zoomCameraAt(camera, pointer, 0.5, 0.1, 5);
    expect(next.scale).toBe(1);
    const worldBefore = screenToWorld(pointer, cameraTransform(camera));
    const worldAfter = screenToWorld(pointer, cameraTransform(next));
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it("clamps to min and max scale", () => {
    const zoomIn = zoomCameraAt({ scale: 4.9, x: 0, y: 0 }, { x: 10, y: 10 }, 2, 0.1, 5);
    expect(zoomIn.scale).toBe(5);
    const zoomOut = zoomCameraAt({ scale: 0.15, x: 0, y: 0 }, { x: 10, y: 10 }, 0.5, 0.1, 5);
    expect(zoomOut.scale).toBe(0.1);
  });

  it("returns the same camera when the scale would not change", () => {
    const camera = { scale: 5, x: 3, y: 4 };
    expect(zoomCameraAt(camera, { x: 1, y: 1 }, 2, 0.1, 5)).toBe(camera);
  });
});

describe("panCameraBy", () => {
  it("translates the camera by the given delta", () => {
    expect(panCameraBy({ scale: 1, x: 10, y: 20 }, 5, -3)).toEqual({ scale: 1, x: 15, y: 17 });
  });
});

describe("cameraCenteredOn", () => {
  it("centers the world point at the viewport center", () => {
    const camera = cameraCenteredOn({ x: 400, y: 300 }, { width: 800, height: 600 }, 1.5);
    expect(camera.scale).toBe(1.5);
    expect(camera.x).toBe(400 - 400 * 1.5);
    expect(camera.y).toBe(300 - 300 * 1.5);
    const worldCenter = screenToWorld({ x: 400, y: 300 }, cameraTransform(camera));
    expect(worldCenter.x).toBeCloseTo(400, 6);
    expect(worldCenter.y).toBeCloseTo(300, 6);
  });
});
