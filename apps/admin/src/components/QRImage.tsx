import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QRImage({ text, size = 180 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(text, { width: size, margin: 1 })
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setSrc(''))
    return () => {
      alive = false
    }
  }, [text, size])
  if (!src) return <div className="qr-ph" style={{ width: size, height: size }} />
  return <img src={src} width={size} height={size} alt={`Mã QR ${text}`} />
}
