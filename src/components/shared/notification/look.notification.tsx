import type { ReactNode } from "react";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import type { NotificationType } from "@/types/notification";

export const typeColors: Record<NotificationType, string> = {
  error: "text-red-600",
  info: "text-blue-600",
  success: "text-green-600",
  warning: "text-orange-500",
};

export const typeIcons: Record<NotificationType, ReactNode> = {
  error: <XCircle className="size-2.5" />,
  info: <Info className="size-2.5" />,
  success: <CheckCircle2 className="size-2.5" />,
  warning: <AlertTriangle className="size-2.5" />,
};
