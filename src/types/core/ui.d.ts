import type { CSSProperties, ComponentProps, ImgHTMLAttributes, ReactNode } from "react";

interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly (SelectOption<NoInfer<T>> & { style?: CSSProperties })[];
  className?: string;
  placeholder?: string;
  arrow?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  indexed?: boolean;
  label?: string;
}

export type ComboboxProps<T extends string = string> = Omit<SelectProps<T>, "searchable">;

export interface PasswordInputProps extends Omit<ComponentProps<"input">, "type"> {
  wrapperClassName?: string;
}

export interface ImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  type?: "cover" | "contain";
}

export interface ModalPager {
  index: number;
  total: number;
  label?: string;
  onPrevious: () => void;
  onNext: () => void;
}

export interface ModalWindow {
  header: string;
  onClose: () => void;
  canClose?: () => boolean;
  onBack?: () => void;
  headerActions?: ReactNode;
  pager?: ModalPager;
  className?: string;
  contentClassName?: string;
  hideHeader?: boolean;
  hideBackdrop?: boolean;
  modal?: boolean;
  trackOverlay?: boolean;
  children?: ReactNode;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
  onClose?: () => void;
}

export interface InputDialogProps {
  header: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

interface SelectDialogOption {
  value: string;
  label: string;
}

export interface SelectDialogProps {
  header: string;
  label: string;
  options: SelectDialogOption[];
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  onResetCache?: () => void;
  onReloadPage?: () => void;
}

export interface ErrorBoundaryState {
  error: Error | null;
}
