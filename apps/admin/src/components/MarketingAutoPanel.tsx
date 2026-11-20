import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { Button, Chip, Field, Input, Panel, Select, useToast } from './ui'

interface AutoCfg {
  fb: { connected: boolean; account: string; name: string; currency: string; synced: number; err: string }
  gg: { key: string; account: string; name: string; synced: number }
  gbp: { key: string; name: string; synced: number; last: { days: number; at: number } | null }
  rules: { k: string; b: string }[]
  def_branch: string
  counts: { campaigns: number; daily: number }
}
interface LeadKey { id: string; branch_id: string; label: string; created_at: string; last_at: string | null }

const origin = () => window.location.origin
const at = (t: number) => (t ? fmtDateTime(new Date(t).toISOString()) : 'chưa có')

export function MarketingAutoPanel({ canEdit }: { canEdit: boolean }) {
  const { user } = useAuth()
  const toast = useToast()
  const [cfg, setCfg] = useState<AutoCfg | null>(null)
  const [keys, setKeys] = useState<LeadKey[]>([])
  const [rules, setRules] = useState('')
  const [def, setDef] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('KH Gym')
  const [branch, setBranch] = useState('')
  const [fresh, setFresh] = useState('')

  const apply = (c: AutoCfg) => {
    setCfg(c)
    setRules(c.rules.map((r) => `${r.k}=${r.b}`).join('\n'))
    setDef(c.def_branch)
  }
  const load = useCallback(async () => {
    try {
      const [c, k] = await Promise.all([api.get<{ data: AutoCfg }>('/marketing/auto/config'), api.get<{ data: LeadKey[] }>('/marketing/auto/lead-keys')])
      apply(c.data.data)
      setKeys(k.data.data)
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast('Đã sao chép')).catch(() => {})

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const syncNow = () => run(async () => {
    const { data } = await api.post<{ data: { ok: boolean; err?: string; config: AutoCfg } }>('/marketing/auto/fb-sync')
    apply(data.data.config)
    toast(data.data.ok ? 'Đã kéo số liệu Facebook' : `Không kéo được: ${data.data.err ?? ''}`)
  })

  const saveRules = () => run(async () => {
    const parsed = rules.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.lastIndexOf('=')
      return { k: l.slice(0, i).trim(), b: l.slice(i + 1).trim().toLowerCase() }
    })
    const { data } = await api.put<{ data: AutoCfg }>('/marketing/auto/config', { rules: parsed, def_branch: def.trim().toLowerCase() })
    apply(data.data)
    toast('Đã lưu quy tắc chi nhánh')
  })

  const regen = (which: 'regen_gg' | 'regen_gbp') => run(async () => {
    const { data } = await api.put<{ data: AutoCfg }>('/marketing/auto/config', { [which]: true })
    apply(data.data)
    toast('Đã tạo khóa mới. Cập nhật khóa trong đoạn mã Google.')
  })

  const addKey = () => run(async () => {
    const { data } = await api.post<{ data: { key: string } }>('/marketing/auto/lead-keys', { branch_id: branch || user?.branches[0]?.id, label })
    setFresh(data.data.key)
    await load()
  })

  const delKey = (id: string) => run(async () => {
    await api.delete(`/marketing/auto/lead-keys/${id}`)
    await load()
  })

  if (!cfg) return err ? <div className="form-error" role="alert">{err}</div> : <p className="cell-sub">Đang tải...</p>
  const branchName = (id: string) => user?.branches.find((b) => b.id === id)?.name ?? id

  return (
    <>
      {err && <div className="form-error" role="alert">{err}</div>}
      <Panel title="Facebook Ads" note={<Chip tone={cfg.fb.err ? 'bad' : cfg.fb.connected ? 'ok' : 'neutral'}>{cfg.fb.err ? 'Lỗi' : cfg.fb.connected ? 'Tự kéo mỗi 15 phút' : 'Chưa kết nối'}</Chip>}>
        <p className="cell-sub">Nhập ID tài khoản và token ở mục Facebook. Hệ thống tự kéo chiến dịch và số liệu 3 ngày gần nhất mỗi 15 phút, token chỉ nằm trên máy chủ.</p>
        <p>Tài khoản: <b>{cfg.fb.name || cfg.fb.account || 'chưa có'}</b>. Lần kéo gần nhất: {at(cfg.fb.synced)}. Đã có {cfg.counts.campaigns} chiến dịch, {cfg.counts.daily} dòng số liệu ngày.</p>
        {cfg.fb.err && <div className="form-error" role="alert">{cfg.fb.err}</div>}
        <Button disabled={!canEdit || busy || !cfg.fb.connected} onClick={syncNow}>Kéo số liệu 30 ngày ngay</Button>
      </Panel>
      <div style={{ height: 16 }} />

      <Panel title="Google Ads (gồm Google Maps)" note={<Chip tone={cfg.gg.synced ? 'ok' : 'neutral'}>{cfg.gg.synced ? `Nhận lần cuối ${at(cfg.gg.synced)}` : 'Chưa nhận số liệu'}</Chip>}>
        <p className="cell-sub">Dán địa chỉ gửi và khóa này vào Google Ads Script (chạy mỗi giờ). Khóa chỉ cho phép gửi số liệu vào.</p>
        <KeyRow label="Địa chỉ gửi" value={`${origin()}/api/mk/ads-in?key=${cfg.gg.key}`} onCopy={copy} />
        {canEdit && <Button small disabled={busy} onClick={() => regen('regen_gg')}>Tạo khóa mới</Button>}
      </Panel>
      <div style={{ height: 16 }} />

      <Panel title="Hồ sơ Google Maps" note={<Chip tone={cfg.gbp.synced ? 'ok' : 'neutral'}>{cfg.gbp.synced ? `Nhận lần cuối ${at(cfg.gbp.synced)}` : 'Chưa nhận số liệu'}</Chip>}>
        <p className="cell-sub">Apps Script của Google Business Profile gửi số liệu theo ngày và đánh giá vào địa chỉ này.</p>
        <KeyRow label="Địa chỉ gửi" value={`${origin()}/api/mk/gbp-in?key=${cfg.gbp.key}`} onCopy={copy} />
        {canEdit && <Button small disabled={busy} onClick={() => regen('regen_gbp')}>Tạo khóa mới</Button>}
      </Panel>
      <div style={{ height: 16 }} />

      <Panel title="Gán chiến dịch vào chi nhánh">
        <p className="cell-sub">Mỗi dòng một quy tắc: từ khóa trong tên chiến dịch = mã chi nhánh (ví dụ nhà bè=nb). Chiến dịch không khớp thì vào chi nhánh mặc định.</p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <textarea className="input" aria-label="Quy tắc chi nhánh" rows={4} disabled={!canEdit} value={rules} onChange={(e) => setRules(e.target.value)} />
          <Field label="Chi nhánh mặc định (mã)" htmlFor="mk-def"><Input id="mk-def" disabled={!canEdit} value={def} onChange={(e) => setDef(e.target.value)} /></Field>
          <div><Button variant="primary" disabled={!canEdit || busy} onClick={saveRules}>Lưu quy tắc</Button></div>
        </div>
      </Panel>
      <div style={{ height: 16 }} />

      <Panel title="Khách tiềm năng từ Google Sheet (KH Gym)">
        <p className="cell-sub">Mỗi khóa gắn với một chi nhánh. Apps Script trong Google Sheet gửi từng dòng khách mới vào địa chỉ bên dưới, khách vào mục Khách tiềm năng của chi nhánh đó, không trùng.</p>
        {fresh && (
          <div className="info-ok" role="status" style={{ marginBottom: 8 }}>
            Khóa mới, chỉ hiện một lần:
            <KeyRow label="Địa chỉ nhận khách" value={`${origin()}/api/leads/in?key=${fresh}`} onCopy={copy} />
            <KeyRow label="Địa chỉ hỏi hợp đồng đã ký" value={`${origin()}/api/leads/signed?key=${fresh}`} onCopy={copy} />
          </div>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tên khóa</th><th>Chi nhánh</th><th>Nhận lần cuối</th><th /></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.label}</td>
                  <td>{branchName(k.branch_id)}</td>
                  <td>{k.last_at ? fmtDateTime(k.last_at) : 'chưa có'}</td>
                  <td>{canEdit && <Button small variant="danger" disabled={busy} onClick={() => delKey(k.id)}>Thu hồi</Button>}</td>
                </tr>
              ))}
              {keys.length === 0 && <tr><td colSpan={4}>Chưa có khóa nào.</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }}>
            <Field label="Tên khóa" htmlFor="mk-lk-label"><Input id="mk-lk-label" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
            <Field label="Chi nhánh" htmlFor="mk-lk-branch">
              <Select id="mk-lk-branch" value={branch || user?.branches[0]?.id || ''} onChange={(e) => setBranch(e.target.value)}>
                {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Button variant="primary" disabled={busy || !label.trim()} onClick={addKey}>Tạo khóa</Button>
          </div>
        )}
      </Panel>
    </>
  )
}

function KeyRow({ label, value, onCopy }: { label: string; value: string; onCopy: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0' }}>
      <span className="cell-sub" style={{ minWidth: 150 }}>{label}</span>
      <code style={{ wordBreak: 'break-all' }}>{value}</code>
      <Button small type="button" onClick={() => onCopy(value)}>Sao chép</Button>
    </div>
  )
}
