import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, todayISO } from '../lib/format'
import { INBODY_LIMITS, changeText, inbodyBody, inbodyErrors, trendLines, type InbodyForm, type TrendKey } from '../lib/inbody'
import { usePermission } from '../context/usePermission'
import { useAuth } from '../context/AuthContext'
import { ConfirmDialog } from './Dialogs'
import { Modal } from './Modal'
import { Button, DataTable, Field, Input, Textarea, useToast, type Column } from './ui'
import type { InbodyRecord, ListResp } from '../types'

const SERIES: { key: TrendKey; label: string; unit: string; color: string }[] = [
  { key: 'weight', label: 'Cân nặng', unit: 'kg', color: 'var(--c1)' },
  { key: 'body_fat', label: 'Mỡ cơ thể', unit: '%', color: 'var(--c2)' },
  { key: 'muscle', label: 'Khối lượng cơ', unit: 'kg', color: 'var(--c3)' },
]

export function InbodyTrend({ records }: { records: InbodyRecord[] }) {
  if (records.length < 2) return <div className="hint-muted">Cần ít nhất 2 lần đo để vẽ biểu đồ xu hướng.</div>
  const W = 520
  const H = 140
  const lines = trendLines(records, W, H)
  return (
    <div className="inbody-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Xu hướng cân nặng, mỡ cơ thể và khối lượng cơ" style={{ width: '100%', height: 'auto', maxHeight: 180 }}>
        {lines.map((l) => {
          const s = SERIES.find((x) => x.key === l.key)!
          return (
            <g key={l.key}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} points={l.points.map((p) => `${p.x},${p.y}`).join(' ')} />
              {l.points.map((p) => <circle key={p.date + p.x} cx={p.x} cy={p.y} r={3} fill={s.color}><title>{`${s.label} ${p.value} ${s.unit}, ${fmtDate(p.date)}`}</title></circle>)}
            </g>
          )
        })}
      </svg>
      <div className="inbody-legend" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
        {SERIES.map((s) => {
          const c = changeText(records, s.key)
          return (
            <span key={s.key}>
              <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: s.color, marginRight: 6 }} />
              {s.label}{c ? `: ${c} ${s.unit}` : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

const emptyForm = (): InbodyForm => ({ measured_on: todayISO(), weight: '', height: '', body_fat: '', muscle: '', note: '' })

function InbodyDialog({ memberId, onClose, onSaved }: { memberId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<InbodyForm>(emptyForm)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const errs = inbodyErrors(f, todayISO())
  const set = (k: keyof InbodyForm, v: string) => setF((x) => ({ ...x, [k]: v }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (Object.keys(errs).length) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/members/${memberId}/inbody`, inbodyBody(f))
      onSaved()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Thêm lần đo InBody"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="inbody-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu kết quả'}</Button>
        </>
      }
    >
      <form id="inbody-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Ngày đo" htmlFor="ib-date" error={touched ? errs.measured_on : undefined}>
          <Input id="ib-date" type="date" max={todayISO()} value={f.measured_on} onChange={(e) => set('measured_on', e.target.value)} invalid={touched && !!errs.measured_on} />
        </Field>
        {(Object.keys(INBODY_LIMITS) as (keyof typeof INBODY_LIMITS)[]).map((k) => (
          <Field key={k} label={INBODY_LIMITS[k].label} htmlFor={`ib-${k}`} error={touched ? errs[k] : undefined}>
            <Input id={`ib-${k}`} inputMode="decimal" value={f[k]} onChange={(e) => set(k, e.target.value)} invalid={touched && !!errs[k]} />
          </Field>
        ))}
        <Field label="Ghi chú" htmlFor="ib-note" full>
          <Textarea id="ib-note" rows={2} maxLength={500} value={f.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        {error && <div className="form-error" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}
      </form>
    </Modal>
  )
}

export function InbodyPanel({ memberId }: { memberId: string }) {
  const { can } = usePermission()
  const { user } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<InbodyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<InbodyRecord | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<InbodyRecord>>(`/members/${memberId}/inbody`)
      setRows(data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [memberId])
  useEffect(() => { load() }, [load])

  const canDelete = (r: InbodyRecord) => can('inbody.delete') || (can('inbody.create') && r.created_by === user?.id)
  const cols: Column<InbodyRecord>[] = [
    { key: 'date', header: 'Ngày đo', sortValue: (r) => r.measured_on, render: (r) => fmtDate(r.measured_on) },
    { key: 'weight', header: 'Cân nặng (kg)', numeric: true, sortValue: (r) => r.weight, render: (r) => r.weight },
    { key: 'height', header: 'Chiều cao (cm)', numeric: true, render: (r) => r.height },
    { key: 'fat', header: 'Mỡ (%)', numeric: true, sortValue: (r) => r.body_fat, render: (r) => r.body_fat },
    { key: 'muscle', header: 'Cơ (kg)', numeric: true, sortValue: (r) => r.muscle, render: (r) => r.muscle },
    { key: 'by', header: 'Người nhập', render: (r) => <>{r.created_by_name ?? '-'}{r.note ? <div className="cell-sub">{r.note}</div> : null}</> },
    { key: 'act', header: '', className: 'actions', render: (r) => (canDelete(r) ? <Button small variant="danger" onClick={() => setRemoving(r)}>Xóa</Button> : null) },
  ]

  return (
    <section aria-label="InBody">
      <div className="profile-foot-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 className="prof-sec" style={{ margin: 0 }}>Chỉ số InBody</h3>
        {can('inbody.create') && <Button variant="primary" small onClick={() => setAdding(true)}>Thêm lần đo</Button>}
      </div>
      <InbodyTrend records={rows} />
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} defaultSort={{ key: 'date', dir: 'desc' }} loading={loading} error={error} emptyText="Chưa có lần đo InBody" itemLabel="lần đo" hidePager />
      {adding && <InbodyDialog memberId={memberId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast('Đã lưu kết quả InBody'); load() }} />}
      {removing && (
        <ConfirmDialog
          title="Xóa lần đo InBody"
          message={`Xóa lần đo ngày ${fmtDate(removing.measured_on)}?`}
          confirmLabel="Xóa"
          danger
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            setBusy(true)
            try {
              await api.delete(`/members/${memberId}/inbody/${removing.id}`)
              toast('Đã xóa lần đo')
              setRemoving(null)
              await load()
            } catch (e) {
              toast(apiError(e).message, true)
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
    </section>
  )
}
