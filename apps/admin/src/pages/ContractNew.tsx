import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { CreateFlowError, STEP_LABEL, runCreateContract, type CreateOutcome } from '../lib/contracts'
import { METHODS, METHOD_LABEL, fmtDate, fmtMoney, parseMoney, priceWithVat, todayISO } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { SignaturePad } from '../components/SignaturePad'
import { Button, Field, Input, Modal, Segmented, Select, Textarea, useToast } from '../components/ui'
import type { Gender, ListResp, Member, PayMethod, Pkg } from '../types'

const addDays = (iso: string, n: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10)
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
  const [discount, setDiscount] = useState('0')
  const [note, setNote] = useState('')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [sig, setSig] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [partial, setPartial] = useState<CreateOutcome | null>(null)

  const effBranch = mode === 'existing' && member ? member.branch_id : branch

  useEffect(() => {
    if (!memberId) return
    api.get(`/members/${memberId}`).then((r) => setMember(r.data.data)).catch(() => {})
  }, [memberId])

  useEffect(() => {
    if (mode !== 'existing') return
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<ListResp<Member>>('/members', { params: { q: q || undefined, branch_id: branchId ?? undefined, limit: 6 } })
        setResults(data.data)
      } catch {
        setResults([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, mode, branchId])

  useEffect(() => {
    if (!effBranch) return
    api.get<ListResp<Pkg>>('/packages', { params: { branch_id: effBranch, limit: 100 } })
      .then((r) => {
        const list = r.data.data.filter((p) => p.active && (!p.branch_id || p.branch_id === effBranch))
        setPkgs(list)
        setPkgId((cur) => (list.some((p) => p.id === cur) ? cur : list[0]?.id ?? ''))
      })
      .catch(() => setPkgs([]))
  }, [effBranch])

  const pkg = pkgs.find((p) => p.id === pkgId)
  const gross = pkg ? priceWithVat(pkg.price, pkg.vat_percent) : 0
  const disc = Math.min(parseMoney(discount), gross)
  const total = gross - disc
  const paidNum = Math.min(parseMoney(paid), total)
  const remain = Math.max(0, total - paidNum)
  const end = pkg ? (pkg.type === 'session' ? '' : addDays(start, pkg.duration_days ?? 30)) : ''
  const memberOk = mode === 'existing' ? !!member : name.trim().length > 1 && phone.trim().length >= 8
  const canNext = memberOk && !!pkg && !!start
  const who = mode === 'existing' ? member?.name ?? '' : name.trim()

  const finish = async (withSignature: boolean) => {
    if (!pkg) return
    setBusy(true)
    setErr('')
    try {
      const out = await runCreateContract(
        (url, body) => api.post(url, body),
        {
          member: mode === 'existing' && member ? { id: member.id } : { name, phone, gender, branch_id: branch },
          package_id: pkg.id, discount: disc, note, signature: withSignature ? sig : null, paid: withSignature ? paidNum : 0, method,
          canApprove: can('contracts.approve'), startDate: start,
        },
        (e) => apiError(e).message,
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
    <Modal title="Tạo hợp đồng mới" size="large" onClose={onClose} footer={footer}>
      <ol className="wiz-steps" aria-label="Các bước">
        <li aria-current={step === 1 ? 'step' : undefined}>1. Nhập thông tin</li>
        <li aria-current={step === 2 ? 'step' : undefined}>2. Ký xác nhận</li>
      </ol>
      {err && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      {step === 1 && (
        <div className="form-grid">
          <div className="full">
            <Segmented ariaLabel="Loại hội viên" value={mode} onChange={setMode} options={[{ value: 'new', label: 'Hội viên mới' }, { value: 'existing', label: 'Hội viên đã có' }]} />
          </div>
          {mode === 'new' ? (
            <>
              <Field label="Họ tên" htmlFor="cn-name"><Input id="cn-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Số điện thoại" htmlFor="cn-phone"><Input id="cn-phone" type="tel" inputMode="tel" placeholder="0903123456" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="Giới tính" htmlFor="cn-gender">
                <Select id="cn-gender" value={gender} onChange={(e) => setGender(e.target.value as Gender | '')}>
                  <option value="">Chọn giới tính</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
                </Select>
              </Field>
              <Field label="Chi nhánh" htmlFor="cn-branch">
                <Select id="cn-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            </>
          ) : (
            <div className="full stack">
              {member ? (
                <div className="picked">
                  <div><b>{member.name}</b><div className="cell-sub">{member.code} - {member.phone}</div></div>
                  <Button small onClick={() => setMember(null)}>Đổi</Button>
                </div>
              ) : (
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
          <Field label="Gói tập" htmlFor="cn-pkg" hint={pkgs.length === 0 ? 'Chi nhánh này chưa có gói đang bán' : undefined}>
            <Select id="cn-pkg" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
              {pkgs.map((p) => <option key={p.id} value={p.id}>{pkgLabel(p)}</option>)}
            </Select>
          </Field>
          <Field label="Ngày bắt đầu" htmlFor="cn-start"><Input id="cn-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Ngày hết hạn" htmlFor="cn-end" hint={pkg?.type === 'session' ? 'Gói theo buổi, hạn tính khi kích hoạt' : undefined}>
            <Input id="cn-end" readOnly value={end ? fmtDate(end) : ''} />
          </Field>
          <Field label="Khuyến mãi, giảm giá (đồng)" htmlFor="cn-disc"><Input id="cn-disc" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <Field label="Ghi chú" htmlFor="cn-note" full><Textarea id="cn-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Field label="Thu ngay (đồng)" htmlFor="cn-paid" hint={`Thành tiền ${fmtMoney(total)}`}>
            <Input id="cn-paid" inputMode="numeric" placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </Field>
          <Field label="Ngày thanh toán" htmlFor="cn-pdate"><Input id="cn-pdate" type="date" readOnly value={todayISO()} /></Field>
          <Field label="Hình thức thanh toán" htmlFor="cn-method">
            <Select id="cn-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
              {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </Select>
          </Field>
          <Field label="Còn thiếu" htmlFor="cn-remain"><Input id="cn-remain" readOnly value={fmtMoney(remain)} /></Field>
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
              <dt>Thời hạn</dt><dd>{fmtDate(start)}{end ? ` đến ${fmtDate(end)}` : ', theo số buổi'}</dd>
              <dt>Giá trị</dt><dd>{fmtMoney(total)}{disc > 0 ? ` (đã giảm ${fmtMoney(disc)})` : ''}</dd>
              <dt>Đã thanh toán</dt><dd>{fmtMoney(paidNum)}{paidNum > 0 ? `, ${METHOD_LABEL[method]}` : ''}</dd>
              <dt>Còn thiếu</dt><dd>{fmtMoney(remain)}</dd>
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
  )
}
