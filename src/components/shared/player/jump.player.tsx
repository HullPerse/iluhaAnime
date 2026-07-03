import { Button } from "@/components/ui/button.component"
import { parseTime } from "@/lib/player.utils"
import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"



function JumpToTime({
  seek,
  onClose,
}: {
  seek?: (t: number) => void
  onClose: () => void
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const time = parseTime(value)
    if (time !== null && !isNaN(time) && time >= 0) {
      seek?.(time)
      onClose()
    } else {
      setError(true)
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="windows95-active-border bg-primary p-1 flex flex-col gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1">
          <input
            ref={inputRef}
            className="windows95-border bg-white px-1 text-xs w-28 outline-none"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(false) }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit()
              if (e.key === "Escape") onClose()
            }}
            placeholder="1:23:45"
          />
          <Button
            size="icon"
            className="size-6"
            onClick={handleSubmit}
          >
            OK
          </Button>
          <Button
            size="icon"
            className="size-6"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        {error && (
          <span className="text-destructive text-[10px]">Неверный формат</span>
        )}
      </div>
    </div>
  )
}

export default JumpToTime
