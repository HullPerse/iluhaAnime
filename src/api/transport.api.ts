import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { CommandName } from "@/types/ipc";

export interface ApiTransport {
  call: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

export const tauriTransport: ApiTransport = {
  call: <T>(command: string, args?: Record<string, unknown>) =>
    invokeTyped<T>(command as CommandName, args),
};
