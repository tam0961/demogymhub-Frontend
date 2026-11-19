import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { Button, Chip, Field, Input, Panel, Select, useToast } from '../components/ui'

interface Cfg {
  enabled: boolean
  has_token: boolean
  bot_name: string
  pt_group: string
  branch_id: string
  group_trainer: string
  group_windows: string
  state: { lastPollAt: string | null; lastError: string | null; lastItemAt: string | null; chats: { id: string; type: string; name: string; at: string }[] }
}

export default function ZaloBotPanel() {
  const { user } = useAuth()
  const toast = useToast()
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [token, setToken] = useState('')
  const [form, setForm] = useState({ enabled: false, bot_name: 'Bot AI TH Gym', pt_group: '', branch_id: '', group_trainer: '', group_windows: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: Cfg }>('/zalo/bot/config')
      setCfg(data.data)
      setForm({
        enabled: data.data.enabled, bot_name: data.data.bot_name, pt_group: data.data.pt_group,
        branch_id: data.data.branch_id || (user?.branches.length === 1 ? user.branches[0].id : ''),
        group_trainer: data.data.group_trainer, group_windows: data.data.group_windows,
      })
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [user])
  useEffect(() => { load() }, [load])

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await api.put('/zalo/bot/config', { ...form, token: token || undefined })
      setToken('')
      toast('Đã lưu thiết lập bot Zalo báo ca')
      await load()
      return true
    } catch (er) {
      setErr(apiError(er).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const call = async (path: string, okText: string) => {
    if (!(await save())) return
    try {
      const { data } = await api.post<{ data: { ok: boolean; message: string } }>(path)
      toast(data.data.ok ? okText : `Không thành công: ${data.data.message}`)
    } catch (er) {
      toast(apiError(er).message)
    }
  }

  if (!cfg) return <Panel title="Zalo Bot báo ca">{err ? <div className="form-error" role="alert">{err}</div> : <p className="cell-sub">Đang tải...</p>}</Panel>

  const groups = cfg.state.chats.filter((c) => c.type.toUpperCase() === 'GROUP')
  const alive = cfg.state.lastPollAt && Date.now() - Date.parse(cfg.state.lastPollAt) < 90_000

  return (
    <Panel title="Zalo Bot báo ca">
      <p className="cell-sub">Đọc tin báo ca và lịch off trong nhóm PT rồi ghi vào Lịch PT 1:1, nhắc giờ trong nhóm. Chỉ bật bot ở một nơi: tắt phần nhận tin của bot Cloudflare cũ trước.</p>
      {err && <div className="form-error" role="alert">{err}</div>}
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Token bot" htmlFor="zb-token" hint={cfg.has_token ? 'Đã lưu, để trống để giữ nguyên.' : undefined}>
            <Input id="zb-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
          <Field label="Tên bot (để tag)" htmlFor="zb-name"><Input id="zb-name" value={form.bot_name} onChange={(e) => set({ bot_name: e.target.value })} /></Field>
          <Field label="Mã nhóm PT" htmlFor="zb-group" hint="Nhắn tin tag bot trong nhóm, nhóm sẽ hiện ở dưới.">
            <Input id="zb-group" value={form.pt_group} onChange={(e) => set({ pt_group: e.target.value })} />
          </Field>
          <Field label="Chi nhánh" htmlFor="zb-branch">
            <Select id="zb-branch" value={form.branch_id} onChange={(e) => set({ branch_id: e.target.value })}>
              <option value="">Chọn chi nhánh</option>
              {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="PT lớp nhóm" htmlFor="zb-gpt" hint="Ca trong khung lớp nhóm không ghi vào PT 1:1.">
            <Input id="zb-gpt" placeholder="Thịnh" value={form.group_trainer} onChange={(e) => set({ group_trainer: e.target.value })} />
          </Field>
          <Field label="Khung giờ lớp nhóm" htmlFor="zb-win">
            <Input id="zb-win" placeholder="06:30-07:45, 20:00-21:15" value={form.group_windows} onChange={(e) => set({ group_windows: e.target.value })} />
          </Field>
        </div>
        {groups.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            <span className="cell-sub">Nhóm bot đã thấy:</span>
            {groups.map((g) => <Button key={g.id} small type="button" variant={g.id === form.pt_group ? 'primary' : 'secondary'} onClick={() => set({ pt_group: g.id })}>{g.name || g.id}</Button>)}
          </div>
        )}
        <label className="check" style={{ display: 'block', margin: '8px 0' }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Bật bot (nhận tin và gửi nhắc)
        </label>
        <div className="cell-sub" style={{ marginBottom: 8 }}>
          Trạng thái: {form.enabled ? (alive ? <Chip tone="ok">Đang nhận tin</Chip> : <Chip tone="warn">Chưa thấy hoạt động</Chip>) : <Chip>Đang tắt</Chip>}
          {cfg.state.lastPollAt && <> Lần hỏi Zalo gần nhất: {fmtDateTime(cfg.state.lastPollAt)}.</>}
          {cfg.state.lastItemAt && <> Tin gần nhất: {fmtDateTime(cfg.state.lastItemAt)}.</>}
          {cfg.state.lastError && <span className="form-error"> Lỗi: {cfg.state.lastError}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button type="button" onClick={() => call('/zalo/bot/check', 'Kết nối bot thành công')}>Kiểm tra kết nối</Button>
          <Button type="button" onClick={() => call('/zalo/bot/send-test', 'Đã gửi tin thử vào nhóm')}>Gửi tin thử vào nhóm</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu bot'}</Button>
        </div>
      </form>
    </Panel>
  )
}
