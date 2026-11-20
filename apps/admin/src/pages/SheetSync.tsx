import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtDateTime } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { ConfirmDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'
import { Button, Chip, Field, Input, PageHeader, Panel, Segmented, Select, useToast } from '../components/ui'
import type { PendingSheetMember, SheetSyncCfg } from '../types'

interface ImportItem { name: string; phone: string; email: string; action: 'exists' | 'create' | 'skip'; reason: string; total: number; promo: number; remaining: number; packageName: string; end: string | null; status: 'active' | 'expired' | null }
interface ImportPlan { dryRun: boolean; items: ImportItem[]; counts: { exists: number; created: number; contracts: number; skipped: number; other_packages: number } }

type Kind = 'write' | 'pull'
const ON_OFF = [{ value: 'on' as const, label: 'Bật' }, { value: 'off' as const, label: 'Tắt' }]
const COUNT_LABEL: Record<string, string> = { classes: 'lớp', registrations: 'đăng ký', created: 'tạo mới', updated: 'cập nhật', unmatched: 'chưa khớp hội viên', skipped: 'bỏ qua' }

export default function SheetSync() {
  const { user } = useAuth()
  const toast = useToast()
  const [cfg, setCfg] = useState<SheetSyncCfg | null>(null)
  const [form, setForm] = useState({ write_on: false, bridge_url: '', pull_on: false, dump_url: '', branch_id: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [offAsk, setOffAsk] = useState<Kind | null>(null)
  const [scriptCode, setScriptCode] = useState('')
  const [pending, setPending] = useState<PendingSheetMember[]>([])
  const [approving, setApproving] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [importAsk, setImportAsk] = useState(false)

  const apply = (c: SheetSyncCfg) => {
    setCfg(c)
    setForm({ write_on: c.write_on, bridge_url: c.bridge_url, pull_on: c.pull_on, dump_url: c.dump_url, branch_id: c.branch_id })
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: SheetSyncCfg }>('/sheetsync/config')
      apply(data.data)
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [])
  const loadPending = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: PendingSheetMember[] }>('/sheetsync/pending-members')
      setPending(data.data)
    } catch {
      setPending([])
    }
  }, [])
  useEffect(() => { void load(); void loadPending() }, [load, loadPending])

  const previewImport = async () => {
    setBusy(true)
    try {
      const { data } = await api.post<{ data: ImportPlan }>('/sheetsync/import-members', { dry_run: true })
      setPlan(data.data)
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    setImportAsk(false)
    setBusy(true)
    try {
      const { data } = await api.post<{ data: ImportPlan }>('/sheetsync/import-members', { dry_run: false })
      setPlan(data.data)
      toast(`Đã tạo ${data.data.counts.created} hội viên, ${data.data.counts.contracts} hợp đồng PT nhóm`)
      await loadPending()
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy(false)
    }
  }

  const approve = async (m: PendingSheetMember) => {
    setApproving(m.phone)
    try {
      const { data } = await api.post<{ data: { member_id: string; code: string } }>('/sheetsync/pending-members/approve', { phone: m.phone })
      toast(`Đã tạo hội viên ${m.name}, mã ${data.data.code}`)
      await loadPending()
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setApproving('')
    }
  }

  const save = async (patch: Partial<typeof form> = {}) => {
    setErr('')
    setBusy(true)
    try {
      const { data } = await api.put<{ data: SheetSyncCfg }>('/sheetsync/config', { ...form, ...patch })
      apply(data.data)
      toast('Đã lưu thiết lập đồng bộ Sheet')
      return true
    } catch (e) {
      setErr(apiError(e).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const flip = (kind: Kind, on: boolean) => {
    if (on) setForm((f) => ({ ...f, [kind === 'write' ? 'write_on' : 'pull_on']: true }))
    else setOffAsk(kind)
  }

  const openScript = async () => {
    try {
      const { data } = await api.get<{ data: { code: string } }>('/sheetsync/script')
      setScriptCode(data.data.code)
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  const pullNow = async () => {
    if (!(await save())) return
    try {
      const { data } = await api.post<{ data: { ok: boolean; error?: string } }>('/sheetsync/pull-now')
      toast(data.data.ok ? 'Đã kéo dữ liệu từ Sheet' : `Không kéo được: ${data.data.error ?? 'lỗi không rõ'}`)
      await load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  const retry = async () => {
    try {
      const { data } = await api.post<{ data: SheetSyncCfg }>('/sheetsync/retry')
      apply(data.data)
      toast('Đã thử gửi lại các lượt lỗi')
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  if (!cfg) return <><PageHeader title="Đồng bộ Sheet" />{err ? <div className="form-error" role="alert">{err}</div> : <p className="cell-sub">Đang tải...</p>}</>

  const counts = cfg.write_log.counts
  const pullCounts = cfg.last_pull_counts ? Object.entries(cfg.last_pull_counts).map(([k, v]) => `${v} ${COUNT_LABEL[k] ?? k}`).join(', ') : ''

  return (
    <>
      <PageHeader title="Đồng bộ Sheet" sub="Chạy song song với Sheet cũ cho tới khi bạn tắt. Đăng ký ở app được ghi sang Sheet, thay đổi trong Sheet được kéo về app." />
      {err && <div className="form-error" role="alert">{err}</div>}
      <div className="bot-boxes">
        <div className="bot-box">
          <div className="bot-head">
            <h3>Ghi sang Sheet</h3>
            <Segmented<'on' | 'off'> ariaLabel="Bật hoặc tắt ghi sang Sheet" options={ON_OFF} value={form.write_on ? 'on' : 'off'} onChange={(v) => flip('write', v === 'on')} />
          </div>
          <p className="cell-sub">Khi khách đăng ký lớp ở app, hệ thống gửi thêm một lượt đăng ký vào Google Form của Sheet qua cầu nối cũ. Hủy đăng ký trong app không ghi sang Sheet, PT cần hủy bên Sheet nếu cần.</p>
          <Field label="Địa chỉ cầu nối Apps Script (đang dùng ở booking.thgym.com)" htmlFor="ss-bridge">
            <Input id="ss-bridge" value={form.bridge_url} onChange={(e) => setForm((f) => ({ ...f, bridge_url: e.target.value }))} />
          </Field>
          <div className="cell-sub">
            Đã ghi: <b>{counts.ok ?? 0}</b>, chờ gửi: <b>{counts.pending ?? 0}</b>, lỗi: <b>{counts.failed ?? 0}</b>, bỏ qua: <b>{counts.skipped ?? 0}</b>
          </div>
        </div>
        <div className="bot-box">
          <div className="bot-head">
            <h3>Kéo từ Sheet về app</h3>
            <Segmented<'on' | 'off'> ariaLabel="Bật hoặc tắt kéo từ Sheet" options={ON_OFF} value={form.pull_on ? 'on' : 'off'} onChange={(v) => flip('pull', v === 'on')} />
          </div>
          <p className="cell-sub">Mỗi 5 phút app đọc Sheet để lấy lớp, đăng ký mới, trạng thái "Đã học" và PT phụ trách. Cần dán một đoạn Apps Script vào Sheet và triển khai thành Web app.</p>
          <Field label="Địa chỉ Web app Apps Script đọc Sheet" htmlFor="ss-dump" hint="Dạng https://script.google.com/macros/s/.../exec">
            <Input id="ss-dump" value={form.dump_url} onChange={(e) => setForm((f) => ({ ...f, dump_url: e.target.value }))} />
          </Field>
          <Field label="Chi nhánh của các lớp trong Sheet" htmlFor="ss-branch">
            <Select id="ss-branch" value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}>
              <option value="">Chọn chi nhánh</option>
              {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <div className="cell-sub">
            {cfg.last_pull_at ? <>Lần kéo gần nhất: {fmtDateTime(cfg.last_pull_at)}{pullCounts ? `, ${pullCounts}` : ''}. </> : 'Chưa kéo lần nào. '}
            {cfg.last_pull_error && <span className="form-error">Lỗi: {cfg.last_pull_error}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" onClick={openScript}>Lấy mã Apps Script</Button>
            <Button type="button" onClick={pullNow}>Kéo ngay</Button>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', margin: '10px 0' }}>
        <Button variant="primary" disabled={busy} onClick={() => save()}>{busy ? 'Đang lưu...' : 'Lưu thiết lập'}</Button>
      </div>

      <Panel title="Nhập tất cả hội viên từ Sheet">
        <p className="cell-sub">Hội viên đã có trong app giữ nguyên. Hội viên chưa có sẽ được tạo với giới tính nữ. Gói PT nhóm tính theo (số buổi đã học + số buổi còn lại): 10 là PT nhóm 10 buổi, 20 là PT nhóm 20 buổi, 11 và 22 là gói 10 và 20 buổi cộng 1 và 2 buổi khuyến mãi. Tổng khác thì dùng gói chung "PT nhóm (nhập từ Sheet)". Hợp đồng nhập có giá 0 đồng nên không ảnh hưởng doanh thu hay công nợ.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button disabled={busy} onClick={previewImport}>Xem trước</Button>
          <Button variant="primary" disabled={busy || !plan || plan.counts.created === 0 || !plan.dryRun} onClick={() => setImportAsk(true)}>Nhập thật</Button>
        </div>
        {plan && (
          <>
            <p className="cell-sub" style={{ margin: '8px 0' }}>
              {plan.dryRun ? 'Xem trước, chưa ghi gì.' : 'Đã nhập.'} Đã có trong app: {plan.counts.exists}. Tạo mới: {plan.counts.created}. Hợp đồng: {plan.counts.contracts}. Gói khác: {plan.counts.other_packages}. Bỏ qua: {plan.counts.skipped}.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Họ tên</th><th>Số điện thoại</th><th>Kết quả</th><th>Gói</th><th className="num">Tổng buổi</th><th className="num">Còn lại</th><th>Hết hạn</th></tr></thead>
                <tbody>
                  {plan.items.map((i) => (
                    <tr key={i.phone || i.name}>
                      <td><span className="cell-main">{i.name}</span></td>
                      <td>{i.phone}</td>
                      <td>{i.reason}</td>
                      <td>{i.packageName || '-'}{i.promo ? ` (+${i.promo} khuyến mãi)` : ''}</td>
                      <td className="num">{i.total || '-'}</td>
                      <td className="num">{i.total ? i.remaining : '-'}</td>
                      <td>{i.end ? fmtDate(i.end) : '-'}{i.status === 'expired' && i.total ? ' (hết hạn)' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title={`Hội viên có trong Sheet, chưa có trong app (${pending.length})`}>
        <p className="cell-sub">Hội viên mới đăng ký PT nhóm trong app sẽ tự được thêm vào tab Members của Sheet (cần có email). Chiều ngược lại: người có trong Sheet mà chưa có trong app hiện ở đây, bạn tạo từng người một.</p>
        {pending.length === 0 ? (
          <p className="cell-sub">Không có hội viên nào đang chờ.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Họ tên</th><th>Số điện thoại</th><th>Email</th><th>Ngày hết hạn</th><th className="num">Số buổi còn lại</th><th /></tr></thead>
              <tbody>
                {pending.map((m) => (
                  <tr key={m.phone}>
                    <td><span className="cell-main">{m.name}</span>{m.note && <div className="cell-sub">{m.note}</div>}</td>
                    <td>{m.phone}</td>
                    <td>{m.email || '-'}</td>
                    <td>{m.expiry ? fmtDate(m.expiry) : '-'}</td>
                    <td className="num">{m.remaining}</td>
                    <td><Button small disabled={approving === m.phone} onClick={() => approve(m)}>{approving === m.phone ? 'Đang tạo...' : 'Tạo hội viên'}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={`Lượt ghi sang Sheet bị lỗi hoặc bỏ qua (${cfg.write_log.problems.length})`} note={<Button small onClick={retry}>Thử gửi lại</Button>}>
        {cfg.write_log.problems.length === 0 ? (
          <p className="cell-sub">Không có lượt nào bị lỗi.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Hội viên</th><th>Buổi</th><th>Trạng thái</th><th>Lý do</th></tr></thead>
              <tbody>
                {cfg.write_log.problems.map((p) => (
                  <tr key={p.id}>
                    <td><span className="cell-main">{p.member_name}</span><div className="cell-sub">{p.phone}</div></td>
                    <td>{p.class_date.slice(8, 10)}/{p.class_date.slice(5, 7)} {p.class_start}</td>
                    <td><Chip tone={p.status === 'failed' ? 'bad' : 'warn'}>{p.status === 'failed' ? `Lỗi (${p.attempts} lần)` : 'Bỏ qua'}</Chip></td>
                    <td>{p.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

            {importAsk && plan && (
        <ConfirmDialog title="Nhập hội viên từ Sheet?" message={`Tạo ${plan.counts.created} hội viên mới và ${plan.counts.contracts} hợp đồng PT nhóm. Hội viên đã có trong app không bị đổi.`} confirmLabel="Nhập thật" onConfirm={runImport} onClose={() => setImportAsk(false)} />
      )}
{offAsk && (
        <ConfirmDialog
          title="Tắt đồng bộ?"
          message={offAsk === 'write' ? 'Đăng ký mới ở app sẽ không được ghi sang Sheet nữa.' : 'App sẽ ngừng kéo lớp, đăng ký và trạng thái từ Sheet.'}
          confirmLabel="Tắt"
          danger
          onConfirm={() => { const patch = offAsk === 'write' ? { write_on: false } : { pull_on: false }; setOffAsk(null); void save(patch) }}
          onClose={() => setOffAsk(null)}
        />
      )}
      {scriptCode && (
        <Modal title="Cho phép app đọc Sheet bằng Apps Script" onClose={() => setScriptCode('')} footer={<><Button onClick={() => { navigator.clipboard?.writeText(scriptCode).then(() => toast('Đã sao chép mã')).catch(() => {}) }}>Sao chép mã</Button><Button variant="primary" onClick={() => setScriptCode('')}>Đóng</Button></>}>
          <ol style={{ margin: '0 0 12px', paddingLeft: 20, display: 'grid', gap: 4 }}>
            <li>Mở Sheet "TH Gym PT Booking System", vào Tiện ích mở rộng, Apps Script (hoặc mở script.google.com bằng Gmail chủ Sheet).</li>
            <li>Tạo tệp mới, dán đoạn mã bên dưới (bấm "Sao chép mã"), bấm Lưu. Nếu script đã có hàm doGet hoặc doPost thì tạo dự án mới thay vì dán chung.</li>
            <li>Bấm "Triển khai", "Tùy chọn triển khai mới", chọn loại "Ứng dụng web".</li>
            <li>Mục "Thực thi bằng": Tôi. Mục "Ai có quyền truy cập": Bất kỳ ai. Bấm "Triển khai", cho phép quyền khi Google hỏi.</li>
            <li>Sao chép "URL ứng dụng web", dán vào ô "Địa chỉ Web app Apps Script đọc Sheet", chọn chi nhánh, bật kéo và bấm "Lưu thiết lập".</li>
          </ol>
          <textarea className="input" readOnly rows={12} value={scriptCode} aria-label="Mã Apps Script" style={{ fontFamily: 'monospace', fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
        </Modal>
      )}
    </>
  )
}
