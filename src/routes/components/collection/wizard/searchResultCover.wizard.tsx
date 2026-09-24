import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import { useRemoteImageStatus, toSizedThumbUrl } from "@/hooks/remoteImage.hook";

export function SearchResultCover({ url, title }: { url: string; title: string }) {
  const { src, failed: fetchFailed } = useRemoteImageStatus(url ? toSizedThumbUrl(url) : null);
  const [loaded, setLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const prevUrlRef = useRef(url);
  useEffect(() => {
    if (prevUrlRef.current !== url) {
      prevUrlRef.current = url;
      setLoaded(false);
      setImgFailed(false);
    }
  }, [url]);
  if (!url || fetchFailed || imgFailed) {
    return (
      <span
        aria-hidden="true"
        className="windows95-border bg-primary text-hint flex h-12 w-9 shrink-0 items-center justify-center text-sm font-bold"
      >
        {(title.trim().charAt(0) || "-").toUpperCase()}
      </span>
    );
  }
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className="windows95-border bg-primary h-12 w-9 shrink-0 animate-pulse"
      />
    );
  }
  return (
    <span className="windows95-border relative h-12 w-9 shrink-0 overflow-hidden bg-black/10">
      {!loaded && <span aria-hidden="true" className="bg-primary absolute inset-0 animate-pulse" />}
      <img
        src={src}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setImgFailed(true)}
        className={cn("h-full w-full object-cover", !loaded && "opacity-0")}
      />
    </span>
  );
}
