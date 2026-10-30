export interface DbScreenProps {
  error: string;
  themeName: string;
  safe?: boolean;
  dataDir: string;
  onRetry: () => void;
  onReload: () => void;
  onOpenFolder: () => void;
}
