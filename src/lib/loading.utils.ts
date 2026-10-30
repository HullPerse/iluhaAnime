export const LOADING_TIMEOUT_MS = 5000;

export function shouldShowEmptyPlayer(
  hasFile: boolean,
  loadingFile: boolean,
  failed: boolean,
  hasShownFrame: boolean
): boolean {
  return !failed && (!hasFile || (loadingFile && !hasShownFrame));
}

export function shouldShowLoadingSpinner(
  hasFile: boolean,
  loadingFile: boolean,
  failed: boolean,
  hasShownFrame: boolean
): boolean {
  return !failed && hasFile && loadingFile && hasShownFrame;
}
