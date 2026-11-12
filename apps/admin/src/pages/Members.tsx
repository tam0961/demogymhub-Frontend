import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { GENDER_LABEL, METHOD_LABEL, downloadBlob, fmtDate, fmtDateTime, fmtMoney, daysLeftText, memberStatus, toCSV, CONTRACT_STATUS } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { QRImage } from '../components/QRImage'
import { FaceModal, type FaceResult } from '../components/FaceModal'
import { MemberAvatar } from '../components/MemberAvatar'
import { BranchTag, Button, Chip, DataTable, Field, Icon, Input, PageHeader, Select, useToast, type Column } from '../components/ui'
import type { Branch, CheckinItem, Contract, Gender, ListResp, Member, MemberStatus, Payment } from '../types'

const PAGE = 100
const MAX_PAGES = 20
const STATUS_OPTIONS = ['Còn hạn', 'Sắp hết hạn', 'Hết hạn', 'Bảo lưu', 'Chưa kích hoạt', 'Chờ ký', 'Đã hủy']

export function statusOf(m: Member) {
  if (m.current_contract !== undefined) return memberStatus(m.current_contract)
  if (m.status === 'active') return { label: 'Còn hạn', tone: 'ok' as const }
  if (m.status === 'expired') return { label: 'Hết hạn', tone: 'bad' as const }
  return { label: 'Bảo lưu', tone: 'neutral' as const }
}

async function fetchAll<T>(url: string, params: Record<string, unknown>): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await api.get<ListResp<T>>(url, { params: { ...params, page, limit: PAGE } })
    out.push(...data.data)
    if (out.length >= data.meta.total || data.data.length === 0) break
  }
  return out
}

export default function Members() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [profile, setProfile] = useState<Member | null>(null)
  const [editing, setEditing] = useState<Member | 'new' | null>(null)

  useEffect(() => setQ(urlQ), [urlQ])

  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== urlQ) setParams(q ? { q } : {}, { replace: true })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchAll<Member>('/members', { q: urlQ || undefined, branch_id: branchId ?? undefined }))
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [urlQ, branchId])

  useEffect(() => {
    load()
  }, [load])

  const branchOf = useCallback((m: Member): Branch | undefined => m.branch ?? user?.branches.find((b) => b.id === m.branch_id), [user])
  const filtered = useMemo(() => (status ? rows.filter((m) => statusOf(m).label === status) : rows), [rows, status])

  const exportCsv = () => {
    const head = ['Mã', 'Họ tên', 'Số điện thoại', 'Giới tính', 'Trạng thái', 'Ngày đăng ký', 'Chi nhánh', 'Gói hiện tại', 'Mã hợp đồng', 'Hết hạn']
    const body = filtered.map((m) => [
      m.code, m.name, m.phone, m.gender ? GENDER_LABEL[m.gender] : '', statusOf(m).label, fmtDate(m.created_at), branchOf(m)?.name ?? '',
      m.current_contract?.package_name ?? '', m.current_contract?.code ?? '', fmtDate(m.current_contract?.end_date),
    ])
    downloadBlob(new Blob(['﻿' + toCSV([head, ...body])], { type: 'text/csv;charset=utf-8' }), 'hoi-vien.csv')
  }

  const columns: Column<Member>[] = [
    { key: 'code', header: 'Mã', sortValue: (m) => m.code, render: (m) => <><div className="cell-main">{m.code}</div>{m.face_id && <div className="cell-sub">{m.face_id}</div>}</> },
    {
      key: 'name', header: 'Thông tin khách hàng', sortValue: (m) => m.name,
      render: (m) => (
        <div className="cell-person">
          <MemberAvatar member={m} />
          <div><div className="cell-main">{m.name}</div><div className="cell-sub">{m.phone}{m.gender ? ` · ${GENDER_LABEL[m.gender]}` : ''}</div></div>
        </div>
      ),
    },
    { key: 'status', header: 'Trạng thái', sortValue: (m) => statusOf(m).label, render: (m) => { const s = statusOf(m); return <Chip tone={s.tone}>{s.label}</Chip> } },
    { key: 'created', header: 'Ngày đăng ký', sortValue: (m) => m.created_at, render: (m) => fmtDate(m.created_at) },
    { key: 'branch', header: 'Chi nhánh', sortValue: (m) => branchOf(m)?.name, render: (m) => <BranchTag branch={branchOf(m)} /> },
    {
      key: 'pkg', header: 'Gói hiện tại', sortValue: (m) => m.current_contract?.package_name,
      render: (m) => (m.current_contract ? <><div className="cell-main">{m.current_contract.package_name}</div><div className="cell-sub">{m.current_contract.code}</div></> : <span className="hint-muted">-</span>),
    },
    {
      key: 'end', header: 'Hết hạn', numeric: true, sortValue: (m) => m.current_contract?.end_date,
      render: (m) => (m.current_contract?.end_date ? <><div className="cell-main">{fmtDate(m.current_contract.end_date)}</div><div className="cell-sub">{daysLeftText(m.current_contract.end_date)}</div></> : <span className="hint-muted">-</span>),
    },
  ]

  return (
    <>
      <PageHeader
        title="Hội viên"
        action={
          <>
            <RequirePermission permission="members.create"><Button onClick={() => setEditing('new')}>Thêm hội viên</Button></RequirePermission>
            <RequirePermission permission="contracts.create"><Button variant="primary" onClick={() => nav('/contracts/new')}>Tạo hợp đồng mới</Button></RequirePermission>
          </>
        }
      />
      <div className="toolbar">
        <input className="input" type="search" placeholder="Tìm tên, SĐT, mã hội viên" aria-label="Tìm hội viên" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <div className="grow">
          <span className="hint-muted">{filtered.length} hội viên</span>
          <Button onClick={exportCsv} disabled={filtered.length === 0}><Icon name="download" size={16} />Xuất CSV</Button>
        </div>
      </div>
      <div className="card">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(m) => m.id}
          onRowClick={setProfile}
          selectable
          selected={selected}
          onSelectionChange={setSelected}
          defaultSort={undefined}
          loading={loading}
          error={error}
          emptyText="Không có hội viên phù hợp"
          itemLabel="hội viên"
        />
      </div>
      {profile && (
        <MemberProfile
          member={profile}
          canEdit={can('members.update')}
          onEdit={() => { setEditing(profile); setProfile(null) }}
          onUpdated={(m) => {
            setProfile((p) => (p ? { ...p, ...m, current_contract: m.current_contract ?? p.current_contract, branch: m.branch ?? p.branch } : p))
            setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, ...m, current_contract: m.current_contract ?? r.current_contract, branch: m.branch ?? r.branch } : r)))
          }}
          onClose={() => setProfile(null)}
        />
      )}
      {editing && (
        <MemberModal
          member={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('Đã lưu hội viên')
            load()
          }}
        />
      )}
    </>
  )
}

interface ProfileData { contracts: Contract[]; payments: Payment[]; checkins: CheckinItem[] }

function MemberProfile({ member, canEdit, onEdit, onUpdated, onClose }: { member: Member; canEdit: boolean; onEdit: () => void; onUpdated: (m: Member) => void; onClose: () => void }) {
  const { user } = useAuth()
  const { can } = usePermission()
  const [data, setData] = useState<ProfileData | null>(null)
  const [error, setError] = useState('')
  const [faceOpen, setFaceOpen] = useState(false)
  const branch = member.branch ?? user?.branches.find((b) => b.id === member.branch_id)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const contracts = can('contracts.read') ? (await api.get<ListResp<Contract>>('/contracts', { params: { member_id: member.id, page: 1, limit: 50 } })).data.data : []
        const payments = can('payments.read')
          ? (await Promise.all(contracts.slice(0, 10).map((c) => api.get<ListResp<Payment>>('/payments', { params: { contract_id: c.id, page: 1, limit: 50 } }).then((r) => r.data.data.map((p) => ({ ...p, contract: { id: c.id, code: c.code, member: { name: member.name } } })))))).flat()
          : []
        const checkins = can('checkins.read') ? (await api.get<ListResp<CheckinItem>>('/checkins', { params: { member_id: member.id, page: 1, limit: 5 } })).data.data : []
        if (alive) setData({ contracts, payments: payments.sort((a, b) => b.created_at.localeCompare(a.created_at)), checkins })
      } catch (e) {
        if (alive) setError(apiError(e).message)
      }
    })()
    return () => {
      alive = false
    }
  }, [member.id, member.name, can])

  const saveFace = async (r: FaceResult) => {
    let m = member
    if (r.photo) {
      m = { ...m, ...(await api.put(`/members/${member.id}/photo`, { content_type: r.photo.content_type, image_base64: r.photo.image_base64 })).data.data }
      onUpdated(m)
    }
    const nf = r.faceId || null
    if ((member.face_id ?? null) !== nf) onUpdated({ ...m, ...(await api.patch(`/members/${member.id}`, { face_id: nf })).data.data })
  }

  const pkgOf = (c: Contract) => `${c.code}, ${c.package.name}`
  return (
    <>
    <Modal
      title={member.name}
      size="large"
      onClose={onClose}
      footer={<>{canEdit && <Button onClick={onEdit}>Sửa thông tin</Button>}<Button onClick={onClose}>Đóng</Button></>}
    >
      <div className="profile-head">
        <div className="profile-photo"><MemberAvatar member={member} size={120} /></div>
        <dl className="kv">
          <dt>Mã hội viên</dt><dd>{member.code}</dd>
          <dt>Điện thoại</dt><dd>{member.phone}</dd>
          <dt>Giới tính</dt><dd>{member.gender ? GENDER_LABEL[member.gender] : '-'}</dd>
          <dt>Chi nhánh</dt><dd><BranchTag branch={branch} /></dd>
          <dt>Ngày tham gia</dt><dd>{fmtDate(member.created_at)}</dd>
          <dt>Face ID</dt><dd>{member.face_id ?? 'Chưa đăng ký'}</dd>
          {member.email && <><dt>Email</dt><dd>{member.email}</dd></>}
        </dl>
        <div className="qr-box"><QRImage text={member.code} size={110} /></div>
      </div>
      {canEdit && <div style={{ marginBottom: 8 }}><Button onClick={() => setFaceOpen(true)}>Chụp ảnh, đăng ký khuôn mặt</Button></div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data && !error && <div className="hint-muted">Đang tải...</div>}
      {data && (
        <>
          <h3 className="prof-sec">Hợp đồng</h3>
          {data.contracts.length === 0 && <div className="hint-muted">Chưa có hợp đồng</div>}
          {data.contracts.map((c) => {
            const st = memberStatus({ status: c.status, end_date: c.end_date })
            return (
              <div key={c.id} className="prof-row">
                <div>
                  <Link to={`/contracts/${c.id}`}>{pkgOf(c)}</Link>
                  <div className="cell-sub">{fmtDate(c.start_date)} đến {fmtDate(c.end_date)}</div>
                </div>
                <Chip tone={st.tone}>{c.status === 'active' ? st.label : CONTRACT_STATUS[c.status].label}</Chip>
              </div>
            )
          })}
          {data.contracts.length > 0 && (
            <>
              <h3 className="prof-sec">Công nợ theo hợp đồng</h3>
              {data.contracts.map((c) => (
                <div key={c.id} className="prof-row">
                  <div>
                    <div>{pkgOf(c)}</div>
                    {c.last_payment_method && <div className="cell-sub">{METHOD_LABEL[c.last_payment_method]}</div>}
                  </div>
                  <div className="num">{fmtMoney(c.paid_amount)} / {fmtMoney(c.total_amount)}{c.debt_amount > 0 && <div className="cell-sub text-bad">Còn nợ {fmtMoney(c.debt_amount)}</div>}</div>
                </div>
              ))}
            </>
          )}
          {can('payments.read') && (
            <>
              <h3 className="prof-sec">Lịch sử thanh toán ({data.payments.length} khoản)</h3>
              {data.payments.length === 0 && <div className="hint-muted">Chưa có thanh toán</div>}
              {data.payments.map((p) => (
                <div key={p.id} className="prof-row">
                  <div>
                    <div>{fmtDate(p.created_at)}, {p.contract?.code}</div>
                    <div className="cell-sub">{METHOD_LABEL[p.method]}</div>
                  </div>
                  <div className="num">{fmtMoney(p.amount)}</div>
                </div>
              ))}
            </>
          )}
          {can('checkins.read') && (
            <>
              <h3 className="prof-sec">Check-in gần đây</h3>
              {data.checkins.length === 0 && <div className="hint-muted">Chưa có lượt check-in</div>}
              {data.checkins.map((c) => (
                <div key={c.id} className="prof-row">
                  <span>{fmtDateTime(c.checked_in_at ?? c.created_at)}</span>
                  <Chip tone={c.result === 'allowed' ? 'ok' : 'bad'}>{c.result === 'allowed' ? 'Cho vào' : 'Từ chối'}</Chip>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Modal>
    {faceOpen && <FaceModal member={member} initialFaceId={member.face_id ?? ''} onSave={saveFace} onClose={() => setFaceOpen(false)} />}
    </>
  )
}

interface FormState { name: string; phone: string; email: string; gender: Gender | ''; dob: string; status: MemberStatus; branch_id: string }

export function MemberModal({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: (m?: Member) => void }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const branches = user?.branches ?? []
  const [f, setF] = useState<FormState>({
    name: member?.name ?? '',
    phone: member?.phone ?? '',
    email: member?.email ?? '',
    gender: member?.gender ?? '',
    dob: member?.dob?.slice(0, 10) ?? '',
    status: member?.status ?? 'active',
    branch_id: member?.branch_id ?? branchId ?? branches[0]?.id ?? '',
  })
  const [errs, setErrs] = useState<{ phone?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrs({})
    const body = { ...f, email: f.email || null, gender: f.gender || null, dob: f.dob || null }
    try {
      if (member) {
        const r = await api.patch(`/members/${member.id}`, body)
        onSaved(r.data.data)
      } else {
        const r = await api.post('/members', body)
        onSaved(r.data.data)
      }
    } catch (err) {
      const a = apiError(err)
      if (a.status === 409 || a.code.includes('PHONE') || a.code.includes('DUPLICATE')) setErrs({ phone: 'Số điện thoại đã tồn tại' })
      else setErrs({ form: a.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={member ? 'Sửa hội viên' : 'Thêm hội viên'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="member-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
        </>
      }
    >
      <form id="member-form" className="form-grid" onSubmit={submit}>
        {errs.form && <div className="form-error full" role="alert">{errs.form}</div>}
        <Field label="Họ tên" htmlFor="m-name" full>
          <Input id="m-name" required value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Số điện thoại" htmlFor="m-phone" error={errs.phone}>
          <Input id="m-phone" type="tel" inputMode="tel" required invalid={!!errs.phone} value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="m-email">
          <Input id="m-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Giới tính" htmlFor="m-gender">
          <Select id="m-gender" value={f.gender} onChange={(e) => set('gender', e.target.value as Gender | '')}>
            <option value="">Chưa chọn</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
            <option value="other">Khác</option>
          </Select>
        </Field>
        <Field label="Ngày sinh" htmlFor="m-dob">
          <Input id="m-dob" type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} />
        </Field>
        <Field label="Trạng thái" htmlFor="m-status">
          <Select id="m-status" value={f.status} onChange={(e) => set('status', e.target.value as MemberStatus)}>
            <option value="active">Đang hiệu lực</option>
            <option value="expired">Hết hạn</option>
            <option value="frozen">Tạm dừng</option>
          </Select>
        </Field>
        {member && (
          <div className="full qr-box">
            <QRImage text={member.code} size={140} />
            <div>
              <b>Mã QR check-in</b>
              <div className="hint-muted">{member.code}</div>
              <Button small onClick={() => window.print()}>In mã</Button>
            </div>
          </div>
        )}
        <Field label="Chi nhánh" htmlFor="m-branch">
          <Select id="m-branch" required value={f.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}
