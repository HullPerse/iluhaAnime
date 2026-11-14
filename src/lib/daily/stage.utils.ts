/** The furthest visual stage the audio mode has unlocked. */
export function audioStage(attempts: number, maxAttempts: number): number {
  return Math.min(attempts, Math.max(maxAttempts - 1, 0));
}

/** A reached stage can be reopened, but a later one cannot be skipped to. */
export function shownAudioStage(stage: number, selected: number | null): number {
  return selected === null ? stage : Math.min(selected, stage);
}

export function canOpenAudioStage(slot: number, stage: number): boolean {
  return slot <= stage;
}
