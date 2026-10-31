import type { SplashStage } from "@/types/core/splash";

export const SPLASH_STAGE_MARKS: Record<SplashStage["status"], string> = {
  active: "[ ] ",
  degraded: "[!] ",
  done: "[x] ",
  pending: "[ ] ",
};

export const SPLASH_STAGE_SUFFIXES: Record<SplashStage["status"], string> = {
  active: "",
  degraded: " Failed",
  done: " Done",
  pending: "",
};
