import type { AssertNever } from "@/types/types";

export function assertNever(value: AssertNever): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
