import { useState, type FormEvent } from 'react'
import { Button, Field, Input, PageHeader, Panel, useToast } from '../components/ui'

const KEY = 'gymhub.zns.config.v2'

interface EventDef { key: string; label: string; hint: string; days?: number }
const EVENTS: EventDef[] = [
  { key: 'new_contract', label: 'Đăng ký gói mới', hint: 'Gửi ngay khi hợp đồng mới được kích hoạt.' },
  { key: 'renewal', label: 'Gia hạn', hint: 'Gửi ngay khi hợp đồng gia hạn được kích hoạt.' },
  { key: 'payment_due', label: 'Nhắc ngày thanh toán', hint: 'Gửi trước ngày hẹn thanh toán số tiền còn nợ.', days: 2 },
  { key: 'expiring', label: 'Nhắc ngày hết hạn', hint: 'Gửi trước ngày hợp đồng hết hạn.', days: 2 },
  { key: 'pt_signed', label: 'Khách ký xác nhận buổi PT', hint: 'Gửi ngay sau khi khách ký xong buổi PT.' },
]

interface EventCfg { enabled: boolean; templateId: string; days: string }
interface Cfg { oaId: string; appId: string; testPhone: string; events: Record<string, EventCfg> }

const fresh = (): Cfg => ({
  oaId: '', appId: '', testPhone: '',
  events: Object.fromEntries(EVENTS.map((e) => [e.key, { enabled: false, templateId: '', days: String(e.days ?? 0) }])),
})

const load = (): Cfg => {
  const base = fresh()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { ...base, ...saved, events: Object.fromEntries(EVENTS.map((e) => [e.key, { ...base.events[e.key], ...(saved.events?.[e.key] ?? {}) }])) }
  } catch { return base }
}

export default function ZnsSettings() {
  const toast = useToast()
  const [cfg, setCfg] = useState<Cfg>(load)
  const [secret, setSecret] = useState('')
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const setTop = (k: 'oaId' | 'appId' | 'testPhone', v: string) => setCfg((c) => ({ ...c, [k]: v }))
  const setEv = (k: string, patch: Partial<EventCfg>) => setCfg((c) => ({ ...c, events: { ...c.events, [k]: { ...c.events[k], ...patch } } }))

  const save = (e: FormEvent) => {
    e.preventDefault()
    const bad = EVENTS.find((d) => d.days !== undefined && cfg.events[d.key].enabled && !(Number(cfg.events[d.key].days) >= 1 && Number(cfg.events[d.key].days) <= 60))
    if (bad) { setErr(`"${bad.label}": số ngày phải từ 1 đến 60`); return }
    setErr('')
    try { localStorage.setItem(KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
    toast('Đã lưu cấu hình Zalo ZNS (giao diện, chưa lưu lên máy chủ)')
  }

  return (
    <>
      <PageHeader title="Cài đặt Zalo ZNS" />
      <form onSubmit={save}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Panel title="Kết nối Zalo Official Account">
          <div className="form-grid">
            <Field label="OA ID" htmlFor="z-oa"><Input id="z-oa" value={cfg.oaId} onChange={(e) => setTop('oaId', e.target.value)} /></Field>
            <Field label="App ID" htmlFor="z-app"><Input id="z-app" value={cfg.appId} onChange={(e) => setTop('appId', e.target.value)} /></Field>
            <Field label="Secret key" htmlFor="z-secret" hint="Không hiển thị lại sau khi lưu."><Input id="z-secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
            <Field label="Access token OA" htmlFor="z-token"><Input id="z-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></Field>
            <Field label="Số điện thoại gửi thử" htmlFor="z-test"><Input id="z-test" inputMode="tel" placeholder="0903123456" value={cfg.testPhone} onChange={(e) => setTop('testPhone', e.target.value)} /></Field>
          </div>
        </Panel>

        <div style={{ height: 16 }} />
        <Panel title="Sự kiện gửi tin">
          <div className="zns-events">
            {EVENTS.map((d) => {
              const ev = cfg.events[d.key]
              return (
                <div key={d.key} className="zns-event">
                  <label className="zns-head">
                    <input type="checkbox" checked={ev.enabled} onChange={(e) => setEv(d.key, { enabled: e.target.checked })} />
                    <span className="cell-main">{d.label}</span>
                  </label>
                  <div className="cell-sub">{d.hint}</div>
                  <div className="zns-fields">
                    <Field label="Mã mẫu tin (Template ID)" htmlFor={`z-tpl-${d.key}`}>
                      <Input id={`z-tpl-${d.key}`} disabled={!ev.enabled} value={ev.templateId} onChange={(e) => setEv(d.key, { templateId: e.target.value })} />
                    </Field>
                    {d.days !== undefined && (
                      <Field label="Gửi trước (ngày)" htmlFor={`z-days-${d.key}`}>
                        <Input id={`z-days-${d.key}`} type="number" min={1} max={60} disabled={!ev.enabled} value={ev.days} onChange={(e) => setEv(d.key, { days: e.target.value })} />
                      </Field>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button type="button" disabled title="Cần kết nối máy chủ">Gửi thử</Button>
          <Button type="submit" variant="primary">Lưu cấu hình</Button>
        </div>
      </form>
    </>
  )
}
