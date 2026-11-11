import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney, parseMoney, priceWithVat } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { useToast } from '../components/Toast'
import { Button, Field, Input } from '../components/ui'
import { MemberModal } from './Members'
import type { Contract, ListResp, Member, Pkg } from '../types'

const STEPS = ['Hội viên', 'Gói tập', 'Xác nhận']
const pkgInfo = (p: Pkg) => (p.type === 'session' ? `${p.sessions} buổi` : `${p.duration_days} ngày`)

export default function ContractNew() {
  const nav = useNavigate()
  const toast = useToast()
  const { can } = usePermission()
  const { branchId } = useBranch()
  const [params] = useSearchParams()
  const [step, setStep] = useState(0)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [member, setMember] = useState<Member | null>(null)
  const [creating, setCreating] = useState(false)
  const [pkgs, setPkgs] = useState<Pkg[]>([])
  const [pkg, setPkg] = useState<Pkg | null>(null)
  const [discount, setDiscount] = useState('0')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const id = params.get('member_id')
    if (!id) return
    api.get(`/members/${id}`).then((r) => {
      setMember(r.data.data)
      setStep(1)
    }).catch(() => {})
  }, [params])

  useEffect(() => {
    if (step !== 0) return
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<ListResp<Member>>('/members', { params: { q: q || undefined, branch_id: branchId ?? undefined, limit: 8 } })
        setResults(data.data)
      } catch {
        setResults([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, step, branchId])

  useEffect(() => {
    if (!member) return
    api.get<ListResp<Pkg>>('/packages', { params: { branch_id: member.branch_id, limit: 100 } }).then((r) => {
      setPkgs(r.data.data.filter((p) => p.active && p.branch_id === member.branch_id))
    }).catch(() => setPkgs([]))
  }, [member])

  const gross = pkg ? priceWithVat(pkg.price, pkg.vat_percent) : 0
  const disc = Math.min(parseMoney(discount), gross)
  const total = gross - disc

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!member || !pkg) return
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.post<{ data: Contract }>('/contracts', { member_id: member.id, package_id: pkg.id, discount: disc || undefined, note: note.trim() || undefined })
      toast('Đã tạo hợp đồng nháp')
      nav(`/contracts/${data.data.id}`)
    } catch (x) {
      setErr(apiError(x).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head"><h1>Tạo hợp đồng</h1></div>
      <ol className="steps" aria-label="Các bước">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={i === step ? 'on' : i < step ? 'done' : ''}>{i + 1}. {s}</li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card pad stack">
          <Field label="Tìm hội viên (tên, SĐT, mã)" htmlFor="w-q">
            <Input id="w-q" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <ul className="pick-list">
            {results.map((m) => (
              <li key={m.id}>
                <button type="button" className="pick" onClick={() => { setMember(m); setPkg(null); setStep(1) }}>
                  <b>{m.name}</b>
                  <span>{m.code} - {m.phone}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="empty">Không tìm thấy hội viên</li>}
          </ul>
          {can('members.create') && <div><Button onClick={() => setCreating(true)}>Tạo hội viên mới</Button></div>}
        </section>
      )}

      {step === 1 && member && (
        <section className="card pad stack">
          <div>Hội viên: <b>{member.name}</b> ({member.code}) <Button small onClick={() => setStep(0)}>Đổi</Button></div>
          <div className="pkg-grid" role="radiogroup" aria-label="Gói tập">
            {pkgs.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={pkg?.id === p.id} className="pkg" onClick={() => setPkg(p)}>
                <b>{p.name}</b>
                <span>{pkgInfo(p)}</span>
                <span className="num">{fmtMoney(p.price)} + VAT {p.vat_percent}%</span>
                <b className="num">{fmtMoney(priceWithVat(p.price, p.vat_percent))}</b>
              </button>
            ))}
            {pkgs.length === 0 && <div className="empty">Chi nhánh của hội viên chưa có gói đang bán</div>}
          </div>
          <div className="row-end">
            <Button onClick={() => setStep(0)}>Quay lại</Button>
            <Button variant="primary" disabled={!pkg} onClick={() => setStep(2)}>Tiếp tục</Button>
          </div>
        </section>
      )}

      {step === 2 && member && pkg && (
        <form className="card pad stack" onSubmit={create}>
          {err && <div className="form-error" role="alert">{err}</div>}
          <dl className="kv">
            <dt>Hội viên</dt><dd>{member.name} ({member.code})</dd>
            <dt>Gói</dt><dd>{pkg.name} - {pkgInfo(pkg)}</dd>
            <dt>Giá gồm VAT</dt><dd className="num">{fmtMoney(gross)}</dd>
            <dt>Giảm giá</dt><dd className="num">- {fmtMoney(disc)}</dd>
            <dt>Thành tiền</dt><dd className="num"><b>{fmtMoney(total)}</b></dd>
          </dl>
          <Field label="Giảm giá (đ)" htmlFor="w-disc">
            <Input id="w-disc" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label="Ghi chú" htmlFor="w-note">
            <textarea id="w-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="row-end">
            <Button onClick={() => setStep(1)}>Quay lại</Button>
            <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Đang tạo...' : 'Tạo hợp đồng nháp'}</Button>
          </div>
        </form>
      )}

      {creating && (
        <MemberModal
          member={null}
          onClose={() => setCreating(false)}
          onSaved={(m) => {
            setCreating(false)
            if (m) {
              setMember(m)
              setPkg(null)
              setStep(1)
            }
          }}
        />
      )}
    </>
  )
}
