import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { FRANCHISE_VIEWPORT } from "@/config/anilist/graph.config";
import {
  cameraCenteredOn,
  cameraTransform,
  clampScale,
  panCameraBy,
  screenToWorld,
  zoomCameraAt,
} from "@/lib/anilist/camera.utils";
import type {
  CameraPoint,
  FranchiseCamera,
  FranchiseViewport,
  UseFranchiseViewportOptions,
} from "@/types/anilist";

const DEFAULT_OPTIONS = FRANCHISE_VIEWPORT;

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const initialCamera = (scale: number): FranchiseCamera => ({ scale, x: 0, y: 0 });

export function useFranchiseViewport(options: UseFranchiseViewportOptions = {}): FranchiseViewport {
  const { initialScale, maxScale, minScale, wheelStep } = { ...DEFAULT_OPTIONS, ...options };
  const [camera, setCamera] = useState<FranchiseCamera>(() => initialCamera(initialScale));
  const cameraRef = useRef(camera);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{ clientX: number; clientY: number; camera: FranchiseCamera } | null>(
    null
  );
  const animationRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingCameraRef = useRef<FranchiseCamera | null>(null);
  const wheelCleanupRef = useRef<(() => void) | null>(null);

  const cancelAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const applyCamera = useCallback(
    (next: FranchiseCamera) => {
      cancelAnimation();
      cameraRef.current = next;
      setCamera(next);
    },
    [cancelAnimation]
  );
  useEffect(() => cancelAnimation, [cancelAnimation]);

  const scheduleCamera = useCallback(
    (next: FranchiseCamera) => {
      pendingCameraRef.current = next;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const pending = pendingCameraRef.current;
        pendingCameraRef.current = null;
        if (pending) applyCamera(pending);
      });
    },
    [applyCamera]
  );

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      wheelCleanupRef.current?.();
    },
    []
  );

  const animateTo = useCallback(
    (target: FranchiseCamera, durationMs: number) => {
      cancelAnimation();
      const from = cameraRef.current;
      if (
        durationMs <= 0 ||
        (from.x === target.x && from.y === target.y && from.scale === target.scale)
      ) {
        applyCamera(target);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = easeInOutCubic(t);
        const next: FranchiseCamera = {
          scale: from.scale + (target.scale - from.scale) * eased,
          x: from.x + (target.x - from.x) * eased,
          y: from.y + (target.y - from.y) * eased,
        };
        cameraRef.current = next;
        setCamera(next);
        if (t < 1) {
          animationRef.current = requestAnimationFrame(step);
        } else {
          animationRef.current = null;
        }
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [applyCamera, cancelAnimation]
  );

  const getScale = useCallback(() => cameraRef.current.scale, []);

  const zoomToElement = useCallback(
    (elementId: string, targetScale: number, animationDurationMs = 300) => {
      const wrapper = wrapperRef.current;
      const element = document.querySelector(`#${elementId}`);
      if (!wrapper || !element) return;
      const wrapperRect = wrapper.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const center: CameraPoint = {
        x: elementRect.left - wrapperRect.left + elementRect.width / 2,
        y: elementRect.top - wrapperRect.top + elementRect.height / 2,
      };
      const world = screenToWorld(center, cameraTransform(cameraRef.current));
      const target = cameraCenteredOn(
        world,
        { height: wrapperRect.height, width: wrapperRect.width },
        clampScale(targetScale, minScale, maxScale)
      );
      animateTo(target, animationDurationMs);
    },
    [animateTo, maxScale, minScale]
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      event.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const pointer: CameraPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? 1 + wheelStep : 1 / (1 + wheelStep);
      scheduleCamera(zoomCameraAt(cameraRef.current, pointer, factor, minScale, maxScale));
    },
    [scheduleCamera, maxScale, minScale, wheelStep]
  );


  const handleMouseDown = useCallback((event: ReactMouseEvent) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    panStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      camera: cameraRef.current,
    };
  }, []);

  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    if (!isPanning) return;
    const handleMouseMove = (event: MouseEvent) => {
      const start = panStartRef.current;
      if (!start) return;
      scheduleCamera(
        panCameraBy(start.camera, event.clientX - start.clientX, event.clientY - start.clientY)
      );
    };
    const handleMouseUp = () => {
      panStartRef.current = null;
      setIsPanning(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [scheduleCamera, isPanning]);

  const wrapperProps = {
    onMouseDown: (event: ReactMouseEvent) => {
      handleMouseDown(event);
      setIsPanning(true);
    },
    ref: (node: HTMLDivElement | null) => {
      wheelCleanupRef.current?.();
      wheelCleanupRef.current = null;
      wrapperRef.current = node;
      if (node) {
        node.addEventListener("wheel", handleWheel, { passive: false });
        wheelCleanupRef.current = () => node.removeEventListener("wheel", handleWheel);
      }
    },
  };

  return {
    getScale,
    transformStyle: {
      transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
      transformOrigin: "0 0",
    },
    wrapperProps,
    zoomToElement,
  };
}
