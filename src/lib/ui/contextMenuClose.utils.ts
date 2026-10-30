const menuClosers = new Set<() => void>();

export const registerContextMenuCloser = (close: () => void): (() => void) => {
  menuClosers.add(close);
  return () => {
    menuClosers.delete(close);
  };
};

export const closeOpenContextMenus = (): void => {
  for (const close of menuClosers) close();
};
