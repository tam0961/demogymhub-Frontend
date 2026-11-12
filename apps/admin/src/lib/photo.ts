export const MAX_FILE_BYTES = 8 * 1024 * 1024
export const MIN_SIDE = 200
export const OUT_SIDE = 480
export const START_QUALITY = 0.82
export const MIN_QUALITY = 0.3
export const MAX_BASE64_CHARS = 180 * 1024

export interface ProcessedPhoto { content_type: 'image/jpeg'; image_base64: string; dataUrl: string }

export function validateFile(f: { type: string; size: number }): string | null {
  if (!f.type.startsWith('image/')) return 'Tệp đã chọn không phải là ảnh.'
  if (f.size > MAX_FILE_BYTES) return 'Ảnh quá lớn, tối đa 8 MB.'
  return null
}

export function validateSize(w: number, h: number): string | null {
  if (Math.min(w, h) < MIN_SIDE) return `Ảnh quá nhỏ, cạnh ngắn nhất cần ít nhất ${MIN_SIDE}px.`
  return null
}

export function squareCrop(w: number, h: number) {
  const s = Math.min(w, h)
  return { sx: Math.floor((w - s) / 2), sy: Math.floor((h - s) / 2), s }
}

export function encodeUnderLimit(encode: (q: number) => string): { dataUrl: string; quality: number } | null {
  for (let q = START_QUALITY; q >= MIN_QUALITY - 1e-9; q -= 0.07) {
    const dataUrl = encode(Math.round(q * 100) / 100)
    if (dataUrl.length - dataUrl.indexOf(',') - 1 <= MAX_BASE64_CHARS) return { dataUrl, quality: Math.round(q * 100) / 100 }
  }
  return null
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh, hãy chọn tệp ảnh khác.')) }
    img.src = url
  })
}

export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  const bad = validateFile(file)
  if (bad) throw new Error(bad)
  const img = await loadImage(file)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const small = validateSize(w, h)
  if (small) throw new Error(small)
  const { sx, sy, s } = squareCrop(w, h)
  const out = Math.min(OUT_SIDE, s)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.')
  ctx.drawImage(img, sx, sy, s, s, 0, 0, out, out)
  const enc = encodeUnderLimit((q) => canvas.toDataURL('image/jpeg', q))
  if (!enc) throw new Error('Không nén được ảnh xuống dưới 180 KB, hãy chọn ảnh khác.')
  return { content_type: 'image/jpeg', image_base64: enc.dataUrl.slice(enc.dataUrl.indexOf(',') + 1), dataUrl: enc.dataUrl }
}
