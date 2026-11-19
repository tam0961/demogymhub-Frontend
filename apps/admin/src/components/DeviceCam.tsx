import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'
import type { ProcessedPhoto } from '../lib/photo'

const PORT = 8898
const MAX_B64 = 180 * 1024

interface Props { onPhoto: (p: ProcessedPhoto) => void }

const hx = (n: number) => n.toString(16).padStart(2, '0')

function findSps(d: Uint8Array): number {
  for (let k = 0; k + 4 < d.length; k++) {
    if (d[k] === 0 && d[k + 1] === 0) {
      if (d[k + 2] === 1 && (d[k + 3] & 31) === 7) return k + 4
      if (d[k + 2] === 0 && d[k + 3] === 1 && (d[k + 4] & 31) === 7) return k + 5
    }
  }
  return -1
}

type FaceBox = { boundingBox: DOMRectReadOnly }
type FaceDetectorCtor = new (o: object) => { detect: (c: HTMLCanvasElement) => Promise<FaceBox[]> }

export function DeviceCam({ onPhoto }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const ws = useRef<WebSocket | null>(null)
  const dec = useRef<VideoDecoder | null>(null)
  const configured = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [live, setLive] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [opened, setOpened] = useState(false)
  const [msg, setMsg] = useState('Bấm Kết nối camera để xem trực tiếp từ máy chấm công. Camera chỉ để xem cho đúng khung rồi bấm chụp.')
  const [tone, setTone] = useState<'' | 'ok' | 'bad'>('')

  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    if (ws.current) { ws.current.onclose = null; ws.current.close(); ws.current = null }
    if (dec.current) { try { dec.current.close() } catch { /* đã đóng */ } dec.current = null }
    configured.current = false
    setLive(false)
    setConnecting(false)
    setOpened(false)
  }
  useEffect(() => stop, [])

  const fail = (text: string) => { stop(); setTone('bad'); setMsg(text) }

  const onFrame = (buf: ArrayBuffer) => {
    const u = new Uint8Array(buf)
    const key = u[0] === 2
    const d = u.subarray(1)
    if (!configured.current) {
      if (!key) return
      const i = findSps(d)
      if (i < 0 || i + 3 > d.length) return
      dec.current = new VideoDecoder({
        output: (fr) => {
          const cv = canvas.current
          if (cv) {
            if (cv.width !== fr.displayWidth || cv.height !== fr.displayHeight) { cv.width = fr.displayWidth; cv.height = fr.displayHeight }
            cv.getContext('2d')?.drawImage(fr, 0, 0)
            setLive((was) => {
              if (!was) { setConnecting(false); setTone('ok'); setMsg('Đang xem trực tiếp. Mời khách nhìn thẳng vào máy rồi bấm Chụp từ camera.') }
              return true
            })
          }
          fr.close()
        },
        error: (e) => fail('Trình duyệt không giải mã được hình: ' + e.message),
      })
      dec.current.configure({ codec: 'avc1.' + hx(d[i]) + hx(d[i + 1]) + hx(d[i + 2]), optimizeForLatency: true })
      configured.current = true
    }
    const dc = dec.current
    if (!dc || dc.state !== 'configured') return
    if (dc.decodeQueueSize > 8 && !key) return
    try { dc.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: performance.now() * 1000, data: d })) } catch { /* bỏ khung lỗi */ }
  }

  const connect = () => {
    if (ws.current) { stop(); setTone(''); setMsg('Đã ngắt camera.'); return }
    if (typeof VideoDecoder === 'undefined') {
      fail('Trình duyệt này chưa hỗ trợ xem trực tiếp. Hãy dùng Chrome hoặc Edge, và mở trang bằng HTTPS hoặc http://localhost.')
      return
    }
    setConnecting(true)
    setOpened(true)
    setTone('')
    setMsg('Đang kết nối camera...')
    let sock: WebSocket
    try { sock = new WebSocket(`ws://127.0.0.1:${PORT}/live`) } catch { fail('Không kết nối được cầu nối trên máy tính này.'); return }
    sock.binaryType = 'arraybuffer'
    ws.current = sock
    timer.current = setTimeout(() => {
      if (ws.current === sock && !configured.current) fail('Không thấy hình. Kiểm tra cầu nối đang chạy trên máy tính này (chay-dang-ky.bat) và máy chấm công đã bật RTSP.')
    }, 15000)
    sock.onerror = () => { if (ws.current === sock) fail('Không kết nối được cầu nối trên máy tính này. Hãy chạy cầu nối (chay-dang-ky.bat) trên máy tính đang mở trang này.') }
    sock.onclose = () => { if (ws.current === sock) fail('Mất kết nối camera.') }
    sock.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try { const j = JSON.parse(e.data) as { err?: string }; if (j.err) fail(j.err) } catch { /* bỏ qua */ }
        return
      }
      onFrame(e.data as ArrayBuffer)
    }
  }

  const snap = async () => {
    const cv = canvas.current
    if (!live || !cv) return
    // Khung camera rộng, mặt chỉ chiếm một góc: cắt dọc quanh khuôn mặt (tỉ lệ 3:4) để máy dựng được mô hình khuôn mặt
    let cx = cv.width / 2
    let cy = cv.height / 2
    let ch = cv.height
    const FD = (window as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector
    if (FD) {
      try {
        const faces = await new FD({ fastMode: true, maxDetectedFaces: 3 }).detect(cv)
        if (!faces.length) { setTone('bad'); setMsg('Không thấy khuôn mặt trong khung. Mời khách đứng giữa, nhìn thẳng vào máy.'); return }
        if (faces.length > 1) { setTone('bad'); setMsg('Có nhiều hơn một người trong khung. Chỉ để một người trước máy.'); return }
        const b = faces[0].boundingBox
        cx = b.x + b.width / 2
        cy = b.y + b.height / 2
        ch = Math.min(cv.height, b.height * 2.6)
      } catch { /* trình duyệt không dò được: cắt giữa khung */ }
    }
    let cw = (ch * 3) / 4
    if (cw > cv.width) { cw = cv.width; ch = (cw * 4) / 3 }
    const sx = Math.max(0, Math.min(cv.width - cw, cx - cw / 2))
    const sy = Math.max(0, Math.min(cv.height - ch, cy - ch / 2))
    const scale = Math.min(1, 480 / ch)
    const out = document.createElement('canvas')
    out.width = Math.round(cw * scale)
    out.height = Math.round(ch * scale)
    out.getContext('2d')?.drawImage(cv, sx, sy, cw, ch, 0, 0, out.width, out.height)
    let dataUrl = ''
    for (let q = 0.85; q >= 0.4; q -= 0.1) {
      dataUrl = out.toDataURL('image/jpeg', q)
      if (dataUrl.length - dataUrl.indexOf(',') - 1 <= MAX_B64) break
    }
    onPhoto({ content_type: 'image/jpeg', image_base64: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl })
    setTone('ok')
    setMsg('Đã chụp ảnh. Kiểm tra ảnh bên trái rồi bấm Xong để lưu.')
  }

  return (
    <div className="devcam">
      <div className="devcam-box">
        <canvas ref={canvas} width={640} height={360} aria-label="Hình trực tiếp từ camera máy chấm công" />
        {!live && <div className="devcam-ph">{connecting ? 'Đang kết nối...' : 'Chưa kết nối camera máy chấm công'}</div>}
      </div>
      <div className={`hint-muted${tone === 'bad' ? ' text-bad' : ''}`} role="status">{msg}</div>
      <div className="face-actions">
        <Button onClick={connect}>{opened ? 'Ngắt camera' : 'Kết nối camera máy chấm công'}</Button>
        <Button variant="primary" onClick={snap} disabled={!live}>Chụp từ camera</Button>
      </div>
    </div>
  )
}
