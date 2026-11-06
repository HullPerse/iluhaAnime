import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";

export function reportPresenceCommand(command: Promise<void>, scope: string): void {
  attempt(command)
    .then(([, error]) => {
      if (error) reportBackgroundError(scope, error);
      return null;
    })
    .catch((error: unknown) => reportBackgroundError("srclibcorepresenceCommand", error));
}
