import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { downloadBlob, fmtDate, fmtMoney } from '../lib/format'
import { currentMonth, millions } from '../lib/payroll'
import { STAFF_GROUPS, STAFF_POSITIONS, STAFF_POSITION_LABEL, dash, delta, fmtRate, inGroup, isPt, monthLabel, monthShort, shiftMonth, staffCsv, staffTotals, type Delta, type StaffGroup } from '../lib/staff'
import { activeBranches } from '../lib/branches'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { ConfirmDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { Button, Chip, DataTable, Field, Input, Kpi, KpiRow, PageHeader, Panel, Segmented, Select, Textarea, type Column } from '../components/ui'
import type { StaffDetail, StaffForm, StaffList, StaffPosition, StaffRow, StaffTrendPoint } from '../types'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function DeltaText({ d }: { d: Delta | null }) {
  if (!d) return null
  return <span className={d.tone === 'ok' ? 'delta-ok' : d.tone === 'bad' ? 'delta-bad' : 'delta-flat'}>{d.text}</span>
}

function SummaryCard({ value, label, d }: { value: ReactNode; label: string; d: Delta | null }) {
  return (
    <div className="kpi2">
      <div className="kpi2-value">{value}</div>
      <div className="kpi2-label">{label}</div>
      <div className="kpi2-note">{d ? <><DeltaText d={d} /> so với tháng trước</> : 'Chưa có số liệu tháng trước'}</div>
    </div>
  )
}

export default function Staff() {
  const { can } = usePermission()
  const { branchId } = useBranch()
  const toast = useToast()
  const manage = can('staff.manage')
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<StaffList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [group, setGroup] = useState<StaffGroup>('all')
  const [showLeft, setShowLeft] = useState(false)
  const [detail, setDetail] = useState<StaffRow | null>(null)
  const [form, setForm] = useState<StaffRow | 'new' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: r } = await api.get<{ data: StaffList }>('/staff', { params: { month, branch_id: branchId ?? undefined } })
      setData(r.data)
    } catch (e) {
      setError(apiError(e).message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month, branchId])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => inGroup(r.position, group) && (showLeft || r.active)), [data, group, showLeft])
  const t = useMemo(() => staffTotals(rows), [rows])
  const hasLeft = !!data?.rows.some((r) => !r.active)

  const cols: Column<StaffRow>[] = [
    {
      key: 'name', header: 'Nhân viên', sortValue: (r) => r.name,
      render: (r) => (
        <>
          <span className="cell-main">{r.name}</span>
          <div className="cell-sub">{r.phone ?? 'Chưa có số điện thoại'}</div>
          <span className="staff-chips"><Chip>{STAFF_POSITION_LABEL[r.position]}</Chip>{!r.active && <Chip tone="warn">Đã nghỉ</Chip>}</span>
        </>
      ),
    },
    {
      key: 'contracts', header: 'Hợp đồng', numeric: true, sortValue: (r) => r.kpi.contracts_sold,
      render: (r) => (r.kpi.contracts_sold ? <>{r.kpi.contracts_sold}<div className="cell-sub">{r.kpi.member_contracts} member, {r.kpi.pt_contracts} PT</div></> : '-'),
    },
    { key: 'new', header: 'Khách mới', numeric: true, sortValue: (r) => r.kpi.new_customers, render: (r) => dash(r.kpi.new_customers) },
    {
      key: 'revenue', header: 'Doanh số', numeric: true, sortValue: (r) => r.kpi.revenue,
      render: (r) => (r.kpi.revenue || r.prev.revenue ? <><b>{fmtMoney(r.kpi.revenue)}</b><div className="cell-sub"><DeltaText d={delta(r.kpi.revenue, r.prev.revenue)} /></div></> : '-'),
    },
    { key: 'rank', header: 'Xếp hạng', numeric: true, sortValue: (r) => r.rank.revenue ?? 999, render: (r) => (r.rank.revenue ? `#${r.rank.revenue}` : '-') },
    { key: 'clients', header: 'Khách phụ trách', numeric: true, sortValue: (r) => (isPt(r.position) ? r.kpi.active_clients : -1), render: (r) => (isPt(r.position) ? dash(r.kpi.active_clients) : '-') },
    {
      key: 'sessions', header: 'Buổi dạy', numeric: true, sortValue: (r) => (isPt(r.position) ? r.kpi.sessions_taught : -1),
      render: (r) => (isPt(r.position) && (r.kpi.sessions_taught || r.kpi.group_classes) ? <>{r.kpi.sessions_taught}<div className="cell-sub">{r.kpi.group_classes} lớp nhóm</div></> : '-'),
    },
    {
      key: 'done', header: 'Hoàn thành', numeric: true, sortValue: (r) => (isPt(r.position) ? r.kpi.session_done_rate ?? -1 : -2),
      render: (r) => (isPt(r.position) && r.kpi.session_done_rate != null ? <>{fmtRate(r.kpi.session_done_rate)}<div className="cell-sub">vắng {fmtRate(r.kpi.no_show_rate)}</div></> : '-'),
    },
    { key: 'left', header: 'Tồn buổi', numeric: true, sortValue: (r) => (isPt(r.position) ? r.kpi.sessions_left_total : -1), render: (r) => (isPt(r.position) ? dash(r.kpi.sessions_left_total) : '-') },
    { key: 'exp', header: 'Sắp hết hạn 30 ngày', numeric: true, sortValue: (r) => (isPt(r.position) ? r.kpi.expiring_30 : -1), render: (r) => (isPt(r.position) ? dash(r.kpi.expiring_30) : '-') },
    { key: 'renew', header: 'Tái ký', numeric: true, sortValue: (r) => (isPt(r.position) ? r.kpi.renewal_rate ?? -1 : -2), render: (r) => (isPt(r.position) ? fmtRate(r.kpi.renewal_rate) : '-') },
    { key: 'debt', header: 'Còn nợ', numeric: true, sortValue: (r) => r.kpi.debt_outstanding, render: (r) => (r.kpi.debt_outstanding ? <span className="text-bad">{fmtMoney(r.kpi.debt_outstanding)}</span> : '-') },
    {
      key: 'act', header: '',
      render: (r) => (manage ? <Button small onClick={(e) => { e.stopPropagation(); setForm(r) }}>Sửa</Button> : null),
    },
  ]

  const exportCsv = () => downloadBlob(new Blob(['﻿' + staffCsv(rows)], { type: 'text/csv;charset=utf-8' }), `nhan-vien-${month}.csv`)

  return (
    <>
      <PageHeader
        title="Nhân viên"
        sub="Hồ sơ nhân sự và chỉ số kinh doanh theo tháng. Tài khoản đăng nhập quản lý ở Thiết lập."
        action={
          <div className="staff-actions">
            <Button small aria-label="Tháng trước" onClick={() => setMonth(shiftMonth(month, -1))}>‹</Button>
            <Input aria-label="Chọn tháng" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            <Button small aria-label="Tháng sau" onClick={() => setMonth(shiftMonth(month, 1))}>›</Button>
            <Button onClick={exportCsv} disabled={!rows.length}>Xuất CSV</Button>
            {manage && <Button variant="primary" onClick={() => setForm('new')}>Thêm nhân viên</Button>}
          </div>
        }
      />
      <KpiRow>
        <SummaryCard value={t.contracts} label={`Hợp đồng ${monthLabel(month).toLowerCase()}`} d={delta(t.contracts, t.pContracts)} />
        <SummaryCard value={fmtMoney(t.revenue)} label="Doanh số thực thu" d={delta(t.revenue, t.pRevenue)} />
        <SummaryCard value={t.customers} label="Khách phát sinh mới" d={delta(t.customers, t.pCustomers)} />
        <SummaryCard value={t.sessions} label="Buổi PT đã dạy" d={delta(t.sessions, t.pSessions)} />
      </KpiRow>
      <div className="staff-filters">
        <Segmented<StaffGroup> ariaLabel="Nhóm nhân viên" options={STAFF_GROUPS} value={group} onChange={setGroup} />
        {hasLeft && (
          <label className="check"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> Hiện nhân viên đã nghỉ</label>
        )}
      </div>
      <div className="card">
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.user_id}
          onRowClick={setDetail}
          defaultSort={{ key: 'revenue', dir: 'desc' }}
          loading={loading}
          error={error}
          emptyText="Chưa có nhân viên nào trong nhóm này"
          itemLabel="nhân viên"
          pageSize={100}
          hidePager
        />
      </div>
      {detail && <DetailModal row={detail} month={month} manage={manage} onClose={() => setDetail(null)} onEdit={() => { const r = detail; setDetail(null); setForm(r) }} />}
      {form && <StaffFormModal staff={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(msg) => { setForm(null); toast(msg); load() }} />}
    </>
  )
}

function TrendChart({ title, points, pick, money }: { title: string; points: StaffTrendPoint[]; pick: (p: StaffTrendPoint) => number; money?: boolean }) {
  const values = points.map(pick)
  const max = Math.max(1, ...values)
  const W = 360
  const H = 120
  const slot = W / Math.max(1, points.length)
  const fmt = (n: number) => (money ? millions(n) : String(n))
  const label = `${title}: ${points.map((p, i) => `${monthShort(p.month)} ${fmt(values[i])}`).join('; ')}`
  return (
    <figure className="staff-trend">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 34}`} role="img" aria-label={label}>
        <title>{label}</title>
        {points.map((p, i) => {
          const h = Math.round((values[i] / max) * H)
          const x = i * slot + slot * 0.2
          return (
            <g key={p.month}>
              <rect x={x} y={H - h + 14} width={slot * 0.6} height={Math.max(h, values[i] ? 2 : 0)} rx="3" fill={money ? 'var(--c3)' : 'var(--c2)'} />
              <text x={x + slot * 0.3} y={H - h + 10} textAnchor="middle" fontSize="10" fill="var(--muted)">{values[i] ? fmt(values[i]) : ''}</text>
              <text x={x + slot * 0.3} y={H + 30} textAnchor="middle" fontSize="11" fill="var(--muted)">{monthShort(p.month)}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

function DetailModal({ row, month, manage, onClose, onEdit }: { row: StaffRow; month: string; manage: boolean; onClose: () => void; onEdit: () => void }) {
  const [d, setD] = useState<StaffDetail | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    setD(null)
    setErr('')
    api.get<{ data: StaffDetail }>(`/staff/${row.user_id}`, { params: { month } })
      .then((r) => { if (alive) setD(r.data.data) })
      .catch((e) => { if (alive) setErr(apiError(e).message) })
    return () => { alive = false }
  }, [row.user_id, month])

  const s = d?.staff ?? row
  const k = s.kpi
  const pt = isPt(s.position)
  return (
    <Modal
      title={`${s.name} - ${monthLabel(month)}`}
      size="large"
      onClose={onClose}
      footer={<>{manage && <Button onClick={onEdit}>Sửa hồ sơ</Button>}<Button variant="primary" onClick={onClose}>Đóng</Button></>}
    >
      <div className="staff-head">
        <Chip>{STAFF_POSITION_LABEL[s.position]}</Chip>
        {!s.active && <Chip tone="warn">Đã nghỉ</Chip>}
        {s.branches.map((b) => <Chip key={b.id}>{b.name}</Chip>)}
        {s.phone && <span className="cell-sub">{s.phone}</span>}
        {s.hired_on && <span className="cell-sub">Vào làm {fmtDate(s.hired_on)}</span>}
        {s.employee_no && <span className="cell-sub">Mã chấm công {s.employee_no}</span>}
      </div>
      {s.note && <p className="cell-sub">{s.note}</p>}
      {err && <div className="form-error" role="alert">{err}</div>}
      <KpiRow>
        <Kpi value={k.contracts_sold} label="Hợp đồng" note={`${k.member_contracts} member, ${k.pt_contracts} PT`} />
        <Kpi value={k.new_customers} label="Khách mới" />
        <Kpi value={fmtMoney(k.revenue)} label="Doanh số thực thu" note={`Member ${fmtMoney(k.member_revenue)}, PT ${fmtMoney(k.pt_revenue)}`} />
        <Kpi value={fmtMoney(k.avg_contract_value)} label="Giá trị HĐ trung bình" />
        <Kpi value={fmtMoney(k.debt_outstanding)} label="Còn nợ" />
      </KpiRow>
      {pt && (
        <Panel title="Chỉ số huấn luyện">
          <KpiRow>
            <Kpi value={k.active_clients} label="Khách đang phụ trách" />
            <Kpi value={k.sessions_taught} label="Buổi 1-1 đã dạy" note={`${k.group_classes} lớp nhóm`} />
            <Kpi value={fmtRate(k.session_done_rate)} label="Tỷ lệ hoàn thành" note={`Vắng ${fmtRate(k.no_show_rate)}`} />
            <Kpi value={k.sessions_left_total} label="Tồn buổi của khách" />
            <Kpi value={k.expiring_30} label="Sắp hết hạn 30 ngày" />
            <Kpi value={fmtRate(k.renewal_rate)} label="Tỷ lệ tái ký" />
          </KpiRow>
        </Panel>
      )}
      {!d && !err && <p className="cell-sub">Đang tải...</p>}
      {d && (
        <>
          <Panel title="6 tháng gần nhất">
            <div className="staff-trends">
              <TrendChart title="Doanh số" points={d.trend} pick={(p) => p.revenue} money />
              <TrendChart title="Hợp đồng" points={d.trend} pick={(p) => p.contracts_sold} />
              {pt && <TrendChart title="Buổi dạy" points={d.trend} pick={(p) => p.sessions_taught} />}
            </div>
          </Panel>
          {pt && (
            <Panel title="Khách đang phụ trách" count={`${d.clients.length} khách`} flush>
              <DataTable
                columns={[
                  { key: 'm', header: 'Khách', sortValue: (c) => c.member_name, render: (c) => <><span className="cell-main">{c.member_name}</span><div className="cell-sub">{c.member_code}</div></> },
                  { key: 'p', header: 'Gói', sortValue: (c) => c.package_name, render: (c) => c.package_name },
                  { key: 'c', header: 'Hợp đồng', render: (c) => c.contract_code },
                  { key: 'l', header: 'Còn lại', numeric: true, sortValue: (c) => c.sessions_left ?? -1, render: (c) => (c.sessions_left == null ? '-' : `${c.sessions_left} buổi`) },
                  { key: 'e', header: 'Hết hạn', sortValue: (c) => c.end_date ?? '', render: (c) => fmtDate(c.end_date) },
                ]}
                rows={d.clients}
                rowKey={(c) => `${c.member_id}-${c.contract_code}`}
                emptyText="Chưa có khách phụ trách"
                itemLabel="khách"
                pageSize={10}
                pageSizes={[10, 25]}
              />
            </Panel>
          )}
          <Panel title={`Hợp đồng ${monthLabel(month).toLowerCase()}`} count={`${d.contracts.length} hợp đồng`} flush>
            <DataTable
              columns={[
                { key: 'code', header: 'Mã HĐ', sortValue: (c) => c.code, render: (c) => <Link to={`/contracts/${c.id}`}>{c.code}</Link> },
                { key: 'm', header: 'Hội viên', sortValue: (c) => c.member_name, render: (c) => c.member_name },
                { key: 'p', header: 'Dịch vụ', render: (c) => c.package_name },
                { key: 'r', header: 'Vai trò', render: (c) => <Chip>{c.role === 'sale' ? 'Sale' : 'PT'}</Chip> },
                { key: 't', header: 'Giá trị', numeric: true, sortValue: (c) => c.total_amount, render: (c) => fmtMoney(c.total_amount) },
                { key: 'd', header: 'Đã thu', numeric: true, sortValue: (c) => c.paid_amount, render: (c) => fmtMoney(c.paid_amount) },
              ]}
              rows={d.contracts}
              rowKey={(c) => `${c.id}-${c.role}`}
              emptyText="Không có hợp đồng trong tháng này"
              itemLabel="hợp đồng"
              pageSize={10}
              pageSizes={[10, 25]}
            />
          </Panel>
        </>
      )}
    </Modal>
  )
}

function StaffFormModal({ staff, onClose, onSaved }: { staff: StaffRow | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const branches = useMemo(() => activeBranches(user?.branches), [user])
  const [f, setF] = useState<StaffForm>({
    name: staff?.name ?? '',
    phone: staff?.phone ?? '',
    position: staff?.position ?? 'pt_fulltime',
    branch_id: staff?.branches[0]?.id ?? branchId ?? (branches.length === 1 ? branches[0].id : ''),
    hired_on: staff?.hired_on ?? '',
    employee_no: staff?.employee_no ?? '',
    note: staff?.note ?? '',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const set = (p: Partial<StaffForm>) => setF((x) => ({ ...x, ...p }))
  const phoneBad = !!f.phone.trim() && !/^\+?\d{9,12}$/.test(f.phone.replace(/[\s.-]/g, ''))

  const payload = () => ({
    name: f.name.trim(),
    phone: f.phone.trim() || null,
    position: f.position,
    branch_id: f.branch_id,
    hired_on: f.hired_on || null,
    employee_no: f.employee_no.trim() || null,
    note: f.note.trim() || null,
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim() || !f.branch_id || phoneBad) return
    setBusy(true)
    setErr('')
    try {
      if (staff) await api.put(`/staff/${staff.user_id}`, payload())
      else await api.post('/staff', payload())
      onSaved(staff ? 'Đã lưu hồ sơ nhân viên' : 'Đã thêm nhân viên')
    } catch (er) {
      setErr(apiError(er).message)
    } finally {
      setBusy(false)
    }
  }

  const setActive = async (active: boolean) => {
    if (!staff) return
    setBusy(true)
    setErr('')
    try {
      await api.put(`/staff/${staff.user_id}`, active ? { active: true, left_on: null } : { active: false, left_on: todayIso() })
      onSaved(active ? 'Đã cho nhân viên làm lại' : 'Đã chuyển nhân viên sang nghỉ việc')
    } catch (er) {
      setErr(apiError(er).message)
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        title={staff ? `Sửa hồ sơ - ${staff.name}` : 'Thêm nhân viên'}
        onClose={onClose}
        footer={
          <>
            {staff && staff.active && <Button variant="danger" onClick={() => setConfirm(true)} disabled={busy}>Nghỉ việc</Button>}
            {staff && !staff.active && <Button onClick={() => setActive(true)} disabled={busy}>Làm lại</Button>}
            <Button onClick={onClose} disabled={busy}>Hủy</Button>
            <Button variant="primary" type="submit" form="staff-form" disabled={busy || !f.name.trim() || !f.branch_id || phoneBad}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
          </>
        }
      >
        <form id="staff-form" onSubmit={submit}>
          {err && <div className="form-error" role="alert">{err}</div>}
          <div className="form-grid">
            <Field label="Họ và tên" htmlFor="sf-name" hint="Nhập đầy đủ họ và tên, ví dụ Nguyễn Văn Khánh." full><Input id="sf-name" value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Số điện thoại" htmlFor="sf-phone" error={phoneBad ? 'Số điện thoại chưa đúng' : undefined}>
              <Input id="sf-phone" inputMode="tel" invalid={phoneBad} value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="Vị trí" htmlFor="sf-pos">
              <Select id="sf-pos" value={f.position} onChange={(e) => set({ position: e.target.value as StaffPosition })}>
                {STAFF_POSITIONS.map((p) => <option key={p} value={p}>{STAFF_POSITION_LABEL[p]}</option>)}
              </Select>
            </Field>
            <Field label="Chi nhánh" htmlFor="sf-branch">
              <Select id="sf-branch" value={f.branch_id} onChange={(e) => set({ branch_id: e.target.value })}>
                <option value="">Chọn chi nhánh</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Ngày vào làm" htmlFor="sf-hired"><Input id="sf-hired" type="date" value={f.hired_on} onChange={(e) => set({ hired_on: e.target.value })} /></Field>
            <Field label="Mã chấm công" htmlFor="sf-emp" hint="Trùng Employee No khi đăng ký khuôn mặt trên máy chấm công. Để trống nếu chưa có." full>
              <Input id="sf-emp" value={f.employee_no} onChange={(e) => set({ employee_no: e.target.value })} />
            </Field>
            <Field label="Ghi chú" htmlFor="sf-note" full><Textarea id="sf-note" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
          </div>
        </form>
      </Modal>
      {confirm && staff && (
        <ConfirmDialog
          title="Nghỉ việc"
          message={`Chuyển ${staff.name} sang nghỉ việc? Nhân viên sẽ biến khỏi ô chọn PT và Sale, lịch sử hợp đồng và lương được giữ nguyên.`}
          confirmLabel="Nghỉ việc"
          danger
          busy={busy}
          onConfirm={() => setActive(false)}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  )
}
