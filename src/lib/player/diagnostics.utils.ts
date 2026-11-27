import { invokeValidated } from "@/lib/core/system/invoke.utils";
import { PlayerDiagnosticsSchema } from "@/schemas/player.schema";
import type { PlayerDiagnostics } from "@/types/player/diagnostics";

export function formatFps(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toFixed(1)} fps`;
}

export function formatCount(value: number | undefined): string {
  return value === undefined ? "-" : `${value}`;
}

export function formatCache(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toFixed(1)}s`;
}

export function getPlayerDiagnostics(): Promise<PlayerDiagnostics> {
  return invokeValidated<PlayerDiagnostics>("player_diagnostics", PlayerDiagnosticsSchema);
}

export function formatPreparationTime(value: number | null | undefined): string {
  return value == null ? "-" : value.toFixed(1);
}
