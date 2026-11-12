import { useEffect, useRef, useState } from 'react'
import { apiError } from '../lib/errors'
import { processPhoto, type ProcessedPhoto } from '../lib/photo'
import { Button, Field, Input, Modal } from './ui'
import { loadPhoto, type PhotoRef } from './MemberAvatar'

export interface FaceResult { photo: ProcessedPhoto | null; faceId: string }

interface Props {
  member?: PhotoRef | null
  initialPhoto?: ProcessedPhoto | null
  initialFaceId?: string
  onSave: (r: FaceResult) => Promise<void>
  onClose: () => void
}

function cameraError(e: unknown): string {
  const n = (e as { name?: string })?.name
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Bạn chưa cho phép dùng camera. Hãy cấp quyền camera cho trình duyệt rồi thử lại.'
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Không tìm thấy camera trên thiết bị này. Bạn có thể tải ảnh từ máy.'
  if (n === 'NotReadableError') return 'Camera đang được ứng dụng khác sử dụng.'
  return 'Không mở được camera. Bạn có thể tải ảnh từ máy.'
}

export function FaceModal({ member, initialPhoto, initialFaceId = '', onSave, onClose }: Props) {
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(initialPhoto ?? null)
  const [current, setCurrent] = useState<string | null>(null)
  const [faceId, setFaceId] = useState(initialFaceId)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [camErr, setCamErr] = useState('')
  const [photoErr, setPhotoErr] = useState('')
  const [faceErr, setFaceErr] = useState('')
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!member?.has_photo) return
    let alive = true
    loadPhoto({ id: member.id, photo_version: member.photo_version }).then((u) => { if (alive) setCurrent(u) })
    return () => { alive = false }
  }, [member])

  useEffect(() => {
    if (video.current) video.current.srcObject = stream
  }, [stream])

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), [])

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
  }

  const connect = async () => {
    setCamErr('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr('Trình duyệt này không hỗ trợ camera. Bạn có thể tải ảnh từ máy.')
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = s
      setStream(s)
    } catch (e) {
      setCamErr(cameraError(e))
    }
  }

  const accept = async (blob: Blob) => {
    setPhotoErr('')
    try {
      setPhoto(await processPhoto(blob))
    } catch (e) {
      setPhotoErr((e as Error).message)
    }
  }

  const capture = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    c.toBlob((b) => (b ? accept(b) : setPhotoErr('Không chụp được ảnh, hãy thử lại.')), 'image/jpeg', 0.92)
  }

  const close = () => {
    stop()
    onClose()
  }

  const save = async () => {
    const id = faceId.trim()
    if (id.length > 32) {
      setFaceErr('Face ID tối đa 32 ký tự')
      return
    }
    setBusy(true)
    setFaceErr('')
    setFormErr('')
    try {
      await onSave({ photo, faceId: id })
      stop()
      onClose()
    } catch (e) {
      const a = apiError(e)
      if (a.status === 409 || a.code === 'DUPLICATE_FACE_ID') setFaceErr('Face ID này đã được dùng cho hội viên khác')
      else if (a.code === 'INVALID_IMAGE') setFormErr('Ảnh không hợp lệ, hãy chọn ảnh khác.')
      else if (a.code === 'PHOTO_TOO_LARGE') setFormErr('Ảnh quá lớn, hãy chọn ảnh khác.')
      else setFormErr(a.message)
    } finally {
      setBusy(false)
    }
  }

  const preview = photo?.dataUrl ?? current
  return (
    <Modal
      title="Chụp ảnh và đăng ký khuôn mặt"
      onClose={close}
      footer={
        <>
          <Button onClick={close} disabled={busy}>Hủy</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu...' : 'Xong'}</Button>
        </>
      }
    >
      {formErr && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{formErr}</div>}
      <div className="face-grid">
        <div className="face-side">
          <div className="face-photo">{preview ? <img src={preview} alt="Ảnh hồ sơ" /> : <span className="hint-muted">Chưa có ảnh</span>}</div>
          <div className="hint-muted">Ảnh hồ sơ</div>
        </div>
        <div className="face-main">
          <div className="face-cam">
            <video ref={video} autoPlay playsInline muted aria-label="Hình trực tiếp từ camera" style={{ display: stream ? 'block' : 'none' }} />
            {!stream && <span>Chưa kết nối camera</span>}
          </div>
          <div className="hint-muted">Bấm Kết nối camera để xem trực tiếp từ camera.</div>
          {camErr && <div className="field-error" role="alert">{camErr}</div>}
          <div className="face-actions">
            <Button onClick={connect} disabled={!!stream}>Kết nối camera</Button>
            <Button onClick={capture} disabled={!stream}>Chụp ảnh</Button>
            <label className="btn face-upload">
              Hoặc tải ảnh từ máy
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) accept(f) }} />
            </label>
          </div>
          <div className="hint-muted">Khách nhìn thẳng, đủ sáng, không đội nón hay đeo khẩu trang. Nếu tải ảnh từ máy, ảnh tối, mờ hoặc không thấy mặt sẽ bị từ chối.</div>
          {photoErr && <div className="field-error" role="alert">{photoErr}</div>}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Face ID (đăng ký khuôn mặt)" htmlFor="face-id" hint="Mã khuôn mặt trên máy Hikvision. Có thể nhập sau." error={faceErr}>
          <Input id="face-id" maxLength={40} invalid={!!faceErr} value={faceId} onChange={(e) => setFaceId(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
