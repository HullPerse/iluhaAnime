import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { MouseEventHandler } from "react";

import { cn } from "@/lib/index.utils";
import { userImageId } from "@/lib/userimage.utils";
import type { UserImage } from "@/types";

interface UserImageIconProps {
  icon: string;
  alt?: string;
  className?: string;
  fallback?: string;
  dataUrl?: string;
  onClick?: MouseEventHandler<HTMLImageElement>;
}

export default function UserImageIcon({
  icon,
  alt = "",
  className,
  fallback = "/images/user_avatar.ico",
  dataUrl,
  onClick,
}: UserImageIconProps) {
  const id = userImageId(icon);
  const inlineDataUrl = icon.startsWith("data:image/") ? icon : undefined;
  const [src, setSrc] = useState(dataUrl ?? inlineDataUrl ?? "");

  useEffect(() => {
    let active = true;
    if (!id) {
      setSrc(dataUrl ?? inlineDataUrl ?? "");
      return () => {
        active = false;
      };
    }
    if (dataUrl) {
      setSrc(dataUrl);
      return () => {
        active = false;
      };
    }
    invoke<UserImage>("get_user_image", { id })
      .then((image) => {
        if (active) setSrc(image.dataUrl);
      })
      .catch(() => {
        if (active) setSrc("");
      });
    return () => {
      active = false;
    };
  }, [dataUrl, id, inlineDataUrl]);

  if (!id && !inlineDataUrl && !icon.includes(".")) {
    return (
      <span
        className={cn("inline-flex items-center justify-center", className)}
        aria-label={alt}
      >
        {icon}
      </span>
    );
  }

  return (
    <img
      src={
        id && src
          ? src
          : id || inlineDataUrl
            ? src || fallback
            : `/images/${icon}`
      }
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
