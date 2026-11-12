import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { CreateFlowError, STEP_LABEL, runCreateContract, type CreateOutcome } from '../lib/contracts'
import { METHODS, METHOD_LABEL, fmtDate, fmtMoney, parseMoney, priceWithVat, todayISO } from '../lib/format'
import { PROMO_OPTIONS, defaultStart, memberBanner, priceHint, promoAllowed, quote, renewedFromId, type Promo, type PromoType } from '../lib/promo'
import type { ProcessedPhoto } from '../lib/photo'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { SignaturePad } from '../components/SignaturePad'
import { FaceModal } from '../components/FaceModal'
import { MemberAvatar } from '../components/MemberAvatar'
import { Button, Field, Input, Modal, Segmented, Select, Textarea, useToast } from '../components/ui'
import type { Gender, ListResp, Member, PayMethod, Pkg } from '../types'

const pkgLabel = (p: Pkg) => `${p.name} - ${fmtMoney(priceWithVat(p.price, p.vat_percent))}`

export default function ContractNew({ memberId, onClose, onCreated }: { memberId?: string | null; onClose: () => void; onCreated: (contractId: string) => void }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const branches = useMemo(() => user?.branches ?? [], [user])
  const [step, setStep] = useState<1 | 2>(1)
  const [mode, setMode] = useState<'new' | 'existing'>(memberId ? 'existing' : 'new')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [branch, setBranch] = useState(branchId ?? branches[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [member, setMember] = useState<Member | null>(null)
  const [pkgs, setPkgs] = useState<Pkg[]>([])
  const [pkgId, setPkgId] = useState('')
  const [start, setStart] = useState(todayISO())
  const [startTouched, setStartTouched] = useState(false)
  const [promoType, setPromoType] = useState<'' | PromoType>('')
  const [promoValue, setPromoValue] = useState('')
  const [note, setNote] = useState('')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null)
  const [faceId, setFaceId] = useState('')
  const [faceOpen, setFaceOpen] = useState(false)
  const [sig, setSig] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [partial, setPartial] = useState<CreateOutcome | null>(null)

  const existing = mode === 'existing'
  const effBranch = existing && member ? member.branch_id : branch

  useEffect(() => {
    if (!memberId) return
    api.get(`/members/${memberId}`).then((r) => setMember(r.data.data)).catch(() => {})
  }, [memberId])

  useEffect(() => {
    if (!startTouched) setStart(defaultStart(existing ? member : null))
  }, [member, existing, startTouched])

  useEffect(() => {
    if (!existing || memberId) return
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<ListResp<Member>>('/members', { params: { q: q || undefined, branch_id: branchId ?? undefined, limit: 6 } })
        setResults(data.data)
      } catch {
        setResults([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, existing, memberId, branchId])

  useEffect(() => {
    if (!effBranch) return
    api.get<ListResp<Pkg>>('/packages', { params: { branch_id: effBranch, limit: 100 } })
      .then((r) => {
        const list = r.data.data.filter((p) => p.active && (!p.branch_id || p.branch_id === effBranch))
        setPkgs(list)
        setPkgId((cur) => (list.some((p) => p.id === cur) ? cur : ''))
      })
      .catch(() => setPkgs([]))
  }, [effBranch])

  const pkg = pkgs.find((p) => p.id === pkgId)
  useEffect(() => {
    if (promoType && !promoAllowed(promoType, pkg?.type)) { setPromoType(''); setPromoValue('') }
  }, [pkg, promoType])

  const promoNum = parseMoney(promoValue)
  const promo: Promo | null = promoType && promoNum > 0 ? { type: promoType, value: promoNum } : null
  const promoErr = promoType === 'percent' && promoNum > 100 ? 'Tối đa 100%' : ''
  const qt = quote(pkg, promo, parseMoney(paid), start)
  const memberOk = existing ? !!member : name.trim().length > 1 && phone.trim().length >= 8
  const canNext = memberOk && !!pkg && !!start && !promoErr
  const who = existing ? member?.name ?? '' : name.trim()
  const promoLabel = PROMO_OPTIONS.find((o) => o.value === promoType)
  const photoThumb = existing
    ? member ? <MemberAvatar member={member} size={44} /> : null
    : photo ? <img className="avatar" style={{ width: 44, height: 44 }} src={photo.dataUrl} alt="Ảnh hội viên" /> : null
  const curFaceId = existing ? member?.face_id ?? '' : faceId
  const hasPhoto = existing ? !!member?.has_photo : !!photo
  const faceNote = `${hasPhoto ? (existing ? 'Đã có ảnh.' : 'Đã chọn ảnh.') : 'Chưa có ảnh.'}${curFaceId ? ` Face ID: ${curFaceId}.` : ''}`

  const saveFace = async (r: { photo: ProcessedPhoto | null; faceId: string }) => {
    if (!existing || !member) {
      setPhoto(r.photo ?? photo)
      setFaceId(r.faceId)
      return
    }
    const merge = (m: Member) => setMember((prev) => (prev ? { ...prev, ...m, current_contract: m.current_contract ?? prev.current_contract, branch: m.branch ?? prev.branch } : prev))
    if (r.photo) merge((await api.put(`/members/${member.id}/photo`, { content_type: r.photo.content_type, image_base64: r.photo.image_base64 })).data.data)
    const nf = r.faceId || null
    if ((member.face_id ?? null) !== nf) merge((await api.patch(`/members/${member.id}`, { face_id: nf })).data.data)
  }

  const finish = async (withSignature: boolean) => {
    if (!pkg) return
    setBusy(true)
    setErr('')
    try {
      const out = await runCreateContract(
        (url, body) => api.post(url, body),
        {
          member: existing && member ? { id: member.id } : { name, phone, gender, branch_id: branch },
          package_id: pkg.id,
          promo,
          renewed_from_id: existing ? renewedFromId(member) : null,
          photo: !existing && photo ? { content_type: photo.content_type, image_base64: photo.image_base64 } : null,
          faceId: !existing ? faceId.trim() || null : null,
          note, signature: withSignature ? sig : null, paid: withSignature ? qt.paid : 0, method,
          canApprove: can('contracts.approve'), startDate: start,
        },
        (e) => apiError(e).message,
        (url, body) => api.put(url, body),
      )
      out.notes.forEach((n) => toast(n))
      toast(out.activated ? 'Đã tạo và kích hoạt hợp đồng' : 'Đã tạo hợp đồng')
      onCreated(out.contractId as string)
    } catch (e) {
      if (e instanceof CreateFlowError) {
        setPartial(e.outcome)
        const kept = [e.outcome.memberId && 'hội viên mới', e.outcome.contractId && 'hợp đồng', e.outcome.signed && 'chữ ký', e.outcome.paymentId && 'phiếu thu'].filter(Boolean)
        setErr(`Không thể ${STEP_LABEL[e.step]}: ${e.message}.${kept.length ? ` Đã lưu: ${kept.join(', ')}. Hãy mở hợp đồng để hoàn tất các bước còn lại.` : ''}`)
      } else setErr('Có lỗi xảy ra, hãy thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const footer =
    partial?.contractId ? (
      <>
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="primary" onClick={() => onCreated(partial.contractId as string)}>Mở hợp đồng</Button>
      </>
    ) : step === 1 ? (
      <>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="primary" disabled={!canNext} onClick={() => setStep(2)}>Tiếp tục</Button>
      </>
    ) : (
      <>
        <Button onClick={() => setStep(1)} disabled={busy}>Quay lại</Button>
        <Button onClick={() => finish(false)} disabled={busy}>Bỏ qua, ký sau</Button>
        <Button variant="primary" disabled={busy || !sig || !consent} onClick={() => finish(true)}>{busy ? 'Đang xử lý...' : 'Hoàn tất'}</Button>
      </>
    )

  return (
    <>
    <Modal title="Tạo hợp đồng mới" size="large" onClose={onClose} footer={footer}>
      <ol className="wiz-steps" aria-label="Các bước">
        <li aria-current={step === 1 ? 'step' : undefined}>1. Nhập thông tin</li>
        <li aria-current={step === 2 ? 'step' : undefined}>2. Ký xác nhận</li>
      </ol>
      {err && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      {step === 1 && (
        <div className="form-grid cols-3">
          {existing && member && <div className="full info-ok" role="status">{memberBanner(member)}</div>}
          {!memberId && (
            <div className="full">
              <Segmented ariaLabel="Loại hội viên" value={mode} onChange={(v) => { setMode(v); setMember(null) }} options={[{ value: 'new', label: 'Hội viên mới' }, { value: 'existing', label: 'Hội viên đã có' }]} />
            </div>
          )}
          {existing && !member && (
            <div className="full stack">
              {memberId ? <div className="hint-muted">Đang tải hội viên...</div> : (
                <>
                  <Field label="Tìm hội viên (tên, SĐT, mã)" htmlFor="cn-q"><Input id="cn-q" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} /></Field>
                  <ul className="pick-list">
                    {results.map((m) => (
                      <li key={m.id}><button type="button" className="pick" onClick={() => setMember(m)}><b>{m.name}</b><span className="cell-sub">{m.code} - {m.phone}</span></button></li>
                    ))}
                    {results.length === 0 && <li className="hint-muted">Không tìm thấy hội viên</li>}
                  </ul>
                </>
              )}
            </div>
          )}
          {(!existing || member) && (
            <>
              <Field label="Họ tên" htmlFor="cn-name"><Input id="cn-name" required autoFocus={!existing} readOnly={existing} value={existing ? member?.name ?? '' : name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Số điện thoại" htmlFor="cn-phone"><Input id="cn-phone" type="tel" inputMode="tel" placeholder="0903123456" readOnly={existing} value={existing ? member?.phone ?? '' : phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="Giới tính" htmlFor="cn-gender">
                <Select id="cn-gender" disabled={existing} value={existing ? member?.gender ?? '' : gender} onChange={(e) => setGender(e.target.value as Gender | '')}>
                  <option value="">Chọn giới tính</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
                </Select>
              </Field>
              <Field label="Chi nhánh" htmlFor="cn-branch">
                <Select id="cn-branch" disabled={existing} value={effBranch} onChange={(e) => setBranch(e.target.value)}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <div className="full face-row">
                <div className="face-label">Ảnh và khuôn mặt</div>
                <div className="face-line">
                  {photoThumb}
                  <Button onClick={() => setFaceOpen(true)} disabled={existing && !can('members.update')}>Chụp ảnh, đăng ký khuôn mặt</Button>
                  <span className="hint-muted">{faceNote}</span>
                </div>
                <label className="check face-check"><input type="checkbox" disabled aria-describedby="cn-face-hint" />Đăng ký khuôn mặt lên máy chấm công khi hợp đồng có hiệu lực</label>
                <span id="cn-face-hint" className="hint-muted">Khả dụng khi kết nối máy chấm công</span>
              </div>
              <Field label="Gói tập" htmlFor="cn-pkg" hint={pkgs.length === 0 ? 'Chi nhánh này chưa có gói đang bán' : pkg && pkg.price === 0 ? 'Gói này có giá 0 ₫, hãy kiểm tra lại trước khi tiếp tục' : undefined}>
                <Select id="cn-pkg" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                  <option value="">Chọn gói tập</option>
                  {pkgs.map((p) => <option key={p.id} value={p.id}>{pkgLabel(p)}</option>)}
                </Select>
              </Field>
              <Field label="Ngày bắt đầu" htmlFor="cn-start"><Input id="cn-start" type="date" value={start} onChange={(e) => { setStart(e.target.value); setStartTouched(true) }} /></Field>
              <Field label="Ngày hết hạn" htmlFor="cn-end">
                <Input id="cn-end" readOnly value={pkg ? (qt.endDate ? fmtDate(qt.endDate) : 'Tính khi kích hoạt') : ''} />
              </Field>
              <Field label="Khuyến mãi" htmlFor="cn-promo">
                <Select id="cn-promo" value={promoType} onChange={(e) => { setPromoType(e.target.value as '' | PromoType); setPromoValue('') }}>
                  {PROMO_OPTIONS.map((o) => <option key={o.value} value={o.value} disabled={!promoAllowed(o.value, pkg?.type)}>{o.label}</option>)}
                </Select>
              </Field>
              {promoType && (
                <Field label={promoLabel?.valueLabel ?? 'Giá trị'} htmlFor="cn-promo-val" error={promoErr}>
                  <Input id="cn-promo-val" inputMode="numeric" invalid={!!promoErr} placeholder="0" value={promoValue} onChange={(e) => setPromoValue(e.target.value)} />
                </Field>
              )}
              <Field label="Thu ngay (đồng)" htmlFor="cn-paid" hint={`Thành tiền ${fmtMoney(qt.total)}`}>
                <Input id="cn-paid" inputMode="numeric" placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
              </Field>
              <Field label="Ngày thanh toán" htmlFor="cn-pdate"><Input id="cn-pdate" type="date" readOnly value={todayISO()} /></Field>
              <Field label="Hình thức thanh toán" htmlFor="cn-method">
                <Select id="cn-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                  {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                </Select>
              </Field>
              <Field label="Còn thiếu" htmlFor="cn-remain"><Input id="cn-remain" readOnly value={pkg && qt.remain === 0 ? 'Đã thu đủ' : fmtMoney(qt.remain)} /></Field>
              {pkg && <p className="full hint-muted" id="cn-hint">{priceHint(pkg, qt)}</p>}
              <Field label="Ghi chú" htmlFor="cn-note" full><Textarea id="cn-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </>
          )}
        </div>
      )}

      {step === 2 && pkg && (
        <div className="stack">
          <div className="contract-sheet">
            <h3>TH Gym &amp; Fitness, hợp đồng thành viên</h3>
            <dl className="kv">
              <dt>Mã hợp đồng</dt><dd>(tự sinh khi hoàn tất)</dd>
              <dt>Họ và tên</dt><dd><b>{who}</b></dd>
              <dt>Gói tập</dt><dd>{pkg.name}</dd>
              <dt>Thời hạn</dt><dd>{fmtDate(start)}{qt.endDate ? ` đến ${fmtDate(qt.endDate)}` : `, ${qt.sessions ?? 0} buổi`}</dd>
              <dt>Giá trị</dt><dd>{fmtMoney(qt.total)}{qt.discount > 0 ? ` (đã giảm ${fmtMoney(qt.discount)})` : ''}</dd>
              {promo && <><dt>Khuyến mãi</dt><dd>{promoLabel?.label}: {promoNum.toLocaleString('vi-VN')}</dd></>}
              <dt>Đã thanh toán</dt><dd>{fmtMoney(qt.paid)}{qt.paid > 0 ? `, ${METHOD_LABEL[method]}` : ''}</dd>
              <dt>Còn thiếu</dt><dd>{fmtMoney(qt.remain)}</dd>
            </dl>
          </div>
          <div>
            <div className="sig-label">Chữ ký của {who}</div>
            <SignaturePad onChange={setSig} />
          </div>
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />Hội viên đã đọc và đồng ý với điều khoản hợp đồng và nội quy phòng tập.</label>
        </div>
      )}
    </Modal>
    {faceOpen && (
      <FaceModal member={existing ? member : null} initialPhoto={existing ? null : photo} initialFaceId={curFaceId} onSave={saveFace} onClose={() => setFaceOpen(false)} />
    )}
    </>
  )
}
