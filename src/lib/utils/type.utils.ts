import type { AssertNever } from "@/types/types";

/**
 * Throw error for never type in exhaustive switch statements.
 * Use in a final catch-all case to guarantee exhaustiveness at both type and runtime in dev.
 */
export function assertNever(value: AssertNever): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
