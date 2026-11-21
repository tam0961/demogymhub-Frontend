import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import ZaloBotPanel from './ZaloBotPanel'
import { Button, Chip, Field, Input, PageHeader, Panel, Textarea, useToast } from '../components/ui'

type EventKey = 'new_contract' | 'payment_due' | 'expiring' | 'pt_signed'

interface EventDef { key: EventKey; label: string; hint: string; vars: string[]; hasDays?: boolean }
const EVENTS: EventDef[] = [
  { key: 'new_contract', label: 'Đăng ký gói mới', hint: 'Gửi ngay khi hợp đồng mới được kích hoạt.', vars: ['customer_name', 'contract_code', 'package_name', 'end_date', 'gym_name'] },
  { key: 'payment_due', label: 'Nhắc thanh toán', hint: 'Gửi từ 9h cho hợp đồng còn nợ có ngày hẹn thanh toán. Số ngày là số ngày trước hạn, 0 là đúng ngày hẹn, mỗi mốc gửi một lần. Bỏ qua khách đã thanh toán đủ.', vars: ['customer_name', 'contract_code', 'package_name', 'amount_due', 'due_date', 'days_left', 'gym_name'], hasDays: true },
  { key: 'expiring', label: 'Nhắc hết hạn', hint: 'Gửi mỗi ngày từ 9h cho hợp đồng sắp hết hạn, mỗi mốc gửi một lần. Bỏ qua khách đã gia hạn.', vars: ['customer_name', 'contract_code', 'package_name', 'end_date', 'days_left', 'gym_name'], hasDays: true },
  { key: 'pt_signed', label: 'Khách ký xác nhận buổi PT', hint: 'Gửi ngay sau khi khách ký xác nhận buổi tập 1:1, kèm số buổi còn lại.', vars: ['customer_name', 'pt_name', 'session_time', 'sessions_left', 'gym_name'] },
]
const EVENT_LABEL: Record<string, string> = Object.fromEntries(EVENTS.map((e) => [e.key, e.label]))

interface EventForm { enabled: boolean; templateId: string; days: string; params: string }
type TopKey = 'appId' | 'oaId' | 'testPhone' | 'secretKey' | 'accessToken' | 'refreshToken'
type Form = Record<TopKey, string> & { events: Record<EventKey, EventForm> }
interface ServerCfg {
  app_id: string; oa_id: string; test_phone: string; has_secret_key: boolean; has_access_token: boolean; has_refresh_token: boolean
  events: Record<EventKey, { enabled: boolean; template_id: string; days: number[]; params: Record<string, string> }>
}
interface LogRow { id: string; event: string; phone: string; status: string; error: string | null; created_at: string }

const paramsToText = (p: Record<string, string>) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join('\n')
const textToParams = (t: string) => {
  const out: Record<string, string> = {}
  for (const line of t.split('\n')) {
    const i = line.indexOf('=')
    if (i > 0 && line.slice(i + 1).trim()) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}
const fromServer = (c: ServerCfg): Form => ({
  appId: c.app_id, oaId: c.oa_id, testPhone: c.test_phone, secretKey: '', accessToken: '', refreshToken: '',
  events: Object.fromEntries(EVENTS.map((e) => {
    const s = c.events[e.key]
    return [e.key, { enabled: s.enabled, templateId: s.template_id, days: s.days.join(', '), params: paramsToText(s.params) }]
  })) as Record<EventKey, EventForm>,
})
const parseDays = (t: string) => t.split(/[,\s]+/).filter(Boolean).map(Number)

export default function ZnsSettings({ embedded = false }: { embedded?: boolean }) {
  const toast = useToast()
  const [form, setForm] = useState<Form | null>(null)
  const [has, setHas] = useState({ secret: false, access: false, refresh: false })
  const [logs, setLogs] = useState<LogRow[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, l] = await Promise.all([api.get<{ data: ServerCfg }>('/zalo/config'), api.get<{ data: LogRow[] }>('/zalo/logs')])
      setForm(fromServer(c.data.data))
      setHas({ secret: c.data.data.has_secret_key, access: c.data.data.has_access_token, refresh: c.data.data.has_refresh_token })
      setLogs(l.data.data)
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  if (!form) return <><PageHeader title="Zalo" />{err ? <div className="form-error" role="alert">{err}</div> : <p className="cell-sub">Đang tải...</p>}</>

  const setTop = (k: TopKey, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const setEv = (k: EventKey, patch: Partial<EventForm>) => setForm((f) => (f ? { ...f, events: { ...f.events, [k]: { ...f.events[k], ...patch } } } : f))

  const payload = () => ({
    app_id: form.appId.trim(), oa_id: form.oaId.trim(), test_phone: form.testPhone.trim(),
    secret_key: form.secretKey || undefined, access_token: form.accessToken || undefined, refresh_token: form.refreshToken || undefined,
    events: Object.fromEntries(EVENTS.map((e) => {
      const f = form.events[e.key]
      return [e.key, { enabled: f.enabled, template_id: f.templateId.trim(), days: e.hasDays ? parseDays(f.days) : [], params: textToParams(f.params) }]
    })),
  })

  const badMin = (k: EventKey) => (k === 'payment_due' ? 0 : 1)
  const validate = () => {
    const badDays = EVENTS.find((d) => d.hasDays && form.events[d.key].enabled && !parseDays(form.events[d.key].days).every((n) => Number.isInteger(n) && n >= (badMin(d.key)) && n <= 90))
    if (badDays) return `"${badDays.label}": các mốc ngày phải từ ${badMin(badDays.key)} đến 90, cách nhau bằng dấu phẩy`
    const noTpl = EVENTS.find((d) => form.events[d.key].enabled && !form.events[d.key].templateId.trim())
    if (noTpl) return `"${noTpl.label}": cần nhập mã mẫu tin`
    return ''
  }

  const save = async () => {
    const bad = validate()
    setErr(bad)
    if (bad) return
    setBusy(true)
    try {
      await api.put('/zalo/config', payload())
      toast('Đã lưu cấu hình Zalo ZNS')
      await load()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const test = async (key: EventKey) => {
    const bad = validate()
    setErr(bad)
    if (bad) return
    try {
      await api.put('/zalo/config', payload())
      const { data } = await api.post<{ data: { status: string; error?: string } }>('/zalo/test', { event: key })
      toast(data.data.status === 'sent' ? 'Đã gửi tin thử' : `Không gửi được: ${data.data.error ?? data.data.status}`)
      await load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  const runReminders = async () => {
    try {
      const { data } = await api.post<{ data: { sent: number } }>('/zalo/run-reminders')
      toast(`Đã gửi ${data.data.sent} tin nhắc hết hạn`)
      await load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  return (
    <>
      {!embedded && <PageHeader title="Zalo" sub="Thiết lập Zalo. Cấu hình lưu trên máy chủ, điền một lần, hệ thống tự gửi tin." />}
      {err && <div className="form-error" role="alert">{err}</div>}
      <div className="zalo-top">
        <Panel title="Zalo OA">
          <div className="form-grid">
            <Field label="OA ID" htmlFor="z-oa"><Input id="z-oa" value={form.oaId} onChange={(e) => setTop('oaId', e.target.value)} /></Field>
            <Field label="App ID" htmlFor="z-app"><Input id="z-app" value={form.appId} onChange={(e) => setTop('appId', e.target.value)} /></Field>
            <Field label="Secret key" htmlFor="z-secret" hint={has.secret ? 'Đã lưu, để trống để giữ nguyên.' : 'Để tự làm mới token.'}>
              <Input id="z-secret" type="password" autoComplete="off" value={form.secretKey} onChange={(e) => setTop('secretKey', e.target.value)} />
            </Field>
            <Field label="Số điện thoại gửi thử" htmlFor="z-test"><Input id="z-test" inputMode="tel" placeholder="0903123456" value={form.testPhone} onChange={(e) => setTop('testPhone', e.target.value)} /></Field>
            <Field label="Access token" htmlFor="z-token" hint={has.access ? 'Đã lưu, để trống để giữ nguyên.' : undefined}>
              <Input id="z-token" type="password" autoComplete="off" value={form.accessToken} onChange={(e) => setTop('accessToken', e.target.value)} />
            </Field>
            <Field label="Refresh token" htmlFor="z-refresh" hint={has.refresh ? 'Đã lưu, tự làm mới access token.' : 'Để tự làm mới access token.'}>
              <Input id="z-refresh" type="password" autoComplete="off" value={form.refreshToken} onChange={(e) => setTop('refreshToken', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Button variant="primary" disabled={busy} onClick={() => save()}>{busy ? 'Đang lưu...' : 'Lưu Zalo OA'}</Button>
          </div>
        </Panel>
      </div>

      <Panel title="Tin nhắn ZNS">
        <div className="zns-grid">
          {EVENTS.map((d) => {
            const ev = form.events[d.key]
            return (
              <div key={d.key} className="zns-card">
                <label className="zns-head">
                  <input type="checkbox" checked={ev.enabled} onChange={(e) => setEv(d.key, { enabled: e.target.checked })} />
                  <span className="cell-main">{d.label}</span>
                </label>
                <div className="cell-sub">{d.hint}</div>
                <div className="zns-row">
                  <Field label="Mã mẫu tin" htmlFor={`z-tpl-${d.key}`}>
                    <Input id={`z-tpl-${d.key}`} value={ev.templateId} onChange={(e) => setEv(d.key, { templateId: e.target.value })} />
                  </Field>
                  {d.hasDays && (
                    <Field label="Gửi trước (ngày)" htmlFor={`z-days-${d.key}`}>
                      <Input id={`z-days-${d.key}`} placeholder={d.key === 'payment_due' ? '3, 0' : '30, 14, 7'} value={ev.days} onChange={(e) => setEv(d.key, { days: e.target.value })} />
                    </Field>
                  )}
                </div>
                <Field label="Tham số mẫu" htmlFor={`z-par-${d.key}`} hint={`Mỗi dòng tên_tham_số=biến. Biến: ${d.vars.join(', ')}.`}>
                  <Textarea id={`z-par-${d.key}`} rows={2} placeholder="customer_name=customer_name" value={ev.params} onChange={(e) => setEv(d.key, { params: e.target.value })} />
                </Field>
                <div><Button small type="button" onClick={() => test(d.key)}>Lưu và gửi thử</Button></div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button onClick={runReminders}>Chạy nhắc hết hạn ngay</Button>
          <Button variant="primary" disabled={busy} onClick={() => save()}>{busy ? 'Đang lưu...' : 'Lưu tin nhắn'}</Button>
        </div>
      </Panel>

      <div style={{ height: 16 }} />
      <ZaloBotPanel />
      <div style={{ height: 16 }} />
      <Panel title="Lịch sử gửi gần đây" count={`${logs.length} tin`}>
        {logs.length === 0 ? <p className="cell-sub">Chưa gửi tin nào.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Thời gian</th><th>Sự kiện</th><th>Số điện thoại</th><th>Kết quả</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtDateTime(l.created_at)}</td>
                    <td>{EVENT_LABEL[l.event] ?? l.event}</td>
                    <td>{l.phone}</td>
                    <td><Chip tone={l.status === 'sent' ? 'ok' : l.status === 'failed' ? 'bad' : 'warn'}>{l.status === 'sent' ? 'Đã gửi' : l.status === 'failed' ? 'Lỗi' : 'Đang gửi'}</Chip>{l.error && <div className="cell-sub">{l.error}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
