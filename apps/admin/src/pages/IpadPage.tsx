import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fmtMoney } from '../lib/format'
import { getIpadPublic, sendIpadSignature, startIpadPairing, type IpadStage, type PayPayload, type SignPayload } from '../lib/ipad'
import { SignaturePad } from '../components/SignaturePad'
import { Button } from '../components/ui'

export default function IpadPage() {
  const { token: urlToken = '' } = useParams()
  const [token, setToken] = useState(urlToken)
  const [paired, setPaired] = useState(true)
  const [code, setCode] = useState<string | null>(null)
  const [stage, setStage] = useState<IpadStage>('idle')
  const [payload, setPayload] = useState<(PayPayload & SignPayload) | null>(null)
  const [error, setError] = useState('')
  const [sig, setSig] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const lastStage = useRef<IpadStage>('idle')

  useEffect(() => {
    if (urlToken) return
    let saved = ''
    try { saved = localStorage.getItem('gymhub.ipad.token') ?? '' } catch { /* ignore */ }
    if (saved) { setToken(saved); return }
    startIpadPairing().then((t) => {
      try { localStorage.setItem('gymhub.ipad.token', t) } catch { /* ignore */ }
      setToken(t)
    }).catch(() => setError('Không tạo được mã kết nối, hãy tải lại trang.'))
  }, [urlToken])

  useEffect(() => {
    if (!token) return
    let alive = true
    const tick = async () => {
      try {
        const s = await getIpadPublic(token)
        if (!alive) return
        if (s.stage !== lastStage.current) {
          lastStage.current = s.stage
          setSig(null)
          setConsent(false)
        }
        setStage(s.stage)
        setPayload(s.payload)
        setPaired(s.paired)
        setCode(s.code)
        setError('')
      } catch {
        if (!alive) return
        if (!urlToken) { try { localStorage.removeItem('gymhub.ipad.token') } catch { /* ignore */ } setToken(''); startIpadPairing().then((t) => { try { localStorage.setItem('gymhub.ipad.token', t) } catch { /* ignore */ } setToken(t) }).catch(() => {}); return }
        setError('Phiên không còn hiệu lực. Hãy nhờ nhân viên tạo lại liên kết.')
      }
    }
    tick()
    const id = window.setInterval(tick, 2000)
    return () => { alive = false; window.clearInterval(id) }
  }, [token, urlToken])

  const submit = async () => {
    if (!sig) return
    setBusy(true)
    try {
      await sendIpadSignature(token, sig)
      setStage('signed')
    } catch {
      setError('Không gửi được chữ ký, hãy thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="ipad-page">
      <h1>TH Gym &amp; Fitness</h1>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!error && !paired && code && (
        <section className="ipad-card">
          <h2>Mã kết nối iPad</h2>
          <p className="ipad-code" style={{ fontSize: 48, letterSpacing: 8, fontWeight: 700, margin: '12px 0' }}>{code}</p>
          <p className="hint-muted">Nhân viên nhập mã này trên máy tính để kết nối iPad quầy lễ tân.</p>
        </section>
      )}
      {!error && paired && stage === 'idle' && <p className="ipad-wait">Vui lòng chờ nhân viên...</p>}
      {!error && stage === 'pay' && payload && (
        <section className="ipad-card">
          <h2>Quét mã để chuyển khoản</h2>
          <img className="ipad-qr" src={payload.qrUrl} alt="Mã QR chuyển khoản" />
          <dl className="kv">
            <dt>Ngân hàng</dt><dd>{payload.bankName}</dd>
            <dt>Số tài khoản</dt><dd><b>{payload.account}</b></dd>
            <dt>Chủ tài khoản</dt><dd>{payload.holder}</dd>
            <dt>Số tiền</dt><dd><b>{fmtMoney(payload.amount)}</b></dd>
            <dt>Nội dung</dt><dd><b>{payload.content}</b></dd>
          </dl>
        </section>
      )}
      {!error && stage === 'paid' && payload && (
        <section className="ipad-card">
          <h2>Đã nhận thanh toán</h2>
          <dl className="kv">{payload.rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className="ipad-wait">Cảm ơn quý khách! Vui lòng chờ chuyển sang bước ký tên...</p>
        </section>
      )}
      {!error && stage === 'sign' && payload && (
        <section className="ipad-card">
          <h2>{payload.title}</h2>
          <dl className="kv">{payload.rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <div className="sig-label">Ký tên tại đây</div>
          <SignaturePad onChange={setSig} />
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{payload.consent ?? 'Tôi đã đọc và đồng ý với điều khoản hợp đồng'}</label>
          <Button variant="primary" disabled={busy || !sig || !consent} onClick={submit}>{busy ? 'Đang gửi...' : 'Gửi chữ ký'}</Button>
        </section>
      )}
      {!error && stage === 'signed' && <p className="ipad-wait">Đã nhận chữ ký. Cảm ơn quý khách!</p>}
    </main>
  )
}
