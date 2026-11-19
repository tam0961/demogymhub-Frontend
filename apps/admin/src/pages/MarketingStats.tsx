import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { Button, Field, Input, Kpi, KpiRow, MoneyInput, PageHeader, Panel, useToast } from '../components/ui'
import type { Lead, ListResp } from '../types'

type Channel = 'facebook_ads' | 'google_ads' | 'google_maps'
interface Metric { month: string; channel: Channel; spend: number; impressions: number; clicks: number; leads: number; note: string }

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'facebook_ads', label: 'Facebook Ads' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'google_maps', label: 'Google Maps' },
]
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7)
const blank = (month: string, channel: Channel): Metric => ({ month, channel, spend: 0, impressions: 0, clicks: 0, leads: 0, note: '' })
const num = (v: string) => Math.max(0, parseInt(v.replace(/\D/g, ''), 10) || 0)
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '-')

function ChannelForm({ value, canEdit, onSave }: { value: Metric; canEdit: boolean; onSave: (m: Metric) => Promise<void> }) {
  const [m, setM] = useState(value)
  const [busy, setBusy] = useState(false)
  useEffect(() => setM(value), [value])
  const label = CHANNELS.find((c) => c.key === m.channel)!.label
  const id = `mk-${m.channel}`
  return (
    <Panel title={label} note={`CPL ${m.leads > 0 ? fmtMoney(m.spend / m.leads) : '-'} · CTR ${pct(m.clicks, m.impressions)}`}>
      <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave(m) } finally { setBusy(false) } }}>
        <Field label="Chi phí" htmlFor={`${id}-spend`}><MoneyInput id={`${id}-spend`} disabled={!canEdit} value={m.spend} onValueChange={(d) => setM({ ...m, spend: num(d) })} /></Field>
        <Field label="Lượt hiển thị" htmlFor={`${id}-imp`}><Input id={`${id}-imp`} disabled={!canEdit} inputMode="numeric" value={m.impressions} onChange={(e) => setM({ ...m, impressions: num(e.target.value) })} /></Field>
        <Field label="Lượt nhấp" htmlFor={`${id}-clk`}><Input id={`${id}-clk`} disabled={!canEdit} inputMode="numeric" value={m.clicks} onChange={(e) => setM({ ...m, clicks: num(e.target.value) })} /></Field>
        <Field label="Khách tiềm năng thu được" htmlFor={`${id}-ld`}><Input id={`${id}-ld`} disabled={!canEdit} inputMode="numeric" value={m.leads} onChange={(e) => setM({ ...m, leads: num(e.target.value) })} /></Field>
        <Field label="Ghi chú" htmlFor={`${id}-note`} full><Input id={`${id}-note`} disabled={!canEdit} maxLength={300} value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} /></Field>
        {canEdit && <div className="full" style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></div>}
      </form>
    </Panel>
  )
}

export default function MarketingStats() {
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [month, setMonth] = useState(thisMonth)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [m, l] = await Promise.all([
        api.get<{ data: Metric[] }>('/marketing/metrics', { params: { month } }),
        api.get<ListResp<Lead>>('/leads', { params: { limit: 200, branch_id: branchId ?? undefined } }),
      ])
      setMetrics(m.data.data)
      setLeads(l.data.data)
    } catch (e) {
      setError(apiError(e).message)
    }
  }, [month, branchId])
  useEffect(() => { load() }, [load])

  const inMonth = useMemo(() => leads.filter((l) => l.created_at.slice(0, 7) === month), [leads, month])
  const converted = inMonth.filter((l) => l.status === 'converted').length
  const bySource = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of inMonth) { const k = l.source?.trim() || 'Chưa rõ'; map.set(k, (map.get(k) ?? 0) + 1) }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [inMonth])
  const spend = metrics.reduce((s, r) => s + r.spend, 0)

  const save = async (m: Metric) => {
    try {
      await api.put('/marketing/metrics', m)
      toast('Đã lưu chỉ số')
      await load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  return (
    <>
      <PageHeader title="Chỉ số marketing" action={<Input aria-label="Tháng" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <KpiRow>
        <Kpi value={inMonth.length} label="Khách tiềm năng trong tháng" />
        <Kpi value={converted} label="Đã chuyển hội viên" note={`Tỷ lệ ${pct(converted, inMonth.length)}`} />
        <Kpi value={fmtMoney(spend)} label="Tổng chi phí quảng cáo" />
        <Kpi value={inMonth.length > 0 && spend > 0 ? fmtMoney(spend / inMonth.length) : '-'} label="Chi phí mỗi khách tiềm năng" />
      </KpiRow>
      <Panel title="Khách tiềm năng theo nguồn" count={inMonth.length}>
        {bySource.length === 0 ? <p className="muted">Chưa có khách tiềm năng trong tháng này.</p> : (
          <ul className="plain-list">
            {bySource.map(([s, n]) => <li key={s}><span>{s}</span> <strong>{n}</strong></li>)}
          </ul>
        )}
      </Panel>
      <p className="muted">Chỉ số quảng cáo và Google Maps nhập tay theo tháng cho đến khi có kết nối tự động.</p>
      {CHANNELS.map((c) => (
        <ChannelForm key={`${month}-${c.key}`} value={metrics.find((r) => r.channel === c.key) ?? blank(month, c.key)} canEdit={can('system.manage_settings')} onSave={save} />
      ))}
    </>
  )
}
