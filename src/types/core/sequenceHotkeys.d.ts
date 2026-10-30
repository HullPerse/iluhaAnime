export interface SequenceDef {
  codes: readonly string[];
  timeoutMs: number;
}

export interface SequenceOptions {
  sequence: SequenceDef;
  ignore?: (event: KeyboardEvent) => boolean;
  onMatch: () => void;
}
