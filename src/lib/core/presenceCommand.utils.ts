import { attempt, reportBackgroundError } from "@/lib/core/attempt.utils";

export function reportPresenceCommand(command: Promise<void>, scope: string): void {
  attempt(command)
    .then(([, error]) => {
      if (error) reportBackgroundError(scope, error);
      return null;
    })
    .catch((error: unknown) => reportBackgroundError("srclibcorepresenceCommand", error));
}
