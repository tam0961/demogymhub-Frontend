import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import type { AuditRow, CheckinItem, Contract, Me, Member, PayMethod, Payment, Pkg, RoleRow, SessionRow, Shift } from '../types'

const branches = [
  { id: 'b-nb', code: 'NB', name: 'Chi nhánh NB' },
  { id: 'b-q7', code: 'Q7', name: 'Chi nhánh Q7' },
]

const P = {
  members: ['members.read', 'members.create', 'members.update'],
  packages: ['packages.read', 'packages.create', 'packages.update'],
  contracts: ['contracts.create', 'contracts.read', 'contracts.sign', 'contracts.activate'],
  payments: ['payments.create', 'payments.read', 'payments.refund_request'],
  shifts: ['shifts.open', 'shifts.close'],
  checkins: ['checkins.create', 'checkins.read'],
}
const MANAGER_EXTRA = ['contracts.approve', 'contracts.freeze', 'contracts.cancel', 'payments.confirm', 'payments.refund', 'checkins.override', 'reports.view', 'reports.view_revenue', 'reports.export']
const ALL = [...Object.values(P).flat(), ...MANAGER_EXTRA, 'roles.read', 'roles.assign', 'system.view_audit_log']

const users: Record<string, { pw: string; me: Me }> = {
  'admin@gymhub.vn': { pw: 'admin123', me: { id: 'u1', email: 'admin@gymhub.vn', name: 'Chủ phòng', roles: ['super_admin'], permissions: ALL, branches } },
  'quanly@gymhub.vn': {
    pw: 'quanly123',
    me: { id: 'u3', email: 'quanly@gymhub.vn', name: 'Quản lý Q7', roles: ['manager'], permissions: [...Object.values(P).flat(), ...MANAGER_EXTRA], branches },
  },
  'letan@gymhub.vn': {
    pw: 'letan123',
    me: { id: 'u2', email: 'letan@gymhub.vn', name: 'Lễ tân NB', roles: ['receptionist'], permissions: [...Object.values(P).flat()], branches: [branches[0]] },
  },
}

const roleDefs: RoleRow[] = [
  { id: 'r1', name: 'super_admin', description: 'Toàn quyền', permissions: ALL },
  { id: 'r2', name: 'owner', description: 'Chủ phòng tập', permissions: ALL },
  { id: 'r3', name: 'manager', description: 'Quản lý chi nhánh', permissions: [...Object.values(P).flat(), ...MANAGER_EXTRA] },
  { id: 'r4', name: 'receptionist', description: 'Lễ tân', permissions: Object.values(P).flat() },
]
const adminUsers = [
  { id: 'u1', email: 'admin@gymhub.vn', name: 'Chủ phòng', roles: [{ id: 'ur1', role: 'super_admin', branch_id: null as string | null }] },
  { id: 'u3', email: 'quanly@gymhub.vn', name: 'Quản lý Q7', roles: [{ id: 'ur3', role: 'manager', branch_id: 'b-q7' as string | null }] },
  { id: 'u2', email: 'letan@gymhub.vn', name: 'Lễ tân NB', roles: [{ id: 'ur2', role: 'receptionist', branch_id: 'b-nb' as string | null }] },
]

const names = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Võ Thu Hà', 'Đặng Quốc Huy', 'Bùi Ngọc Lan', 'Hoàng Gia Khang', 'Phan Thanh Mai', 'Đỗ Anh Tuấn', 'Ngô Thùy Linh', 'Dương Bảo Long']
const statuses: Member['status'][] = ['active', 'active', 'expired', 'frozen']
const members: Member[] = names.map((name, i) => ({
  id: `m${i + 1}`,
  code: `TH${String(i + 1).padStart(4, '0')}`,
  name,
  phone: `09000000${String(10 + i)}`,
  email: i % 3 === 0 ? `hv${i + 1}@example.com` : null,
  gender: i % 2 ? 'female' : 'male',
  dob: `199${i % 10}-0${(i % 9) + 1}-15`,
  status: statuses[i % 4],
  branch_id: i % 2 ? 'b-q7' : 'b-nb',
  avatar_url: null,
  created_at: new Date(Date.now() - i * 86400000 * 9).toISOString(),
}))

const packages: Pkg[] = [
  { id: 'p1', name: 'Vé ngày', type: 'day', duration_days: 1, sessions: null, price: 80000, vat_percent: 8, branch_id: 'b-nb', active: true },
  { id: 'p2', name: 'Gói 1 tháng', type: 'month', duration_days: 30, sessions: null, price: 600000, vat_percent: 8, branch_id: 'b-nb', active: true },
  { id: 'p3', name: 'Gói 12 buổi PT', type: 'session', duration_days: null, sessions: 12, price: 3600000, vat_percent: 8, branch_id: 'b-nb', active: true },
  { id: 'p4', name: 'Gói 3 tháng (ngưng bán)', type: 'month', duration_days: 90, sessions: null, price: 1500000, vat_percent: 8, branch_id: 'b-q7', active: false },
  { id: 'p5', name: 'Gói 1 tháng Q7', type: 'month', duration_days: 30, sessions: null, price: 650000, vat_percent: 8, branch_id: 'b-q7', active: true },
  { id: 'p6', name: 'Gói 6 tháng Q7', type: 'month', duration_days: 180, sessions: null, price: 3000000, vat_percent: 8, branch_id: 'b-q7', active: true },
]

const DAY = 86400000
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString()
const day = (offsetDays = 0) => iso(offsetDays).slice(0, 10)
let seq = 100
const nid = (p: string) => `${p}${++seq}`

const contracts: Contract[] = []
const payments: Payment[] = []
const shifts: Shift[] = []
const checkins: (CheckinItem & { branch_id: string; direction: string })[] = []
const audit: AuditRow[] = []

function pkgOf(id: string) {
  return packages.find((p) => p.id === id) as Pkg
}
function memberOf(id: string) {
  return members.find((m) => m.id === id) as Member
}
function log(actor: string, action: string, resource: string, result = 'ALLOW', ago = 0) {
  audit.unshift({ id: nid('a'), actor_email: actor, actor, action, resource, result, ip: '127.0.0.1', created_at: new Date(Date.now() - ago).toISOString() })
}
function addEvent(c: Contract, type: string, by: string, reason: string | null = null, diff: unknown = null) {
  c.events = c.events ?? []
  c.events.push({ id: nid('e'), type, by_user: by, reason, diff, created_at: new Date().toISOString() })
}
function recalc(c: Contract) {
  c.paid_amount = payments.filter((p) => p.contract_id === c.id && p.status === 'confirmed').reduce((s, p) => s + p.amount, 0)
  c.debt_amount = Math.max(0, c.total_amount - c.paid_amount)
}
function seedContract(memberId: string, packageId: string, status: Contract['status'], paid: number, startOffset: number | null, by = 'Hệ thống') {
  const m = memberOf(memberId)
  const pk = pkgOf(packageId)
  const total = Math.round(pk.price * (1 + pk.vat_percent / 100))
  const start = startOffset == null ? null : day(startOffset)
  const c: Contract = {
    id: nid('c'), code: `HD${String(contracts.length + 1).padStart(5, '0')}`, member_id: m.id, package_id: pk.id, branch_id: m.branch_id, status,
    total_amount: total, discount: 0, paid_amount: 0, debt_amount: total, start_date: start,
    end_date: start && pk.duration_days ? day(startOffset! + pk.duration_days) : start ? day(startOffset! + 30) : null,
    sessions_total: pk.sessions, sessions_left: pk.sessions, signed_at: status === 'draft' ? null : iso(-10), activated_at: ['active', 'frozen', 'expired'].includes(status) ? iso(-10) : null,
    frozen_until: status === 'frozen' ? day(10) : null, renewed_from_id: null, note: null, created_at: iso(-12),
    member: { id: m.id, code: m.code, name: m.name, phone: m.phone }, package: { id: pk.id, name: pk.name, type: pk.type }, events: [],
  }
  addEvent(c, 'created', by)
  if (status !== 'draft') addEvent(c, 'signed', by)
  if (paid > 0) {
    payments.push({ id: nid('pay'), contract_id: c.id, method: 'cash', amount: paid, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: by, created_at: iso(-(startOffset == null ? 1 : -startOffset)), confirmed_at: iso(-(startOffset == null ? 1 : -startOffset)) })
  }
  contracts.unshift(c)
  recalc(c)
  return c
}
seedContract('m1', 'p2', 'active', 648000, -10)
seedContract('m2', 'p3', 'active', 3888000, -20)
seedContract('m3', 'p2', 'expired', 648000, -45)
seedContract('m4', 'p5', 'frozen', 702000, -15)
seedContract('m5', 'p2', 'signed', 300000, null)
seedContract('m6', 'p5', 'draft', 0, null)
seedContract('m7', 'p5', 'active', 702000, -26)
;([-6, -5, -4, -3, -2, -1].forEach((d, i) =>
  payments.push({ id: nid('pay'), contract_id: contracts[i % contracts.length].id, method: (['cash', 'transfer', 'vietqr', 'cash', 'ewallet', 'cash'] as PayMethod[])[i], amount: 400000 + i * 120000, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: 'Hệ thống', created_at: iso(d), confirmed_at: iso(d) }),
))
log('admin@gymhub.vn', 'auth.login', 'session', 'ALLOW', 3600000)
log('letan@gymhub.vn', 'contracts.cancel', 'contract', 'DENY', 7200000)
log('quanly@gymhub.vn', 'payments.confirm', 'payment', 'ALLOW', 9000000)

const sessions: SessionRow[] = [
  { id: 's1', user_agent: 'Chrome trên Windows', ip: '127.0.0.1', created_at: iso(-1), last_used_at: iso(0), current: true },
  { id: 's2', user_agent: 'Safari trên iPhone', ip: '10.0.0.8', created_at: iso(-3), last_used_at: iso(-2) },
]

const RT = 'gymhub_mock_rt'
const getRt = () => {
  try {
    return sessionStorage.getItem(RT)
  } catch {
    return null
  }
}
const setRt = (v: string | null) => {
  try {
    if (v) sessionStorage.setItem(RT, v)
    else sessionStorage.removeItem(RT)
  } catch {
    /* ignore */
  }
}

function fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): never {
  const response = { data: { error: { code, message } }, status, statusText: '', headers: {}, config }
  throw new AxiosError(message, 'ERR_BAD_REQUEST', config, null, response)
}

const pdfBlob = (c: Contract) =>
  new Blob([`%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\ntrailer<</Root 1 0 R>>\n% ${c.code}`], { type: 'application/pdf' })

export const mockAdapter: AxiosAdapter = async (config) => {
  await new Promise((r) => setTimeout(r, 150))
  const url = (config.url ?? '').split('?')[0]
  const method = (config.method ?? 'get').toLowerCase()
  const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : (config.data ?? {})
  const params = (config.params ?? {}) as Record<string, string | number | undefined>
  const ok = (data: unknown, extra: object = {}) => ({ data: { data, ...extra }, status: 200, statusText: 'OK', headers: {}, config })

  if (url === '/auth/login' && method === 'post') {
    const u = users[body.email]
    if (!u || u.pw !== body.password) fail(config, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng')
    setRt(body.email)
    return ok({ access_token: 'mock-' + Date.now(), user: { id: u.me.id, email: u.me.email, name: u.me.name } })
  }
  if (url === '/auth/renew' && method === 'post') {
    if (!getRt()) fail(config, 401, 'TOKEN_INVALID', 'Phiên đã hết hạn')
    return ok({ access_token: 'mock-' + Date.now() })
  }
  if (url === '/auth/logout') {
    setRt(null)
    return ok(null)
  }
  if (url === '/auth/forgot-password') return ok({ sent: true })
  if (url === '/auth/reset-password') {
    if (!body.token || body.token === 'bad') fail(config, 400, 'TOKEN_INVALID', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn')
    return ok({ reset: true })
  }

  const rt = getRt()
  const auth = config.headers?.get?.('Authorization')
  if (!rt || !auth) fail(config, 401, 'TOKEN_INVALID', 'Chưa đăng nhập')
  const rec = users[rt as string]
  const me = rec.me
  const isSuper = me.roles.includes('super_admin')
  const need = (p: string) => {
    if (!isSuper && !me.permissions.includes(p)) {
      log(me.email, p, url, 'DENY')
      fail(config, 403, 'FORBIDDEN', 'Không đủ quyền')
    }
  }
  const branchFilter = String(params.branch_id ?? config.headers?.get?.('X-Branch-Id') ?? '')
  const page = Number(params.page ?? 1)
  const limit = Number(params.limit ?? 10)
  const paged = <T>(rows: T[]) => ok(rows.slice((page - 1) * limit, page * limit), { meta: { page, limit, total: rows.length } })
  const myBranch = (id: string) => me.branches.some((b) => b.id === id) && (!branchFilter || branchFilter === id)

  if (url === '/me') return ok(me)

  if (url === '/auth/change-password' && method === 'post') {
    if (body.current !== rec.pw) fail(config, 400, 'INVALID_CREDENTIALS', 'Mật khẩu hiện tại không đúng')
    if (String(body.new ?? '').length < 8) fail(config, 422, 'VALIDATION', 'Mật khẩu mới tối thiểu 8 ký tự')
    rec.pw = body.new
    return ok({ access_token: 'mock-' + Date.now() })
  }
  if (url === '/auth/sessions' && method === 'get') return ok(sessions)
  const sm = url.match(/^\/auth\/sessions\/(.+)$/)
  if (sm && method === 'delete') {
    const i = sessions.findIndex((s) => s.id === sm[1])
    if (i >= 0) sessions.splice(i, 1)
    return ok(null)
  }

  if (url === '/members' && method === 'get') {
    const q = String(params.q ?? '').toLowerCase()
    let rows = members.filter((m) => me.branches.some((b) => b.id === m.branch_id))
    if (branchFilter) rows = rows.filter((m) => m.branch_id === branchFilter)
    if (params.status) rows = rows.filter((m) => m.status === params.status)
    if (q) rows = rows.filter((m) => m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.code.toLowerCase().includes(q))
    return paged(rows)
  }
  if (url === '/members' && method === 'post') {
    need('members.create')
    if (members.some((m) => m.phone === body.phone)) fail(config, 409, 'DUPLICATE_PHONE', 'Số điện thoại đã tồn tại')
    const m: Member = { id: `m${++seq}`, code: `TH${String(seq).padStart(4, '0')}`, avatar_url: null, created_at: new Date().toISOString(), ...body }
    members.unshift(m)
    return ok(m)
  }
  const mm = url.match(/^\/members\/(.+)$/)
  if (mm) {
    const m = members.find((x) => x.id === mm[1])
    if (!m) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    if (method === 'get') return ok(m)
    need('members.update')
    if (body.phone && members.some((x) => x.phone === body.phone && x.id !== m?.id)) fail(config, 409, 'DUPLICATE_PHONE', 'Số điện thoại đã tồn tại')
    Object.assign(m as Member, body)
    return ok(m)
  }

  if (url === '/packages' && method === 'get') {
    let rows = packages
    if (branchFilter) rows = rows.filter((p) => !p.branch_id || p.branch_id === branchFilter)
    return paged(rows.slice())
  }
  if (url === '/packages' && method === 'post') {
    need('packages.create')
    const p: Pkg = { id: `p${++seq}`, ...body }
    packages.unshift(p)
    return ok(p)
  }
  const pm = url.match(/^\/packages\/(.+)$/)
  if (pm) {
    const p = packages.find((x) => x.id === pm[1])
    if (!p) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    if (method === 'get') return ok(p)
    need('packages.update')
    Object.assign(p as Pkg, body)
    return ok(p)
  }

  /* contracts */
  if (url === '/contracts' && method === 'get') {
    need('contracts.read')
    const q = String(params.q ?? '').toLowerCase()
    let rows = contracts.filter((c) => myBranch(c.branch_id))
    if (params.member_id) rows = rows.filter((c) => c.member_id === params.member_id)
    if (params.status) rows = rows.filter((c) => c.status === params.status)
    if (params.expiring_within_days) {
      const lim = day(Number(params.expiring_within_days))
      rows = rows.filter((c) => c.status === 'active' && c.end_date && c.end_date <= lim && c.end_date >= day(0))
    }
    if (q) rows = rows.filter((c) => c.code.toLowerCase().includes(q) || c.member.name.toLowerCase().includes(q) || c.member.phone.includes(q))
    return paged(rows.map((c) => ({ ...c, events: undefined })))
  }
  if (url === '/contracts' && method === 'post') {
    need('contracts.create')
    const m = members.find((x) => x.id === body.member_id)
    const pk = packages.find((x) => x.id === body.package_id)
    if (!m || !pk) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hội viên hoặc gói')
    if (pk!.branch_id && pk!.branch_id !== m!.branch_id) fail(config, 422, 'BRANCH_MISMATCH', 'Gói tập không thuộc chi nhánh của hội viên')
    const discount = Number(body.discount ?? 0)
    const c = seedContract(m!.id, pk!.id, 'draft', 0, null, me.name)
    c.discount = discount
    c.total_amount = Math.max(0, c.total_amount - discount)
    c.note = body.note ?? null
    recalc(c)
    log(me.email, 'contracts.create', c.code)
    return ok(c)
  }
  const cm = url.match(/^\/contracts\/([^/]+)(?:\/(\w+))?$/)
  if (cm) {
    const c = contracts.find((x) => x.id === cm[1])
    if (!c) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hợp đồng')
    const k = c as Contract
    const act = cm[2]
    const bad = (m: string): never => fail(config, 409, 'INVALID_STATE', m)
    if (!act && method === 'get') {
      need('contracts.read')
      return ok({ ...k, payments: payments.filter((p) => p.contract_id === k.id) })
    }
    if (act === 'pdf') {
      need('contracts.read')
      return { data: pdfBlob(k), status: 200, statusText: 'OK', headers: { 'content-type': 'application/pdf' }, config }
    }
    if (method === 'post') {
      const pk = pkgOf(k.package_id)
      if (act === 'sign') {
        need('contracts.sign')
        if (k.status !== 'draft') bad('Hợp đồng không ở trạng thái nháp')
        if (!String(body.signature ?? '').startsWith('data:image/png')) fail(config, 422, 'VALIDATION', 'Thiếu chữ ký')
        k.status = 'signed'
        k.signed_at = iso()
        addEvent(k, 'signed', me.name)
      } else if (act === 'activate') {
        need('contracts.activate')
        if (k.status !== 'signed') bad('Chỉ kích hoạt được hợp đồng đã ký')
        if (k.debt_amount > 0) {
          if (!body.allow_debt) fail(config, 409, 'UNPAID', 'Hợp đồng chưa thanh toán đủ')
          need('contracts.approve')
        }
        const start = body.start_date ?? day(0)
        k.start_date = start
        k.end_date = new Date(new Date(start).getTime() + (pk.duration_days ?? 365) * DAY).toISOString().slice(0, 10)
        k.status = 'active'
        k.activated_at = iso()
        addEvent(k, 'activated', me.name, body.allow_debt ? 'Kích hoạt có công nợ' : null)
      } else if (act === 'renew') {
        need('contracts.create')
        if (k.status !== 'active' && k.status !== 'expired') bad('Chỉ gia hạn hợp đồng đang hiệu lực hoặc đã hết hạn')
        const n = seedContract(k.member_id, body.package_id ?? k.package_id, 'draft', 0, null, me.name)
        n.renewed_from_id = k.id
        addEvent(k, 'renewed', me.name)
        return ok(n)
      } else if (act === 'freeze') {
        need('contracts.freeze')
        if (k.status !== 'active') bad('Chỉ bảo lưu hợp đồng đang hiệu lực')
        k.status = 'frozen'
        k.frozen_until = day(Number(body.days))
        addEvent(k, 'frozen', me.name, body.reason, { days: body.days })
      } else if (act === 'unfreeze') {
        need('contracts.freeze')
        if (k.status !== 'frozen') bad('Hợp đồng không đang bảo lưu')
        k.status = 'active'
        k.frozen_until = null
        addEvent(k, 'unfrozen', me.name)
      } else if (act === 'cancel') {
        need('contracts.cancel')
        if (k.status === 'cancelled' || k.status === 'expired') bad('Không thể hủy hợp đồng này')
        k.status = 'cancelled'
        addEvent(k, 'cancelled', me.name, body.reason)
      } else fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
      log(me.email, `contracts.${act}`, k.code)
      return ok(k)
    }
  }

  /* shifts */
  if (url === '/shifts/current') return ok(shifts.find((s) => s.user_id === me.id && !s.closed_at) ?? null)
  if (url === '/shifts/open' && method === 'post') {
    need('shifts.open')
    if (shifts.some((s) => s.user_id === me.id && !s.closed_at)) fail(config, 409, 'SHIFT_ALREADY_OPEN', 'Bạn đã có ca đang mở')
    const s: Shift = { id: nid('sh'), user_id: me.id, branch_id: branchFilter || me.branches[0].id, opened_at: iso(), closed_at: null, opening_cash: Number(body.opening_cash ?? 0) }
    shifts.push(s)
    return ok(s)
  }
  const shm = url.match(/^\/shifts\/([^/]+)\/close$/)
  if (shm && method === 'post') {
    need('shifts.close')
    const s = shifts.find((x) => x.id === shm[1])
    if (!s || s.closed_at) fail(config, 409, 'INVALID_STATE', 'Ca đã đóng hoặc không tồn tại')
    const sp = payments.filter((p) => p.shift_id === s!.id && p.status === 'confirmed')
    const totals: Record<string, number> = {}
    sp.forEach((p) => (totals[p.method] = (totals[p.method] ?? 0) + p.amount))
    const expected = s!.opening_cash + (totals.cash ?? 0)
    const counted = Number(body.counted_cash ?? 0)
    s!.closed_at = iso()
    return ok({ expected_cash: expected, counted_cash: counted, difference: counted - expected, totals_by_method: totals })
  }

  /* payments */
  if (url === '/payments' && method === 'get') {
    need('payments.read')
    let rows = payments.filter((p) => {
      const c = contracts.find((x) => x.id === p.contract_id)
      return c ? myBranch(c.branch_id) : true
    })
    if (params.contract_id) rows = rows.filter((p) => p.contract_id === params.contract_id)
    if (params.shift_id) rows = rows.filter((p) => p.shift_id === params.shift_id)
    if (params.status) rows = rows.filter((p) => p.status === params.status)
    if (params.method) rows = rows.filter((p) => p.method === params.method)
    if (params.date) rows = rows.filter((p) => p.created_at.slice(0, 10) === params.date)
    rows = rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
    return paged(rows.map((p) => {
      const c = contracts.find((x) => x.id === p.contract_id)
      return { ...p, contract: c ? { id: c.id, code: c.code, member: { name: c.member.name } } : undefined }
    }))
  }
  if (url === '/payments' && method === 'post') {
    need('payments.create')
    const c = contracts.find((x) => x.id === body.contract_id)
    if (!c) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hợp đồng')
    const amount = Number(body.amount)
    if (!(amount > 0) || amount > c!.debt_amount) fail(config, 422, 'VALIDATION', 'Số tiền không hợp lệ')
    if (body.ref && payments.some((p) => p.ref === body.ref)) fail(config, 409, 'DUPLICATE_PAYMENT', 'Mã giao dịch đã tồn tại')
    let shiftId: string | null = null
    if (body.method === 'cash') {
      const s = shifts.find((x) => x.user_id === me.id && !x.closed_at)
      if (!s) fail(config, 409, 'NO_OPEN_SHIFT', 'Chưa mở ca thu ngân')
      shiftId = s!.id
    }
    const p: Payment = {
      id: nid('pay'), contract_id: c!.id, method: body.method, amount, status: body.method === 'cash' ? 'confirmed' : 'pending', ref: body.ref ?? null,
      shift_id: shiftId, note: body.note ?? null, created_by: me.name, created_at: iso(), confirmed_at: body.method === 'cash' ? iso() : null,
    }
    payments.unshift(p)
    recalc(c!)
    addEvent(c!, 'payment', me.name, null, { amount, method: body.method })
    log(me.email, 'payments.create', c!.code)
    return ok(p)
  }
  const pym = url.match(/^\/payments\/([^/]+)\/(\w+)$/)
  if (pym) {
    const p = payments.find((x) => x.id === pym[1])
    if (!p) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy giao dịch')
    const pp = p as Payment
    const c = contracts.find((x) => x.id === pp.contract_id) as Contract
    if (pym[2] === 'qr' && method === 'get') {
      need('payments.read')
      return ok({ transfer_content: `GYMHUB ${c.code} ${pp.id}`, bank: 'MB Bank - 0123456789 - GYMHUB', amount: pp.amount, qr_url: `${location.origin}/vite.svg` })
    }
    if (method === 'post') {
      if (pym[2] === 'confirm') {
        need('payments.confirm')
        if (pp.status !== 'pending') fail(config, 409, 'INVALID_STATE', 'Giao dịch không ở trạng thái chờ xác nhận')
        pp.status = 'confirmed'
        pp.confirmed_at = iso()
        const s = shifts.find((x) => x.user_id === me.id && !x.closed_at)
        pp.shift_id = pp.shift_id ?? s?.id ?? null
      } else if (pym[2] === 'refund-request') {
        need('payments.refund_request')
        if (pp.status !== 'confirmed') fail(config, 409, 'INVALID_STATE', 'Chỉ hoàn tiền giao dịch đã thu')
        pp.refund_requested = true
        pp.note = `Đề nghị hoàn: ${body.reason}`
      } else if (pym[2] === 'refund') {
        need('payments.refund')
        if (pp.status !== 'confirmed') fail(config, 409, 'INVALID_STATE', 'Chỉ hoàn tiền giao dịch đã thu')
        pp.status = 'refunded'
      } else fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
      recalc(c)
      log(me.email, `payments.${pym[2]}`, c.code)
      return ok(pp)
    }
  }

  /* checkins */
  const activeFor = (memberId: string) => contracts.filter((c) => c.member_id === memberId && !['draft', 'signed', 'cancelled'].includes(c.status))
  if (url === '/checkins' && method === 'post') {
    need('checkins.create')
    const key = String(body.member_code ?? '').trim().toLowerCase()
    const m = members.find((x) => x.id === body.member_id || x.code.toLowerCase() === key || x.phone === key)
    if (!m) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hội viên')
    const mem = m as Member
    const cs = activeFor(mem.id)
    const cur = cs.find((c) => c.status === 'active') ?? cs.find((c) => c.status === 'frozen') ?? cs[0]
    let reason: string | null = null
    if (!cur) reason = 'NO_ACTIVE_CONTRACT'
    else if (cur.status === 'frozen') reason = 'FROZEN'
    else if (cur.status === 'expired' || (cur.end_date && cur.end_date < day(0))) reason = 'EXPIRED'
    else if (cur.sessions_total != null && (cur.sessions_left ?? 0) <= 0) reason = 'NO_SESSIONS'
    else if (branchFilter && cur.branch_id !== branchFilter) reason = 'WRONG_BRANCH'
    const allowed = !reason
    if (allowed && cur && cur.sessions_left != null) cur.sessions_left -= 1
    const id = nid('ci')
    checkins.unshift({ id, member: { id: mem.id, code: mem.code, name: mem.name }, result: allowed ? 'allowed' : 'denied', reason: reason as CheckinItem['reason'], created_at: iso(), checked_out_at: null, branch_id: mem.branch_id, direction: 'in' })
    return ok({ result: allowed ? 'allowed' : 'denied', reason, member: { id: mem.id, code: mem.code, name: mem.name, phone: mem.phone }, contract: cur ?? null, checkin_id: id })
  }
  if (url === '/checkins/override' && method === 'post') {
    need('checkins.override')
    const m = memberOf(body.member_id)
    if (!m || !body.reason) fail(config, 422, 'VALIDATION', 'Thiếu lý do mở thủ công')
    const id = nid('ci')
    checkins.unshift({ id, member: { id: m.id, code: m.code, name: m.name }, result: 'allowed', reason: null, created_at: iso(), checked_out_at: null, branch_id: m.branch_id, direction: 'in' })
    log(me.email, 'checkins.override', m.code)
    return ok({ result: 'allowed', reason: null, member: { id: m.id, code: m.code, name: m.name, phone: m.phone }, contract: activeFor(m.id)[0] ?? null, checkin_id: id })
  }
  const com = url.match(/^\/checkins\/([^/]+)\/checkout$/)
  if (com && method === 'post') {
    need('checkins.create')
    const ci = checkins.find((x) => x.id === com[1])
    if (ci) ci.checked_out_at = iso()
    return ok(ci ?? null)
  }
  if (url === '/checkins/live') {
    need('checkins.read')
    const items = checkins.filter((x) => x.result === 'allowed' && !x.checked_out_at && myBranch(x.branch_id))
    return ok({ count: items.length, items })
  }
  if (url === '/checkins' && method === 'get') {
    need('checkins.read')
    let rows = checkins.filter((x) => myBranch(x.branch_id))
    if (params.result) rows = rows.filter((x) => x.result === params.result)
    if (params.member_id) rows = rows.filter((x) => x.member.id === params.member_id)
    return paged(rows)
  }

  /* reports */
  if (url === '/reports/dashboard') {
    need('reports.view')
    const t = day(0)
    const confirmed = payments.filter((p) => p.status === 'confirmed')
    const byMethod: Record<string, number> = { cash: 0, transfer: 0, vietqr: 0, ewallet: 0 }
    confirmed.filter((p) => p.confirmed_at?.slice(0, 10) === t).forEach((p) => (byMethod[p.method] += p.amount))
    const r7 = Array.from({ length: 7 }, (_, i) => {
      const d = day(i - 6)
      return { date: d, amount: confirmed.filter((p) => p.confirmed_at?.slice(0, 10) === d).reduce((s, p) => s + p.amount, 0) }
    })
    const cs = contracts.filter((c) => myBranch(c.branch_id))
    const todays = checkins.filter((x) => x.created_at.slice(0, 10) === t)
    return ok({
      revenue_today: Object.values(byMethod).reduce((a, b) => a + b, 0),
      revenue_by_method: byMethod,
      new_contracts_today: cs.filter((c) => c.created_at.slice(0, 10) === t).length,
      active_members: new Set(cs.filter((c) => c.status === 'active').map((c) => c.member_id)).size,
      expiring_in_7_days: cs.filter((c) => c.status === 'active' && c.end_date && c.end_date <= day(7) && c.end_date >= t).length,
      checkins_today: todays.filter((x) => x.result === 'allowed').length,
      denied_today: todays.filter((x) => x.result === 'denied').length,
      inside_now: checkins.filter((x) => x.result === 'allowed' && !x.checked_out_at).length,
      debt_total: cs.filter((c) => !['cancelled', 'draft'].includes(c.status)).reduce((s, c) => s + c.debt_amount, 0),
      revenue_7d: r7,
    })
  }
  if (url === '/reports/daily-closing') {
    need('reports.view')
    const d = String(params.date ?? day(0))
    const items = payments.filter((p) => p.status === 'confirmed' && p.confirmed_at?.slice(0, 10) === d)
    const totals: Record<string, number> = {}
    items.forEach((p) => (totals[p.method] = (totals[p.method] ?? 0) + p.amount))
    return ok({ totals_by_method: totals, total: items.reduce((s, p) => s + p.amount, 0), items: items.map((p) => ({ ...p, contract: { id: p.contract_id, code: contracts.find((c) => c.id === p.contract_id)?.code ?? '', member: { name: contracts.find((c) => c.id === p.contract_id)?.member.name ?? '' } } })) })
  }

  /* admin */
  if (url === '/roles') {
    need('roles.read')
    return ok(roleDefs)
  }
  if (url === '/permissions') {
    need('roles.read')
    return ok(ALL.map((k) => ({ key: k })))
  }
  if (url === '/users' && method === 'get') {
    need('roles.read')
    return paged(adminUsers)
  }
  const urm = url.match(/^\/users\/([^/]+)\/roles(?:\/(.+))?$/)
  if (urm) {
    need('roles.assign')
    const u = adminUsers.find((x) => x.id === urm[1])
    if (!u) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy người dùng')
    if (method === 'post') {
      u!.roles.push({ id: nid('ur'), role: body.role, branch_id: body.branch_id ?? null })
      log(me.email, 'roles.assign', `${u!.email}:+${body.role}`)
      return ok(u)
    }
    if (method === 'delete') {
      u!.roles = u!.roles.filter((r) => r.id !== urm[2])
      log(me.email, 'roles.revoke', u!.email)
      return ok(u)
    }
  }
  if (url === '/audit-logs') {
    need('system.view_audit_log')
    let rows = audit.slice()
    if (params.actor) rows = rows.filter((a) => (a.actor_email ?? '').toLowerCase().includes(String(params.actor).toLowerCase()))
    if (params.action) rows = rows.filter((a) => a.action.toLowerCase().includes(String(params.action).toLowerCase()))
    if (params.from) rows = rows.filter((a) => a.created_at.slice(0, 10) >= String(params.from))
    if (params.to) rows = rows.filter((a) => a.created_at.slice(0, 10) <= String(params.to))
    return paged(rows)
  }

  return fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
}
