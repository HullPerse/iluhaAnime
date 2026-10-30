export type MigrationState = Record<string, unknown>;

export interface MigrationTransform {
  from?: number;
  migrate: (state: MigrationState) => void;
}
