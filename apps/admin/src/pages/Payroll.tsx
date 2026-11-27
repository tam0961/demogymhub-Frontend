import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtMoney } from '../lib/format'
import { POSITIONS, POSITION_LABEL, currentMonth, pct, } from '../lib/payroll'
import { usePermission } from '../context/usePermission'
import { useBranch } from '../context/BranchContext'
import { ConfirmDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { Button, Chip, DataTable, Field, Input, Kpi, KpiRow, MoneyInput, PageHeader, Panel, Segmented, Select, Textarea, type Column } from '../components/ui'
import { PtStatsSection } from './PtStats'
import type { PayrollPosition, PayrollPreview, PayrollProfile, PayrollRow, PayrollSettings, PayrollStaff, PayrollTier } from '../types'

const DEFAULT_PROFILE: PayrollProfile = { position: 'other', base_salary: 0, has_insurance: true, tax_mode: 'progressive', dependents: 0, active: false }

function parseNum(s: string): number {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function NumInput({ id, value, onChange, label }: { id?: string; value: number; onChange: (n: number) => void; label?: string }) {
  const [text, setText] = useState(String(value).replace('.', ','))
  useEffect(() => {
    if (parseNum(text) !== value) setText(String(value).replace('.', ','))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <Input id={id} aria-label={label} inputMode="decimal" value={text} onChange={(e) => { setText(e.target.value); onChange(parseNum(e.target.value)) }} />
}

const positionDefaults = (position: PayrollPosition): Partial<PayrollProfile> => {
  if (position === 'pt_parttime') return { position, has_insurance: false, tax_mode: 'flat10', dependents: 0, active: true }
  if (position === 'pt_fulltime' || position === 'marketing') return { position, has_insurance: true, tax_mode: 'progressive', dependents: 0, active: true }
  if (position === 'sale') return { position, has_insurance: false, tax_mode: 'none', dependents: 0, active: true }
  return { position, has_insurance: false, tax_mode: 'none', dependents: 0, active: false }
}

type PayrollTab = 'sheet' | 'settings'

export default function Payroll() {
  const { can } = usePermission()
  const [tab, setTab] = useState<PayrollTab>('sheet')
  const canManage = can('payroll.manage')
  return (
    <>
      <PageHeader
        title="Lương nhân viên"
        sub="Bảng lương theo tháng và cài đặt, chỉ chủ xem"
        action={<Segmented<PayrollTab> ariaLabel="Chọn mục" options={[{ value: 'sheet', label: 'Bảng lương' }, { value: 'settings', label: 'Cài đặt lương' }]} value={tab} onChange={setTab} />}
      />
      {tab === 'sheet' && <SheetTab canManage={canManage} />}
      {tab === 'settings' && <SettingsTab canManage={canManage} />}
    </>
  )
}

type MoneyKey = 'base_salary' | 'member_commission' | 'marketing_commission' | 'pt_immediate' | 'pt_session_pay' | 'group_pay' | 'gross' | 'insurance' | 'tax' | 'penalty' | 'adjustment' | 'net'

function SheetTab({ canManage }: { canManage: boolean }) {
  const toast = useToast()
  const { branchId } = useBranch()
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<PayrollPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<PayrollRow | null>(null)
  const [closing, setClosing] = useState<'close' | 'reopen' | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: r } = await api.get<{ data: PayrollPreview }>('/payroll/preview', { params: { month, branch_id: branchId ?? undefined } })
      setData(r.data)
    } catch (e) {
      setError(apiError(e).message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month, branchId])
  useEffect(() => { load() }, [load])

  const closed = data?.status === 'closed'
  const pending = !!data?.rows.some((r) => r.tax_pending)

  const money = (key: MoneyKey) => (r: PayrollRow) => (r[key] ? fmtMoney(r[key]) : '-')
  const cols: Column<PayrollRow>[] = [
    { key: 'name', header: 'Nhân viên', sortValue: (r) => r.name, render: (r) => <><span className="cell-main">{r.name}</span><div className="cell-sub">{POSITION_LABEL[r.position]}</div></> },
    { key: 'base', header: 'Lương cơ bản', numeric: true, sortValue: (r) => r.base_salary, render: money('base_salary') },
    { key: 'mem', header: 'HH member', numeric: true, sortValue: (r) => r.member_commission, render: money('member_commission') },
    { key: 'mkt', header: 'HH doanh số member', numeric: true, sortValue: (r) => r.marketing_commission, render: money('marketing_commission') },
    { key: 'pti', header: 'HH gói PT (nhận liền)', numeric: true, sortValue: (r) => r.pt_immediate, render: money('pt_immediate') },
    { key: 'pts', header: 'HH dạy PT 1-1', numeric: true, sortValue: (r) => r.pt_session_pay, render: (r) => (r.pt_session_pay ? <>{fmtMoney(r.pt_session_pay)}<div className="cell-sub">{r.pt_sessions_taught} buổi</div></> : '-') },
    { key: 'grp', header: 'HH lớp nhóm', numeric: true, sortValue: (r) => r.group_pay, render: (r) => (r.group_pay ? <>{fmtMoney(r.group_pay)}<div className="cell-sub">{r.group_classes} lớp</div></> : '-') },
    { key: 'gross', header: 'Tổng thu nhập', numeric: true, sortValue: (r) => r.gross, render: (r) => <b>{fmtMoney(r.gross)}</b> },
    { key: 'ins', header: 'Bảo hiểm', numeric: true, sortValue: (r) => r.insurance, render: money('insurance') },
    { key: 'tax', header: 'Thuế TNCN', numeric: true, sortValue: (r) => r.tax, render: (r) => (r.tax ? fmtMoney(r.tax) : r.tax_pending ? <span className="text-warn">chờ</span> : '-') },
    { key: 'pen', header: 'Phạt', numeric: true, sortValue: (r) => r.penalty, render: (r) => (r.penalty ? <span className="text-bad">{fmtMoney(r.penalty)}</span> : '-') },
    { key: 'adj', header: 'Điều chỉnh', numeric: true, sortValue: (r) => r.adjustment, render: money('adjustment') },
    { key: 'net', header: 'Thực nhận', numeric: true, sortValue: (r) => r.net, render: (r) => <b>{fmtMoney(r.net)}</b> },
  ]

  const refreshNow = async () => {
    setBusy(true)
    try {
      await api.post('/payroll/refresh', { month })
      await load()
      toast('Đã cập nhật bảng lương')
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async () => {
    if (!closing) return
    setBusy(true)
    try {
      await api.post(closing === 'close' ? '/payroll/close' : '/payroll/reopen', { month })
      toast(closing === 'close' ? `Đã chốt lương tháng ${month}` : `Đã mở lại lương tháng ${month}`)
      setClosing(null)
      await load()
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy(false)
    }
  }

  const t = data?.totals

  return (
    <>
      <div className="toolbar" style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
        <Field label="Tháng" htmlFor="pr-month">
          <Input id="pr-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
        {data && <Chip tone={closed ? 'ok' : 'warn'}>{closed ? 'Đã chốt' : 'Đang mở'}</Chip>}
        {data?.updated_at && !closed && <span className="cell-sub">Cập nhật lúc {fmtDateTime(data.updated_at)}. Tự động cập nhật lúc 12h và 18h mỗi ngày.</span>}
        {canManage && data?.updated_at && !closed && <Button disabled={busy} onClick={refreshNow}>Cập nhật ngay</Button>}
        <div style={{ flex: 1 }} />
        {canManage && data && (closed
          ? <Button onClick={() => setClosing('reopen')}>Mở lại</Button>
          : <Button variant="primary" onClick={() => setClosing('close')}>Chốt lương</Button>)}
      </div>

      {pending && <div className="view-note" role="note">Chưa có biểu thuế lũy tiến, thuế đang tính 0. Chờ chủ xác nhận trong Cài đặt lương.</div>}

      {t && (
        <KpiRow>
          <Kpi value={fmtMoney(t.gross)} label="Tổng thu nhập" />
          <Kpi value={fmtMoney(t.insurance + t.tax)} label="Bảo hiểm và thuế" />
          <Kpi value={fmtMoney(t.net)} label="Tổng thực nhận" />
        </KpiRow>
      )}

      <Panel title="Bảng lương" count={`${data?.rows.length ?? 0} nhân viên`} flush>
        <DataTable columns={cols} rows={data?.rows ?? []} rowKey={(r) => r.user_id} onRowClick={setDetail} defaultSort={{ key: 'net', dir: 'desc' }} loading={loading} error={error} emptyText="Chưa có nhân viên nào được tính lương. Bật 'Đang tính lương' trong Cài đặt lương." itemLabel="nhân viên" hidePager />
      </Panel>

      <PtStatsSection month={month} branchId={branchId} />

      {detail && <DetailModal row={detail} month={month} locked={closed} canManage={canManage} onClose={() => setDetail(null)} onSaved={async () => { setDetail(null); await load() }} />}
      {closing && (
        <ConfirmDialog
          title={closing === 'close' ? 'Chốt lương' : 'Mở lại bảng lương'}
          message={closing === 'close' ? `Chốt lương tháng ${month}? Sau khi chốt, số liệu được giữ nguyên dù bảng tỷ lệ đổi và không sửa được phạt hay điều chỉnh.` : `Mở lại lương tháng ${month}? Số liệu sẽ tính lại theo cài đặt hiện tại.`}
          confirmLabel={closing === 'close' ? 'Chốt lương' : 'Mở lại'}
          busy={busy}
          onConfirm={changeStatus}
          onClose={() => setClosing(null)}
        />
      )}
    </>
  )
}

function DetailModal({ row, month, locked, canManage, onClose, onSaved }: { row: PayrollRow; month: string; locked: boolean; canManage: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [penalty, setPenalty] = useState(String(row.penalty || ''))
  const [adjustment, setAdjustment] = useState(String(row.adjustment || ''))
  const [note, setNote] = useState(row.note ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const editable = canManage && !locked

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.put('/payroll/adjustments', { user_id: row.user_id, month, penalty: Number(penalty.replace(/\D/g, '')) || 0, adjustment: Math.round(parseNum(adjustment)), note: note.trim() })
      toast('Đã lưu phạt và điều chỉnh')
      onSaved()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const line = (label: string, value: string, sub?: string) => (
    <>
      <dt>{label}</dt>
      <dd className="num" style={{ textAlign: 'right' }}>{value}{sub ? <div className="cell-sub">{sub}</div> : null}</dd>
    </>
  )

  return (
    <Modal
      title={`${row.name} - lương tháng ${month}`}
      onClose={onClose}
      footer={editable ? <><Button onClick={onClose}>Đóng</Button><Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></> : <Button onClick={onClose}>Đóng</Button>}
    >
      <p className="cell-sub">{POSITION_LABEL[row.position]}</p>
      <dl className="kv">
        {line('Lương cơ bản', fmtMoney(row.base_salary))}
        {line('Doanh số member (thực thu)', fmtMoney(row.member_sales))}
        {line('HH bán gói member', fmtMoney(row.member_commission))}
        {row.marketing_commission ? line('HH doanh số member (Marketing)', fmtMoney(row.marketing_commission)) : null}
        {line('Doanh số gói PT (thực thu)', fmtMoney(row.pt_sales), row.pt_rate ? `Bậc áp dụng ${pct(row.pt_rate)}` : undefined)}
        {line('HH gói PT nhận liền', fmtMoney(row.pt_immediate))}
        {line('HH dạy PT 1-1', fmtMoney(row.pt_session_pay), `${row.pt_sessions_taught} buổi đã dạy`)}
        {line('HH lớp nhóm', fmtMoney(row.group_pay), `${row.group_classes} lớp`)}
        {line('Tổng thu nhập', fmtMoney(row.gross))}
        {line('Bảo hiểm', fmtMoney(row.insurance))}
        {line('Thuế TNCN', row.tax_pending && !row.tax ? 'Chờ biểu thuế' : fmtMoney(row.tax))}
        {line('Phạt', fmtMoney(row.penalty))}
        {line('Điều chỉnh', fmtMoney(row.adjustment))}
        {line('Thực nhận', fmtMoney(row.net))}
      </dl>
      {err && <div className="form-error" role="alert">{err}</div>}
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Phạt đi trễ, vi phạm" htmlFor="pd-pen">
          <MoneyInput id="pd-pen" disabled={!editable} value={penalty} onValueChange={setPenalty} placeholder="0 ₫" />
        </Field>
        <Field label="Điều chỉnh (cộng hoặc trừ)" htmlFor="pd-adj" hint="Số âm để trừ">
          <Input id="pd-adj" disabled={!editable} inputMode="numeric" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Ghi chú" htmlFor="pd-note" full>
          <Textarea id="pd-note" rows={2} disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {locked && <p className="hint-muted">Tháng đã chốt, mở lại bảng lương để sửa.</p>}
    </Modal>
  )
}

function TierEditor({ title, tiers, onChange, resizable, disabled, bare }: { title: string; tiers: PayrollTier[]; onChange: (t: PayrollTier[]) => void; resizable?: boolean; disabled?: boolean; bare?: boolean }) {
  const set = (i: number, patch: Partial<PayrollTier>) => onChange(tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)))
  return (
    <div style={{ marginBottom: 16 }}>
      {!bare && <h4 style={{ margin: '0 0 6px' }}>{title}</h4>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Bậc</th>
              <th className="num">Đến (đồng)</th>
              <th className="num">Tỷ lệ %</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => {
              const last = i === tiers.length - 1
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="num">
                    {last
                      ? <span className="cell-sub">Không giới hạn</span>
                      : <MoneyInput aria-label={`${title} bậc ${i + 1} đến`} disabled={disabled} value={t.upTo ?? ''} onValueChange={(d) => set(i, { upTo: d ? Number(d) : null })} placeholder="0 ₫" />}
                  </td>
                  <td className="num"><NumInput label={`${title} bậc ${i + 1} tỷ lệ`} value={t.rate} onChange={(n) => set(i, { rate: n })} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {resizable && !disabled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button small onClick={() => onChange([...tiers.slice(0, -1), { upTo: ((tiers[tiers.length - 2]?.upTo ?? 0) || 0) + 10_000_000, rate: tiers[tiers.length - 1]?.rate ?? 0 }, { upTo: null, rate: tiers[tiers.length - 1]?.rate ?? 0 }])}>Thêm bậc</Button>
          <Button small disabled={tiers.length <= 1} onClick={() => onChange([...tiers.slice(0, -2), { upTo: null, rate: tiers[tiers.length - 1].rate }])}>Xóa bậc cuối</Button>
        </div>
      )}
    </div>
  )
}

function SettingsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast()
  const [settings, setSettings] = useState<PayrollSettings | null>(null)
  const [staff, setStaff] = useState<PayrollStaff[]>([])
  const [edits, setEdits] = useState<Record<string, PayrollProfile>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [savingRow, setSavingRow] = useState('')
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [names, setNames] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setErr('')
    try {
      const [s, p] = await Promise.all([api.get<{ data: PayrollSettings }>('/payroll/settings'), api.get<{ data: PayrollStaff[] }>('/payroll/profiles')])
      setSettings(s.data.data)
      setStaff(p.data.data)
      setEdits({})
      setNames({})
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const profileOf = (u: PayrollStaff): PayrollProfile => edits[u.user_id] ?? u.profile ?? DEFAULT_PROFILE
  const patchProfile = (u: PayrollStaff, patch: Partial<PayrollProfile>) => setEdits((e) => ({ ...e, [u.user_id]: { ...profileOf(u), ...patch } }))

  const saveRow = async (u: PayrollStaff) => {
    setSavingRow(u.user_id)
    try {
      await api.put(`/payroll/profiles/${u.user_id}`, { ...profileOf(u), name: (names[u.user_id] ?? u.name).trim() || u.name })
      toast(`Đã lưu hồ sơ lương ${(names[u.user_id] ?? u.name).trim() || u.name}`)
      await load()
      setEditing({})
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setSavingRow('')
    }
  }

  const cancelRow = (u: PayrollStaff) => {
    setEditing((m) => ({ ...m, [u.user_id]: false }))
    setEdits((e) => { const n = { ...e }; delete n[u.user_id]; return n })
    setNames((e) => { const n = { ...e }; delete n[u.user_id]; return n })
  }

  const saveSettings = async () => {
    if (!settings) return
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.put<{ data: PayrollSettings }>('/payroll/settings', settings)
      setSettings(data.data)
      toast('Đã lưu cài đặt lương')
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const set = (patch: Partial<PayrollSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s))
  const disabled = !canManage

  return (
    <>
      {err && <div className="form-error" role="alert">{err}</div>}

      <div className="settings-top">
      <div className="settings-staff">
      <Panel title="Lương cơ bản" flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Vị trí</th>
                <th className="num">Lương cơ bản</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 && <tr><td colSpan={4} className="hint-muted">Chưa có nhân viên</td></tr>}
              {staff.map((u) => {
                const p = profileOf(u)
                const isEdit = !!editing[u.user_id]
                const dirty = !!edits[u.user_id] || (names[u.user_id] !== undefined && names[u.user_id] !== u.name)
                return (
                  <tr key={u.user_id}>
                    <td><Input aria-label={`Họ và tên ${u.email}`} disabled={disabled || !isEdit} value={names[u.user_id] ?? u.name} onChange={(e) => setNames((n) => ({ ...n, [u.user_id]: e.target.value }))} style={{ minWidth: 180 }} /></td>
                    <td>
                      <Select aria-label={`Vị trí ${u.name}`} disabled={disabled || !isEdit} value={p.position} onChange={(e) => patchProfile(u, positionDefaults(e.target.value as PayrollPosition))}>
                        {POSITIONS.map((k) => <option key={k} value={k}>{POSITION_LABEL[k]}</option>)}
                      </Select>
                    </td>
                    <td className="num"><MoneyInput aria-label={`Lương cơ bản ${u.name}`} disabled={disabled || !isEdit} value={p.base_salary || ''} onValueChange={(d) => patchProfile(u, { base_salary: Number(d) || 0 })} placeholder="0 ₫" /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {!isEdit ? (
                        <Button small disabled={disabled} onClick={() => setEditing((m) => ({ ...m, [u.user_id]: true }))}>Sửa</Button>
                      ) : (
                        <>
                          <Button small variant={dirty ? 'primary' : 'secondary'} disabled={disabled || !dirty || savingRow === u.user_id} onClick={() => saveRow(u)}>{savingRow === u.user_id ? 'Đang lưu...' : 'Lưu'}</Button>{' '}
                          <Button small onClick={() => cancelRow(u)}>Hủy</Button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      </div>

      {settings && (
        <aside className="pay-diagram" aria-label="Sơ đồ cơ cấu lương">
          <h3>Cơ cấu lương</h3>
          <div className="pd-formula"><b>Thực nhận</b> = Lương cơ bản + Hoa hồng - Khấu trừ</div>
          <div className="pd-cols">
            <div className="pd-col">
              <div className="pd-title">Hoa hồng gồm</div>
              <ul>
                <li><b>Sale Member</b> <span>mọi nhân viên</span></li>
                <li><b>Sale PT</b> <span>nhận liền {Math.round(settings.ptImmediateShare * 100)}%, dạy 1-1 {Math.round(settings.ptSessionShare * 100)}%</span></li>
                <li><b>Doanh số Member</b> <span>Marketing</span></li>
                <li><b>Lớp nhóm</b> <span>PT</span></li>
              </ul>
            </div>
            <div className="pd-col">
              <div className="pd-title">Khấu trừ gồm</div>
              <ul>
                <li><b>Bảo hiểm {String(settings.insuranceRate).replace('.', ',')}%</b> <span>PT Fulltime, Marketing</span></li>
                <li><b>Thuế TNCN {String(settings.partTimeTaxRate).replace('.', ',')}%</b> <span>PT Parttime</span></li>
                <li><b>Phạt</b> <span>đi trễ, vi phạm</span></li>
              </ul>
            </div>
          </div>
        </aside>
      )}
      </div>

      {settings && (
        <section className="set-wrap" aria-label="Cài đặt hoa hồng và khấu trừ">
          <div className="set-grid">
            <div className="flow-card">
              <b>Hoa hồng Sale Member</b>
              <TierEditor bare title="Hoa hồng bán gói Member (dùng chung)" tiers={settings.memberTiers} onChange={(t) => set({ memberTiers: t })} disabled={disabled} />
            </div>
            <div className="flow-card">
              <b>Hoa hồng Sale PT</b>
              <TierEditor bare title="Hoa hồng gói PT và dạy PT 1-1 (theo doanh số gói PT)" tiers={settings.ptTiers} onChange={(t) => set({ ptTiers: t })} disabled={disabled} />
              <p className="hint-muted">Nhận liền {Math.round(settings.ptImmediateShare * 100)}%, chia theo buổi dạy {Math.round(settings.ptSessionShare * 100)}%</p>
            </div>
            <div className="flow-card">
              <b>Hoa hồng doanh số Member</b>
              <TierEditor bare title="Hoa hồng doanh số Member (riêng Marketing)" tiers={settings.marketingTiers} onChange={(t) => set({ marketingTiers: t })} disabled={disabled} />
            </div>
            <div className="flow-card">
              <b>Hoa hồng lớp nhóm</b>
              <p className="hint-muted">Tính theo số buổi đứng lớp thực tế.</p>
              <div className="set-inline">
                <label htmlFor="ps-class">Đơn giá mỗi buổi</label>
                <MoneyInput id="ps-class" disabled={disabled} value={settings.classRate} onValueChange={(d) => set({ classRate: Number(d) || 0 })} />
              </div>
            </div>
            <div className="flow-card">
              <b>Bảo hiểm NLĐ</b>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Loại</th><th className="num">Tỷ lệ</th><th className="num">Số tiền/tháng</th></tr></thead>
                  <tbody>
                    {([['BHXH', 8], ['BHTN', 1], ['BHYT', 1.5]] as const).map(([k, r]) => (
                      <tr key={k}><td>{k}</td><td className="num">{String(r).replace('.', ',')}%</td><td className="num">{settings.insuranceBase != null ? fmtMoney(Math.round((settings.insuranceBase * r) / 100)) : '-'}</td></tr>
                    ))}
                    <tr><td><b>Tổng</b></td><td className="num"><b>{String(settings.insuranceRate).replace('.', ',')}%</b></td><td className="num"><b>{settings.insuranceBase != null ? fmtMoney(Math.round((settings.insuranceBase * settings.insuranceRate) / 100)) : 'Theo lương cơ bản'}</b></td></tr>
                  </tbody>
                </table>
              </div>
              <dl className="kv">
                <dt>Mức lương đóng</dt><dd>{settings.insuranceBase != null ? fmtMoney(settings.insuranceBase) : 'Theo lương cơ bản'}</dd>
              </dl>
            </div>
            <div className="flow-card">
              <b>Thuế TNCN</b>
              <dl className="kv">
                <dt>Tỷ lệ</dt><dd>{String(settings.partTimeTaxRate).replace('.', ',')}% tổng thu nhập</dd>
              </dl>
              <p className="hint-muted">Chỉ dành cho nhân viên Parttime.</p>
            </div>
          </div>
        </section>
      )}

      {settings && canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="primary" onClick={saveSettings} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu cài đặt'}</Button>
        </div>
      )}
    </>
  )
}
