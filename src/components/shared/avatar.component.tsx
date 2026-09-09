import { cn } from "cn";
import { useEffect, useState } from "react";
import type { MouseEventHandler } from "react";

import { assetUrl, userImageId } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { UserImageFile } from "@/types";

interface UserImageIconProps {
  icon: string;
  alt?: string;
  className?: string;
  fallback?: string;
  url?: string;
  onClick?: MouseEventHandler<HTMLImageElement>;
}

export default function UserImageIcon({
  icon,
  alt = "",
  className,
  fallback = "/images/user_avatar.ico",
  url,
  onClick,
}: UserImageIconProps) {
  const id = userImageId(icon);
  const inlineDataUrl = icon.startsWith("data:image/") ? icon : undefined;
  const [src, setSrc] = useState(url ?? inlineDataUrl ?? "");

  useEffect(() => {
    let active = true;
    if (!id) {
      setSrc(url ?? inlineDataUrl ?? "");
      return () => {
        active = false;
      };
    }
    if (url) {
      setSrc(url);
      return () => {
        active = false;
      };
    }
    invokeTyped<UserImageFile>("get_user_image", { id })
      .then((image) => {
        if (active) setSrc(assetUrl(image.path));
      })
      .catch(() => {
        if (active) setSrc("");
      });
    return () => {
      active = false;
    };
  }, [url, id, inlineDataUrl]);

  if (!id && !inlineDataUrl && !icon.includes(".")) {
    return (
      <span className={cn("inline-flex items-center justify-center", className)} aria-label={alt}>
        {icon}
      </span>
    );
  }

  return (
    <img
      src={id && src ? src : id || inlineDataUrl ? src || fallback : `/images/${icon}`}
      alt={alt}
      className={cn("object-contain", className)}
      loading="lazy"
      onClick={onClick}
      onError={(event) => {
        if (event.currentTarget.src.endsWith(fallback)) return;
        event.currentTarget.src = fallback;
      }}
    />
  );
}
