import { cn } from "cn";
import { useEffect, useState } from "react";

import { systemApi } from "@/api/system.api";
import { attempt } from "@/lib/utils/attempt.utils";
import { assetUrl, userImageId } from "@/lib/utils/image.utils";
import type { UserImageIconProps } from "@/types/userimage";

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
    (async () => {
      const [image, error] = await attempt(systemApi.getUserImage(id));
      if (!active) return;
      if (error) setSrc("");
      else setSrc(assetUrl(image.path));
    })();
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
