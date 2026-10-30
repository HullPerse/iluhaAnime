import type { AssertNever } from "@/types/core/types";

export function assertNever(value: AssertNever): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
