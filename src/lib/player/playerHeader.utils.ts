import { reportBackgroundError } from "@/lib/core/attempt.utils";

export function startsOnControl(target: EventTarget | null) {
  return target instanceof Element && target.closest("button, [data-no-drag]") !== null;
}

export function runPlayerHeaderAction(action: Promise<unknown>, scope: string) {
  action.catch((error) => reportBackgroundError(scope, error));
}
