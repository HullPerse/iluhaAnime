import { useEffect, useRef } from "react";
import { toAssetUrl } from "@/lib/player.utils";
import { showToast } from "@/lib/toast.utils";

if (import.meta.hot) {
  import.meta.hot.dispose(() => { cached = null })
}

let cached: {
  AkariSub: new (opts: any) => any
  workerUrl: string
  wasmUrl: string
} | null = null

async function ensure() {
  if (cached) return cached
  const [mod, wUrl, waUrl] = await Promise.all([
    import("akarisub"),
    import("akarisub/worker?url").then((m) => m.default) as Promise<string>,
    import("akarisub/worker.wasm?url").then((m) => m.default) as Promise<string>,
  ])
  cached = { AkariSub: mod.default, workerUrl: wUrl, wasmUrl: waUrl }
  return cached!
}

function AssOverlay({
  content,
  videoEl,
  visible,
  delay,
  fonts,
}: {
  content: string
  videoEl: HTMLVideoElement | null
  visible: boolean
  delay: number
  fonts: string[]
}) {
  const instRef = useRef<any>(null)
  const contentRef = useRef("")

  useEffect(() => {
    return () => {
      instRef.current?.destroy()
      instRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!videoEl) return

    if (!content) {
      contentRef.current = ""
      instRef.current?.destroy()
      instRef.current = null
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        if (cancelled) return
        contentRef.current = content

        const { AkariSub, workerUrl, wasmUrl } = await ensure()

        const instance = new AkariSub({
          video: videoEl,
          subContent: content,
          workerUrl,
          wasmUrl,
          offscreenRender: true,
          onDemandRender: true,
          fullTrackWarmup: true,
          timeOffset: delay,
          prescaleFactor: window.devicePixelRatio,
          fonts: fonts.length > 0 ? fonts.map((f) => toAssetUrl(f)) : undefined,
        })

        await instance.ready
        if (cancelled) { instance.destroy(); return }

        const old = instRef.current
        instRef.current = instance
        old?.destroy()
        if (!visible) instance.freeTrack()
      } catch {
        showToast("Не удалось загрузить ASS субтитры", "error");
      }
    })()

    return () => { cancelled = true }
  }, [content, videoEl, fonts])

  useEffect(() => {
    const r = instRef.current
    if (!r) return
    if (visible) r.setTrack(contentRef.current)
    else r.freeTrack()
  }, [visible])

  useEffect(() => {
    const r = instRef.current
    if (!r) return
    r.timeOffset = delay
  }, [delay])

  return null
}

export default AssOverlay
