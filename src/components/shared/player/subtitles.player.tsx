import { useEffect, useRef } from "react"

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
  src,
  videoEl,
  visible,
  delay,
}: {
  src: string
  videoEl: HTMLVideoElement | null
  visible: boolean
  delay: number
}) {
  const instRef = useRef<any>(null)
  const contentRef = useRef("")

  useEffect(() => {
    return () => {
      instRef.current?.destroy()
      instRef.current = null
    }
  }, [src, videoEl])

  useEffect(() => {
    if (!videoEl || !src) return

    let cancelled = false

    ;(async () => {
      try {
        const resp = await fetch(src)
        const text = await resp.text()
        if (cancelled) return

        contentRef.current = text

        instRef.current?.destroy()
        instRef.current = null

        const { AkariSub, workerUrl, wasmUrl } = await ensure()

        const instance = new AkariSub({
          video: videoEl,
          subContent: text,
          workerUrl,
          wasmUrl,
          offscreenRender: true,
          onDemandRender: true,
          fullTrackWarmup: true,
          timeOffset: delay,
        })

        await instance.ready
        if (cancelled) { instance.destroy(); return }

        instRef.current = instance
        if (!visible) instance.freeTrack()
      } catch {
        /* fail silently */
      }
    })()

    return () => { cancelled = true }
  }, [src, videoEl])

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
