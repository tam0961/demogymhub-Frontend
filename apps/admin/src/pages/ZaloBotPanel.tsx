import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { Button, Field, Input, Panel, Segmented, Tabs, useToast } from '../components/ui'
import { ConfirmDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'

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

type TplGroup = 'pt' | 'clean' | 'shoot'
const TPL_GROUPS: { key: TplGroup; label: string; items: { k: string; label: string; vars: string }[] }[] = [
  {
    key: 'pt',
    label: 'Báo ca/off',
    items: [
      { k: 'today', label: 'Mẫu báo ca hôm nay (7:00)', vars: '{list} danh sách PT, {bot} tên bot' },
      { k: 'missing', label: 'Nhắc PT chưa báo ca (8:00)', vars: '{date} ngày, {names} tên PT chưa báo, {bot} tên bot' },
      { k: 'off', label: 'Nhắc lịch off (Chủ nhật 20:00)', vars: '{bot} tên bot' },
      { k: 'tomorrow', label: 'Ca lớp nhóm ngày mai (21:00)', vars: '{dow} thứ, {date} ngày, {list} danh sách lớp' },
    ],
  },
  { key: 'clean', label: 'Vệ sinh', items: TPL_KEYS.map((k) => ({ k, label: TPL_LABEL[k], vars: TPL_VARS[k] })) },
  {
    key: 'shoot',
    label: 'Đăng ký buổi quay',
    items: [
      { k: 'form', label: 'Mẫu đăng ký lịch quay (8h và 15h)', vars: '{week} tuần quay, {list} PT còn thiếu, {bot} tên bot' },
      { k: 'remind', label: 'Nhắc lịch quay (19h hôm trước)', vars: '{when} ngày quay, {list} lịch quay, {status} trạng thái xác nhận, {bot} tên bot' },
      { k: 'confirmed', label: 'Emma đã xác nhận', vars: '{week} tuần quay, {list} lịch quay, {missing} PT còn thiếu' },
    ],
  },
]

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
  clean_tpl: Record<string, string>
  clean_tpl_default: Record<string, string>
  pt_tpl: Record<string, string>
  pt_tpl_default: Record<string, string>
  shoot_tpl: Record<string, string>
  shoot_tpl_default: Record<string, string>
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
  const [form, setForm] = useState({ enabled: false, bot_name: 'Bot AI TH Gym', pt_group: '', branch_id: '', group_trainer: '', group_windows: '', clean_on: false, clean_group: '', clean_tpl: {} as Record<string, string>, pt_tpl: {} as Record<string, string>, shoot_tpl: {} as Record<string, string>, shoot_on: false, shoot_group: '', shoot_boss: 'emma' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [tplTab, setTplTab] = useState<TplGroup>('pt')
  const [draft, setDraft] = useState<Record<TplGroup, Record<string, string>>>({ pt: {}, clean: {}, shoot: {} })
  const [offAsk, setOffAsk] = useState<'main' | 'clean' | 'shoot' | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: Cfg }>('/zalo/bot/config')
      setCfg(data.data)
      setForm({
        enabled: data.data.enabled, bot_name: data.data.bot_name, pt_group: data.data.pt_group,
        branch_id: data.data.branch_id || (user?.branches.length === 1 ? user.branches[0].id : ''),
        group_trainer: data.data.group_trainer, group_windows: data.data.group_windows,
        clean_on: data.data.clean_on, clean_group: data.data.clean_group, clean_tpl: { ...data.data.clean_tpl }, pt_tpl: { ...data.data.pt_tpl }, shoot_tpl: { ...data.data.shoot_tpl },
        shoot_on: data.data.shoot_on, shoot_group: data.data.shoot_group, shoot_boss: data.data.shoot_boss,
      })
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [user])
  useEffect(() => { load() }, [load])

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const FIELD = { main: 'enabled', clean: 'clean_on', shoot: 'shoot_on' } as const
  const OFF_TEXT = { main: 'Bot sẽ ngừng nhận tin và ngừng gửi nhắc ở tất cả các nhóm.', clean: 'Bot sẽ ngừng gửi checklist và nhắc vệ sinh vào nhóm vệ sinh.', shoot: 'Bot sẽ ngừng nhắc đăng ký và nhắc lịch quay trong nhóm quay.' }
  const flip = (kind: 'main' | 'clean' | 'shoot', on: boolean) => {
    if (on) set({ [FIELD[kind]]: true })
    else setOffAsk(kind)
  }

  const save = async (e?: FormEvent, patch: Partial<typeof form> = {}) => {
    e?.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const f = { ...form, ...patch }
      const diff = (m: Record<string, string>, def: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([k, v]) => v && v !== def[k]))
      await api.put('/zalo/bot/config', { ...f, clean_tpl: cfg ? diff(f.clean_tpl, cfg.clean_tpl_default) : {}, pt_tpl: cfg ? diff(f.pt_tpl, cfg.pt_tpl_default) : {}, shoot_tpl: cfg ? diff(f.shoot_tpl, cfg.shoot_tpl_default) : {}, token: token || undefined })
      setToken('')
      toast('Đã lưu thiết lập bot Zalo')
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

  return (
    <form onSubmit={save}>
    <Panel title="Zalo Bot: cài đặt">
      {err && <div className="form-error" role="alert">{err}</div>}
      <div className="bot-boxes">
        <div className="bot-box">
          <div className="bot-head">
            <h3>Kết nối bot</h3>
            <Segmented<'on' | 'off'> ariaLabel="Bật hoặc tắt bot" options={[{ value: 'on', label: 'Bật' }, { value: 'off', label: 'Tắt' }]} value={form.enabled ? 'on' : 'off'} onChange={(v) => flip('main', v === 'on')} />
          </div>
          <Field label="Token bot" htmlFor="zb-token" hint={cfg.has_token ? 'Đã lưu, để trống để giữ nguyên.' : undefined}>
            <Input id="zb-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
        </div>
        <div className="bot-box">
          <h3>Bot báo ca/off</h3>
          <Field label="Mã nhóm PT" htmlFor="zb-group" hint="Nhắn tin tag bot trong nhóm, nhóm sẽ hiện ở dưới.">
            <div className="bot-row">
              <Input id="zb-group" value={form.pt_group} onChange={(e) => set({ pt_group: e.target.value })} />
              <Button type="button" onClick={() => call('/zalo/bot/send-test', 'Đã gửi tin thử vào nhóm')}>Gửi thử</Button>
            </div>
          </Field>
          {groups.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {groups.map((g) => <Button key={g.id} small type="button" variant={g.id === form.pt_group ? 'primary' : 'secondary'} onClick={() => set({ pt_group: g.id })}>{g.name || g.id}</Button>)}
            </div>
          )}
        </div>
        <div className="bot-box">
        <div className="bot-head">
          <h3>Bot vệ sinh</h3>
          <Segmented<'on' | 'off'> ariaLabel="Bật hoặc tắt bot vệ sinh" options={[{ value: 'on', label: 'Bật' }, { value: 'off', label: 'Tắt' }]} value={form.clean_on ? 'on' : 'off'} onChange={(v) => flip('clean', v === 'on')} />
        </div>
        <div className="form-grid">
          <Field label="Mã nhóm vệ sinh" htmlFor="zb-cgroup" hint="Nhắn tin tag bot trong nhóm vệ sinh, nhóm sẽ hiện ở dưới.">
            <div className="bot-row">
              <Input id="zb-cgroup" value={form.clean_group} onChange={(e) => set({ clean_group: e.target.value })} />
              <Button type="button" onClick={() => call('/zalo/bot/send-test-clean', 'Đã gửi tin thử vào nhóm vệ sinh')}>Gửi thử</Button>
            </div>
          </Field>
        </div>
        {groups.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: 0 }}>
            {groups.map((g) => <Button key={g.id} small type="button" variant={g.id === form.clean_group ? 'primary' : 'secondary'} onClick={() => set({ clean_group: g.id })}>{g.name || g.id}</Button>)}
          </div>
        )}
        </div>
        <div className="bot-box">
        <div className="bot-head">
          <h3>Bot đăng ký buổi quay</h3>
          <Segmented<'on' | 'off'> ariaLabel="Bật hoặc tắt bot buổi quay" options={[{ value: 'on', label: 'Bật' }, { value: 'off', label: 'Tắt' }]} value={form.shoot_on ? 'on' : 'off'} onChange={(v) => flip('shoot', v === 'on')} />
        </div>
        <div className="form-grid">
          <Field label="Mã nhóm quay" htmlFor="zb-sgroup" hint="Nhắn tin tag bot trong nhóm quay, nhóm sẽ hiện ở dưới.">
            <div className="bot-row">
              <Input id="zb-sgroup" value={form.shoot_group} onChange={(e) => set({ shoot_group: e.target.value })} />
              <Button type="button" onClick={() => call('/zalo/bot/send-test-shoot', 'Đã gửi tin thử vào nhóm quay')}>Gửi thử</Button>
            </div>
          </Field>
        </div>
        {groups.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: 0 }}>
            {groups.map((g) => <Button key={g.id} small type="button" variant={g.id === form.shoot_group ? 'primary' : 'secondary'} onClick={() => set({ shoot_group: g.id })}>{g.name || g.id}</Button>)}
          </div>
        )}
        </div>
      </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button type="button" onClick={() => { setDraft({ pt: { ...form.pt_tpl }, clean: { ...form.clean_tpl }, shoot: { ...form.shoot_tpl } }); setTplOpen(true) }}>Mẫu tin</Button>
          <Button type="button" onClick={() => call('/zalo/bot/check', 'Kết nối bot thành công')}>Kiểm tra kết nối</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu bot'}</Button>
        </div>
    </Panel>
    {tplOpen && cfg && (
      <Modal
        title="Mẫu tin của bot"
        onClose={() => setTplOpen(false)}
        footer={
          <>
            <Button onClick={() => setTplOpen(false)}>Hủy</Button>
            <Button variant="primary" disabled={busy} onClick={async () => { if (await save(undefined, { pt_tpl: draft.pt, clean_tpl: draft.clean, shoot_tpl: draft.shoot })) setTplOpen(false) }}>{busy ? 'Đang lưu...' : 'Lưu mẫu tin'}</Button>
          </>
        }
      >
        <Tabs<TplGroup> tabs={TPL_GROUPS.map((g) => ({ value: g.key, label: g.label }))} value={tplTab} onChange={setTplTab} />
        <p className="cell-sub" style={{ margin: '8px 0' }}>Mẫu nào để nguyên thì bot dùng mẫu gốc. Biến trong ngoặc nhọn được thay bằng giá trị thật khi gửi.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          {TPL_GROUPS.find((g) => g.key === tplTab)!.items.map((it) => {
            const defs = tplTab === 'pt' ? cfg.pt_tpl_default : tplTab === 'clean' ? cfg.clean_tpl_default : cfg.shoot_tpl_default
            const cur = draft[tplTab][it.k] ?? defs[it.k] ?? ''
            return (
              <div key={it.k} className="zns-card">
                <span className="cell-main">{it.label}</span>
                <textarea
                  className="input"
                  aria-label={`Mẫu tin: ${it.label}`}
                  rows={Math.min(14, Math.max(4, cur.split(String.fromCharCode(10)).length + 1))}
                  value={cur}
                  onChange={(e) => setDraft((d) => ({ ...d, [tplTab]: { ...d[tplTab], [it.k]: e.target.value } }))}
                />
                <div className="cell-sub">Biến: {it.vars}</div>
                <div><Button small type="button" onClick={() => setDraft((d) => ({ ...d, [tplTab]: { ...d[tplTab], [it.k]: defs[it.k] } }))}>Khôi phục mẫu gốc</Button></div>
              </div>
            )
          })}
        </div>
      </Modal>
    )}
    {offAsk && (
      <ConfirmDialog
        title="Tắt bot?"
        message={OFF_TEXT[offAsk]}
        confirmLabel="Tắt bot"
        danger
        onConfirm={() => { const patch = { [FIELD[offAsk]]: false }; set(patch); setOffAsk(null); void save(undefined, patch) }}
        onClose={() => setOffAsk(null)}
      />
    )}
    </form>
  )
}
