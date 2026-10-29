import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";

/**
 * Fire-and-forget presence command. A missing Discord client is handled in
 * Rust, so a failed command is logged in the background instead of becoming a
 * toast.
 */
export function reportPresenceCommand(command: Promise<void>, scope: string): void {
  attempt(command)
    .then(([, error]) => {
      if (error) reportBackgroundError(scope, error);
      return null;
    })
    .catch(() => undefined);
}
