import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button } from './ui'

interface Props { onChange: (dataUrl: string | null) => void }

export function SignaturePad({ onChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext?.('2d')
    if (!c || !ctx) return
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#14171a'
  }, [])

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height }
  }
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drawing.current = true
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.01, p.y + 0.01)
    ctx.stroke()
  }
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    setEmpty(false)
    onChange(e.currentTarget.toDataURL('image/png'))
  }
  const clear = () => {
    const c = ref.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className="sigpad">
      <canvas
        ref={ref}
        width={560}
        height={200}
        className="sigpad-canvas"
        aria-label="Khung ký tên, dùng chuột hoặc ngón tay"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
      />
      <div className="sigpad-foot">
        <span className="hint-muted">{empty ? 'Ký vào khung phía trên' : 'Đã có chữ ký'}</span>
        <Button small onClick={clear}>Xóa chữ ký</Button>
      </div>
    </div>
  )
}
