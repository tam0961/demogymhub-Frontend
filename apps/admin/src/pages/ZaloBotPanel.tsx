import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { Button, Chip, Field, Input, Panel, Select, useToast } from '../components/ui'

const TPL_KEYS = ['morning', 'afternoon', 'leaf', 'hourly', 'done', 'late'] as const
type TplKey = (typeof TPL_KEYS)[number]
const TPL_LABEL: Record<TplKey, string> = {
  morning: 'Checklist Ca Sáng (10:00)',
  afternoon: 'Checklist Ca Chiều (16:45)',
  leaf: 'Việc định kỳ ngày 15 và 30 (lau lá cây)',
  hourly: 'Nhắc định kỳ (8h, 12h, 14h, 18h, 20h)',
  done: 'Bot xác nhận khi có người nhắn "xong"',
  late: 'Nhắc khi quá hạn xác nhận',
}
const TPL_VARS: Record<TplKey, string> = {
  morning: '{deadline} hạn xác nhận, {bot} tên bot, {ca} tên ca, {date} ngày',
  afternoon: '{deadline} hạn xác nhận, {bot} tên bot, {ca} tên ca, {date} ngày',
  leaf: '{date} ngày',
  hourly: '{date} ngày',
  done: '{name} người xác nhận, {ca} tên ca, {time} giờ xác nhận',
  late: '{ca} tên ca, {deadline} hạn xác nhận, {bot} tên bot',
}

interface Cfg {
  enabled: boolean
  has_token: boolean
  bot_name: string
  pt_group: string
  branch_id: string
  group_trainer: string
  group_windows: string
  clean_on: boolean
  clean_group: string
  clean_tpl: Record<TplKey, string>
  clean_tpl_default: Record<TplKey, string>
  shoot_on: boolean
  shoot_group: string
  shoot_boss: string
  state: { lastPollAt: string | null; lastError: string | null; lastItemAt: string | null; chats: { id: string; type: string; name: string; at: string }[] }
}

export default function ZaloBotPanel() {
  const { user } = useAuth()
  const toast = useToast()
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [token, setToken] = useState('')
  const [form, setForm] = useState({ enabled: false, bot_name: 'Bot AI TH Gym', pt_group: '', branch_id: '', group_trainer: '', group_windows: '', clean_on: false, clean_group: '', clean_tpl: {} as Record<string, string>, shoot_on: false, shoot_group: '', shoot_boss: 'emma' })
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
        clean_on: data.data.clean_on, clean_group: data.data.clean_group, clean_tpl: { ...data.data.clean_tpl },
        shoot_on: data.data.shoot_on, shoot_group: data.data.shoot_group, shoot_boss: data.data.shoot_boss,
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
      const tpl: Record<string, string> = {}
      if (cfg) for (const k of TPL_KEYS) if (form.clean_tpl[k] && form.clean_tpl[k] !== cfg.clean_tpl_default[k]) tpl[k] = form.clean_tpl[k]
      await api.put('/zalo/bot/config', { ...form, clean_tpl: tpl, token: token || undefined })
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

  if (!cfg) return <Panel title="Zalo Bot báo ca và vệ sinh">{err ? <div className="form-error" role="alert">{err}</div> : <p className="cell-sub">Đang tải...</p>}</Panel>

  const groups = cfg.state.chats.filter((c) => c.type.toUpperCase() === 'GROUP')
  const alive = cfg.state.lastPollAt && Date.now() - Date.parse(cfg.state.lastPollAt) < 90_000

  return (
    <form onSubmit={save}>
    <Panel title="Zalo Bot: cài đặt">
      <p className="cell-sub">Chỉ bật bot ở một nơi: tắt phần nhận tin của bot Cloudflare cũ trước. PT lớp nhóm và khung giờ lớp nhóm lấy theo mặc định, đã đặt ở menu Lớp nhóm.</p>
      {err && <div className="form-error" role="alert">{err}</div>}
      <div className="bot-boxes">
        <div className="bot-box">
          <h3>Kết nối bot</h3>
          <Field label="Token bot" htmlFor="zb-token" hint={cfg.has_token ? 'Đã lưu, để trống để giữ nguyên.' : undefined}>
            <Input id="zb-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
          <Field label="Tên bot (để tag)" htmlFor="zb-name"><Input id="zb-name" value={form.bot_name} onChange={(e) => set({ bot_name: e.target.value })} /></Field>
          <label className="check">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Bật bot (nhận tin và gửi nhắc)
          </label>
          <div className="cell-sub">
            Trạng thái: {form.enabled ? (alive ? <Chip tone="ok">Đang nhận tin</Chip> : <Chip tone="warn">Chưa thấy hoạt động</Chip>) : <Chip>Đang tắt</Chip>}
            {cfg.state.lastPollAt && <> Lần hỏi Zalo gần nhất: {fmtDateTime(cfg.state.lastPollAt)}.</>}
            {cfg.state.lastItemAt && <> Tin gần nhất: {fmtDateTime(cfg.state.lastItemAt)}.</>}
            {cfg.state.lastError && <span className="form-error"> Lỗi: {cfg.state.lastError}</span>}
          </div>
        </div>
        <div className="bot-box">
          <h3>Bot báo ca/off</h3>
          <p className="cell-sub">Đọc tin báo ca và lịch off trong nhóm PT, ghi vào Lịch PT 1:1, nhắc giờ trong nhóm.</p>
          <Field label="Mã nhóm PT" htmlFor="zb-group" hint="Nhắn tin tag bot trong nhóm, nhóm sẽ hiện ở dưới.">
            <Input id="zb-group" value={form.pt_group} onChange={(e) => set({ pt_group: e.target.value })} />
          </Field>
          {groups.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {groups.map((g) => <Button key={g.id} small type="button" variant={g.id === form.pt_group ? 'primary' : 'secondary'} onClick={() => set({ pt_group: g.id })}>{g.name || g.id}</Button>)}
            </div>
          )}
          <Field label="Chi nhánh" htmlFor="zb-branch">
            <Select id="zb-branch" value={form.branch_id} onChange={(e) => set({ branch_id: e.target.value })}>
              <option value="">Chọn chi nhánh</option>
              {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="bot-box">
        <h3>Bot vệ sinh</h3>
        <p className="cell-sub">Gửi checklist Ca Sáng 10:00 và Ca Chiều 16:45 vào nhóm vệ sinh, hạn xác nhận 1 giờ 15 phút. Nhân viên nhắn "xong" thì bot ghi tên và giờ. Nhắc kiểm tra toilet, dẹp tạ lúc 8h, 12h, 14h, 18h, 20h. Dùng chung token và tên bot ở trên.</p>
        <div className="form-grid">
          <Field label="Mã nhóm vệ sinh" htmlFor="zb-cgroup" hint="Nhắn tin tag bot trong nhóm vệ sinh, nhóm sẽ hiện ở dưới.">
            <Input id="zb-cgroup" value={form.clean_group} onChange={(e) => set({ clean_group: e.target.value })} />
          </Field>
        </div>
        {groups.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            <span className="cell-sub">Nhóm bot đã thấy:</span>
            {groups.map((g) => <Button key={g.id} small type="button" variant={g.id === form.clean_group ? 'primary' : 'secondary'} onClick={() => set({ clean_group: g.id })}>{g.name || g.id}</Button>)}
          </div>
        )}
        <label className="check" style={{ display: 'block', margin: '8px 0' }}>
          <input type="checkbox" checked={form.clean_on} onChange={(e) => set({ clean_on: e.target.checked })} /> Bật bot vệ sinh
        </label>
        </div>
        <div className="bot-box">
        <h3>Bot buổi quay với Emma</h3>
        <p className="cell-sub">Nhắc PT Trang và PT Thịnh đăng ký lịch quay từ Thứ 7 tuần trước đến Thứ 6 của tuần quay (8h và 15h). PT điền "Trang : thứ 4 14h", Emma nhắn "xác nhận" hoặc "đổi lịch". 19h tối hôm trước bot nhắc lại lịch quay. Dùng chung token và tên bot ở trên.</p>
        <div className="form-grid">
          <Field label="Mã nhóm quay" htmlFor="zb-sgroup" hint="Nhắn tin tag bot trong nhóm quay, nhóm sẽ hiện ở dưới.">
            <Input id="zb-sgroup" value={form.shoot_group} onChange={(e) => set({ shoot_group: e.target.value })} />
          </Field>
          <Field label="Tên Zalo của Emma (chữ để nhận ra)" htmlFor="zb-sboss" hint="Tên Zalo có chữ này thì được xác nhận hoặc đổi lịch.">
            <Input id="zb-sboss" value={form.shoot_boss} onChange={(e) => set({ shoot_boss: e.target.value })} />
          </Field>
        </div>
        {groups.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            <span className="cell-sub">Nhóm bot đã thấy:</span>
            {groups.map((g) => <Button key={g.id} small type="button" variant={g.id === form.shoot_group ? 'primary' : 'secondary'} onClick={() => set({ shoot_group: g.id })}>{g.name || g.id}</Button>)}
          </div>
        )}
        <label className="check" style={{ display: 'block', margin: '8px 0' }}>
          <input type="checkbox" checked={form.shoot_on} onChange={(e) => set({ shoot_on: e.target.checked })} /> Bật bot buổi quay
        </label>
        </div>
      </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button type="button" onClick={() => call('/zalo/bot/check', 'Kết nối bot thành công')}>Kiểm tra kết nối</Button>
          <Button type="button" onClick={() => call('/zalo/bot/send-test', 'Đã gửi tin thử vào nhóm')}>Gửi tin thử vào nhóm</Button>
          <Button type="button" onClick={() => call('/zalo/bot/send-test-clean', 'Đã gửi tin thử vào nhóm vệ sinh')}>Gửi tin thử nhóm vệ sinh</Button>
          <Button type="button" onClick={() => call('/zalo/bot/send-test-shoot', 'Đã gửi tin thử vào nhóm quay')}>Gửi tin thử nhóm quay</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu bot'}</Button>
        </div>
    </Panel>
    <div style={{ height: 16 }} />
    <Panel title="Zalo Bot: tin nhắn mẫu">
      <p className="cell-sub">Sửa nội dung tin bot vệ sinh gửi vào nhóm. Dòng nào để mẫu gốc thì bot dùng mẫu gốc. Biến trong ngoặc nhọn được thay bằng giá trị thật khi gửi.</p>
        <div className="zns-grid">
          {TPL_KEYS.map((k) => (
            <div key={k} className="zns-card">
              <span className="cell-main">{TPL_LABEL[k]}</span>
              <textarea
                className="input"
                aria-label={`Mẫu tin: ${TPL_LABEL[k]}`}
                rows={k === 'morning' || k === 'afternoon' ? 14 : 4}
                value={form.clean_tpl[k] ?? cfg.clean_tpl_default[k]}
                onChange={(e) => set({ clean_tpl: { ...form.clean_tpl, [k]: e.target.value } })}
              />
              <div className="cell-sub">Biến: {TPL_VARS[k]}</div>
              <div><Button small type="button" onClick={() => set({ clean_tpl: { ...form.clean_tpl, [k]: cfg.clean_tpl_default[k] } })}>Khôi phục mẫu gốc</Button></div>
            </div>
          ))}
        </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu tin nhắn mẫu'}</Button>
      </div>
    </Panel>
    </form>
  )
}
