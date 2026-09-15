import type { CSSProperties, ComponentProps, ImgHTMLAttributes, ReactNode } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly (SelectOption & { style?: CSSProperties })[];
  className?: string;
  placeholder?: string;
  arrow?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  indexed?: boolean;
  label?: string;
}

export type ComboboxProps = Omit<SelectProps, "searchable">;

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

export interface ModalWindow {
  header: string;
  onClose: () => void;
  onBack?: () => void;
  headerActions?: ReactNode;
  className?: string;
  contentClassName?: string;
  hideHeader?: boolean;
  hideBackdrop?: boolean;
  modal?: boolean;
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

export interface SelectDialogOption {
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
}

export interface ErrorBoundaryState {
  error: Error | null;
}
