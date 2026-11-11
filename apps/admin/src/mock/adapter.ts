import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import type { AuditRow, CheckinItem, Contract, Me, Member, PayMethod, Payment, Pkg, RoleRow, SessionRow, Shift } from '../types'

const branches = [
  { id: 'b-q2', code: 'Q2', name: 'Chi nhánh Quận 2' },
  { id: 'b-nb', code: 'NB', name: 'Chi nhánh Nhà Bè' },
  { id: 'b-q7', code: 'Q7', name: 'Chi nhánh Quận 7' },
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
  'admin@gymhub.vn': { pw: 'admin123', me: { id: 'u1', email: 'admin@gymhub.vn', name: 'Chủ phòng', roles: ['super_admin'], permissions: ALL, branches, can_checkin: false, checkin_branch: null } },
  'quanly@gymhub.vn': {
    pw: 'quanly123',
    me: { id: 'u3', email: 'quanly@gymhub.vn', name: 'Phạm Minh Quân', roles: ['manager'], permissions: [...Object.values(P).flat(), ...MANAGER_EXTRA], branches: [branches[1]], can_checkin: true, checkin_branch: branches[1] },
  },
  'letan@gymhub.vn': {
    pw: 'letan123',
    me: { id: 'u2', email: 'letan@gymhub.vn', name: 'Lê Thu Hà', roles: ['receptionist'], permissions: [...Object.values(P).flat()], branches: [branches[2]], can_checkin: true, checkin_branch: branches[2] },
  },
}

const roleDefs: RoleRow[] = [
  { id: 'r1', name: 'super_admin', description: 'Toàn quyền', permissions: ALL },
  { id: 'r2', name: 'owner', description: 'Chủ phòng tập', permissions: ALL },
  { id: 'r3', name: 'manager', description: 'Quản lý chi nhánh', permissions: [...Object.values(P).flat(), ...MANAGER_EXTRA] },
  { id: 'r4', name: 'receptionist', description: 'Lễ tân', permissions: Object.values(P).flat() },
  { id: 'r5', name: 'accountant', description: 'Kế toán', permissions: ['payments.read', 'payments.confirm', 'reports.view', 'reports.view_revenue', 'reports.export', 'contracts.read'] },
]
const adminUsers = [
  { id: 'u1', email: 'admin@gymhub.vn', name: 'Chủ phòng', roles: [{ id: 'ur1', role: 'super_admin', branch_id: null as string | null }] },
  { id: 'u3', email: 'quanly@gymhub.vn', name: 'Phạm Minh Quân', roles: [{ id: 'ur3', role: 'manager', branch_id: 'b-nb' as string | null }] },
  { id: 'u2', email: 'letan@gymhub.vn', name: 'Lê Thu Hà', roles: [{ id: 'ur2', role: 'receptionist', branch_id: 'b-q7' as string | null }] },
  { id: 'u5', email: 'ketoan@gymhub.vn', name: 'Kế toán', roles: [{ id: 'ur5', role: 'accountant', branch_id: null as string | null }] },
]

let rnd = 7
const rand = (n: number) => {
  rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
  return rnd % n
}
const last = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý']
const mid = ['Văn', 'Thị', 'Minh', 'Gia', 'Thanh', 'Hồng', 'Quốc', 'Ngọc', 'Anh', 'Thùy']
const first = ['An', 'Bình', 'Cường', 'Đức', 'Hà', 'Huy', 'Lan', 'Khang', 'Mai', 'Tuấn', 'Linh', 'Long', 'Yến', 'Phúc', 'Vy', 'Châu', 'Dũng', 'Nhi', 'Hiếu', 'Trinh']
const members: Member[] = Array.from({ length: 60 }, (_, i) => {
  const female = i % 3 === 1 || mid[(i * 7) % 10] === 'Thị' || mid[(i * 7) % 10] === 'Ngọc'
  return {
    id: `m${i + 1}`,
    code: `HV${String(i + 1).padStart(4, '0')}`,
    name: `${last[(i * 4 + 1) % 15]} ${female && i % 2 ? 'Thị' : mid[(i * 7) % 10]} ${first[(i * 3 + 2) % 20]}`,
    phone: `09${String(10000000 + ((i * 913577) % 89999999)).slice(0, 8)}`,
    email: i % 3 === 0 ? `hv${i + 1}@example.com` : null,
    dob: `199${i % 10}-0${(i % 9) + 1}-15`,
    gender: female ? 'female' : 'male',
    status: 'active',
    branch_id: i % 7 === 5 ? 'b-q2' : i % 5 < 2 ? 'b-q7' : 'b-nb',
    avatar_url: null,
    created_at: new Date(Date.now() - (i * 9 + 3) * 86400000).toISOString(),
  }
})

const packages: Pkg[] = [
  { id: 'p1', name: 'Vé ngày', type: 'day', duration_days: 1, sessions: null, price: 80000, vat_percent: 8, branch_id: 'b-nb', active: true },
  { id: 'p2', name: 'Gói 1 tháng', type: 'month', duration_days: 30, sessions: null, price: 600000, vat_percent: 8, branch_id: 'b-nb', active: true },
  { id: 'p3', name: 'Gói 12 buổi PT', type: 'session', duration_days: null, sessions: 12, price: 3600000, vat_percent: 8, branch_id: 'b-nb', active: true },
  { id: 'p4', name: 'Gói 3 tháng (ngưng bán)', type: 'month', duration_days: 90, sessions: null, price: 1500000, vat_percent: 8, branch_id: 'b-q7', active: false },
  { id: 'p5', name: 'Gói 1 tháng Q7', type: 'month', duration_days: 30, sessions: null, price: 650000, vat_percent: 8, branch_id: 'b-q7', active: true },
  { id: 'p7', name: 'Gói 3 tháng', type: 'month', duration_days: 90, sessions: null, price: 1500000, vat_percent: 8, branch_id: 'b-nb', active: true },
  { id: 'p9', name: 'Gói 12 tháng', type: 'month', duration_days: 365, sessions: null, price: 5000000, vat_percent: 8, branch_id: 'b-nb', active: true },
  { id: 'p8', name: 'Gói 12 tháng Q7', type: 'month', duration_days: 365, sessions: null, price: 5400000, vat_percent: 8, branch_id: 'b-q7', active: true },
  { id: 'p10', name: 'Gói 10 buổi PT Q7', type: 'session', duration_days: null, sessions: 10, price: 3000000, vat_percent: 8, branch_id: 'b-q7', active: true },
  { id: 'p11', name: 'Gói 1 tháng Q2', type: 'month', duration_days: 30, sessions: null, price: 650000, vat_percent: 8, branch_id: 'b-q2', active: true },
  { id: 'p12', name: 'Gói 3 tháng Q2', type: 'month', duration_days: 90, sessions: null, price: 1600000, vat_percent: 8, branch_id: 'b-q2', active: true },
  { id: 'p13', name: 'Gói 12 tháng Q2', type: 'month', duration_days: 365, sessions: null, price: 5400000, vat_percent: 8, branch_id: 'b-q2', active: true },
  { id: 'p14', name: 'Gói 10 buổi PT Q2', type: 'session', duration_days: null, sessions: 10, price: 3000000, vat_percent: 8, branch_id: 'b-q2', active: true },
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
const ORDER = ['active', 'frozen', 'signed', 'draft', 'expired', 'cancelled']
function currentOf(memberId: string) {
  const cs = contracts.filter((c) => c.member_id === memberId)
  return ORDER.map((st) => cs.find((c) => c.status === st)).find(Boolean) ?? null
}
function memberOut(m: Member): Member {
  const c = currentOf(m.id)
  const b = branches.find((x) => x.id === m.branch_id)
  return {
    ...m,
    status: c?.status === 'active' ? 'active' : c?.status === 'frozen' ? 'frozen' : 'expired',
    branch: b ?? null,
    current_contract: c ? { id: c.id, code: c.code, status: c.status, package_name: c.package.name, package_type: c.package.type, start_date: c.start_date, end_date: c.end_date, sessions_left: c.sessions_left } : null,
  }
}
function contractOut(c: Contract): Contract {
  const last = payments.filter((p) => p.contract_id === c.id && p.status === 'confirmed').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return { ...c, last_payment_method: last?.method ?? null, branch: branches.find((b) => b.id === c.branch_id) ?? null }
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
const PKG_BY_BRANCH: Record<string, string[]> = { 'b-nb': ['p2', 'p7', 'p9', 'p3'], 'b-q7': ['p5', 'p6', 'p8', 'p10'], 'b-q2': ['p11', 'p12', 'p13', 'p14'] }
const REMAIN = [1, 1, 2, 3, 5, 6, 9, 15, 20, 28, 45, 70, 120, 200, 300]
seedContract('m3', 'p2', 'expired', 648000, -45)
seedContract('m4', 'p2', 'frozen', 648000, -15)
for (let k = 1; k <= 60; k++) {
  if (k === 3 || k === 4 || k === 9) continue
  const m = memberOf(`m${k}`)
  const pid = PKG_BY_BRANCH[m.branch_id][rand(4)]
  const pk = pkgOf(pid)
  const dur = pk.duration_days ?? 30
  const total = Math.round(pk.price * (1 + pk.vat_percent / 100))
  const r = rand(100)
  const part = rand(5) === 0 ? Math.round(total / 2) : total
  if (r < 58) seedContract(m.id, pid, 'active', part, Math.min(REMAIN[rand(15)], dur - 1) - dur)
  else if (r < 70) seedContract(m.id, pid, 'expired', total, -(dur + 5 + rand(40)))
  else if (r < 77) seedContract(m.id, pid, 'frozen', total, -(Math.min(dur, 30) - 5))
  else if (r < 85) seedContract(m.id, pid, 'signed', Math.round(total / 2), null)
  else if (r < 91) seedContract(m.id, pid, 'draft', 0, null).created_at = iso(0)
  else if (r < 94) seedContract(m.id, pid, 'cancelled', 0, -20)
}
;([-6, -5, -4, -3, -2, -1].forEach((d, i) =>
  payments.push({ id: nid('pay'), contract_id: contracts[i % contracts.length].id, method: (['cash', 'transfer', 'vietqr', 'cash', 'ewallet', 'cash'] as PayMethod[])[i], amount: 400000 + i * 120000, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: 'Hệ thống', created_at: iso(d), confirmed_at: iso(d) }),
))
payments.push(
  { id: nid('pay'), contract_id: contracts[0].id, method: 'cash', amount: 700000, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: 'Hệ thống', created_at: iso(0), confirmed_at: iso(0) },
  { id: nid('pay'), contract_id: contracts[1].id, method: 'transfer', amount: 100000, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: 'Hệ thống', created_at: iso(0), confirmed_at: iso(0) },
)
contracts.slice(0, 2).forEach(recalc)
payments[3].refund_requested = true
const todayStart = new Date().setHours(0, 0, 0, 0)
members
  .filter((m) => contracts.some((c) => c.member_id === m.id && c.status === 'active'))
  .slice(0, 12)
  .forEach((m, k) => {
    const at = Math.max(todayStart + 60000, Date.now() - (15 * k + 5) * 60000)
    checkins.push({
      id: nid('ci'), member: { id: m.id, code: m.code, name: m.name }, result: 'allowed', reason: null, created_at: new Date(at).toISOString(),
      checked_out_at: k < 2 ? null : new Date(at + 50 * 60000).toISOString(), branch_id: m.branch_id, direction: 'in',
    })
  })
log('admin@gymhub.vn', 'auth.login', 'session', 'ALLOW', 3600000)
log('letan@gymhub.vn', 'contracts.cancel', 'contract', 'DENY', 7200000)
log('quanly@gymhub.vn', 'payments.confirm', 'payment', 'ALLOW', 9000000)

const METHOD_CYCLE: PayMethod[] = ['cash', 'transfer', 'vietqr', 'ewallet', 'cash', 'transfer']
for (let k = 0; k < 60; k++) {
  const mi = (k * 7) % 60 + 1
  if (mi === 3 || mi === 4 || mi === 9) continue
  const m = memberOf(`m${mi}`)
  const pid = PKG_BY_BRANCH[m.branch_id][rand(4)]
  const pk = pkgOf(pid)
  const dur = pk.duration_days ?? 30
  const total = Math.round(pk.price * (1 + pk.vat_percent / 100))
  const r = rand(100)
  const ago = 5 + rand(150)
  const part = rand(4) === 0 ? Math.round(total * 0.4) : total
  const c =
    r < 55 ? seedContract(m.id, pid, 'active', part, -Math.min(ago, dur - 2))
    : r < 80 ? seedContract(m.id, pid, 'expired', total, -(dur + ago))
    : r < 88 ? seedContract(m.id, pid, 'frozen', total, -Math.min(dur - 3, 20))
    : r < 94 ? seedContract(m.id, pid, 'signed', Math.round(total / 2), null)
    : seedContract(m.id, pid, 'cancelled', 0, -ago)
  c.signed_at = iso(c.start_date ? -Math.max(1, Math.round((Date.now() - new Date(c.start_date).getTime()) / DAY)) : -2)
  c.created_at = c.signed_at
  payments.filter((p) => p.contract_id === c.id).forEach((p, i) => {
    p.method = METHOD_CYCLE[(k + i) % METHOD_CYCLE.length]
    p.created_at = c.signed_at as string
    p.confirmed_at = c.signed_at
    p.ref = p.method === 'cash' ? null : `GD${100000 + k * 37 + i}`
  })
  recalc(c)
}
const pendingSeed = payments.filter((p) => p.status === 'confirmed' && p.method === 'vietqr').slice(0, 3)
pendingSeed.forEach((p) => {
  p.status = 'pending'
  p.confirmed_at = null
  recalc(contracts.find((x) => x.id === p.contract_id) as Contract)
})
const VIEW_ONLY_MSG = 'Tài khoản quản trị chỉ xem thống kê, không thực hiện check-in.'
const REASONS: CheckinItem['reason'][] = ['EXPIRED', 'NO_ACTIVE_CONTRACT', 'FROZEN', 'WRONG_BRANCH', 'NO_SESSIONS']
for (let k = 0; k < 90; k++) {
  const m = members[(k * 11) % 60]
  const at = Date.now() - (1 + Math.floor(k / 6)) * DAY - rand(10 * 3600000)
  const denied = k % 9 === 4
  checkins.push({
    id: nid('ci'), member: { id: m.id, code: m.code, name: m.name }, result: denied ? 'denied' : 'allowed', reason: denied ? REASONS[k % REASONS.length] : null,
    created_at: new Date(at).toISOString(), checked_out_at: denied ? null : new Date(at + (40 + rand(50)) * 60000).toISOString(), branch_id: m.branch_id, direction: 'in',
  })
}
checkins.sort((a, b) => b.created_at.localeCompare(a.created_at))
const ACTIONS = ['contracts.create', 'contracts.sign', 'contracts.activate', 'payments.create', 'payments.confirm', 'members.update', 'checkins.override', 'shifts.open', 'shifts.close', 'contracts.cancel']
for (let k = 0; k < 40; k++) {
  const who = ['letan@gymhub.vn', 'quanly@gymhub.vn', 'admin@gymhub.vn'][k % 3]
  log(who, ACTIONS[k % ACTIONS.length], `HD${String(10 + k).padStart(5, '0')}`, k % 11 === 5 ? 'DENY' : 'ALLOW', (k + 1) * 5400000 + rand(3600000))
}
audit.sort((a, b) => b.created_at.localeCompare(a.created_at))

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
    return paged(rows.map(memberOut))
  }
  if (url === '/members' && method === 'post') {
    need('members.create')
    if (members.some((m) => m.phone === body.phone)) fail(config, 409, 'DUPLICATE_PHONE', 'Số điện thoại đã tồn tại')
    const m: Member = { id: `m${++seq}`, code: `HV${String(seq).padStart(4, '0')}`, avatar_url: null, created_at: new Date().toISOString(), ...body }
    members.unshift(m)
    return ok(m)
  }
  const mm = url.match(/^\/members\/(.+)$/)
  if (mm) {
    const m = members.find((x) => x.id === mm[1])
    if (!m) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    if (method === 'get') return ok(memberOut(m as Member))
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
    if (String(params.has_debt) === 'true') rows = rows.filter((c) => c.debt_amount > 0)
    if (params.expiring_within_days) {
      const lim = day(Number(params.expiring_within_days))
      rows = rows.filter((c) => c.status === 'active' && c.end_date && c.end_date <= lim && c.end_date >= day(0))
    }
    if (q) rows = rows.filter((c) => c.code.toLowerCase().includes(q) || c.member.name.toLowerCase().includes(q) || c.member.phone.includes(q))
    return paged(rows.map((c) => ({ ...contractOut(c), events: undefined })))
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
      return ok({ ...contractOut(k), payments: payments.filter((p) => p.contract_id === k.id) })
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
    if (!me.can_checkin) fail(config, 403, 'VIEW_ONLY', VIEW_ONLY_MSG)
    const key = String(body.member_code ?? '').trim().toLowerCase().replace(/\s/g, '')
    const m = members.find((x) => x.id === body.member_id || x.code.toLowerCase() === key || x.phone === key)
    if (!m) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hội viên')
    const mem = m as Member
    const cs = activeFor(mem.id)
    const cur = cs.find((c) => c.status === 'active') ?? cs.find((c) => c.status === 'frozen') ?? cs[0]
    let reason: string | null = null
    if (me.checkin_branch && mem.branch_id !== me.checkin_branch.id) reason = 'WRONG_BRANCH'
    else if (!cur) reason = 'NO_ACTIVE_CONTRACT'
    else if (cur.status === 'frozen') reason = 'FROZEN'
    else if (cur.status === 'expired' || (cur.end_date && cur.end_date < day(0))) reason = 'EXPIRED'
    else if (cur.sessions_total != null && (cur.sessions_left ?? 0) <= 0) reason = 'NO_SESSIONS'
    const allowed = !reason
    if (allowed && cur && cur.sessions_left != null) cur.sessions_left -= 1
    const id = nid('ci')
    checkins.unshift({ id, member: { id: mem.id, code: mem.code, name: mem.name }, result: allowed ? 'allowed' : 'denied', reason: reason as CheckinItem['reason'], created_at: iso(), checked_out_at: null, branch_id: mem.branch_id, direction: 'in' })
    return ok({ result: allowed ? 'allowed' : 'denied', reason, member: { id: mem.id, code: mem.code, name: mem.name, phone: mem.phone }, contract: cur ?? null, checkin_id: id })
  }
  if (url === '/checkins/override' && method === 'post') {
    need('checkins.override')
    if (!me.can_checkin) fail(config, 403, 'VIEW_ONLY', VIEW_ONLY_MSG)
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
    if (!me.can_checkin) fail(config, 403, 'VIEW_ONLY', VIEW_ONLY_MSG)
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
    if (params.date) rows = rows.filter((x) => x.created_at.slice(0, 10) === params.date || new Date(x.created_at).toLocaleDateString('sv') === params.date)
    return paged(rows)
  }

  /* reports */
  if (url === '/reports/checkin-stats') {
    need('checkins.read')
    const d = String(params.date ?? day(0))
    const list = branches.filter((b) => myBranch(b.id)).map((b) => {
      const mine = checkins.filter((x) => x.branch_id === b.id)
      const td = mine.filter((x) => new Date(x.created_at).toLocaleDateString('sv') === d)
      const by = new Map<number, number>()
      td.filter((x) => x.result === 'allowed').forEach((x) => by.set(new Date(x.created_at).getHours(), (by.get(new Date(x.created_at).getHours()) ?? 0) + 1))
      return { branch: b, checkins_today: td.filter((x) => x.result === 'allowed').length, denied_today: td.filter((x) => x.result === 'denied').length, inside_now: mine.filter((x) => x.result === 'allowed' && !x.checked_out_at).length, by_hour: [...by.entries()].sort((a, b2) => a[0] - b2[0]).map(([hour, count]) => ({ hour, count })) }
    })
    const sum = (k: 'checkins_today' | 'denied_today' | 'inside_now') => list.reduce((t, x) => t + x[k], 0)
    return ok({ date: d, branches: list, totals: { checkins_today: sum('checkins_today'), denied_today: sum('denied_today'), inside_now: sum('inside_now') } })
  }
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
  if (url === '/reports/today-tasks') {
    need('contracts.read')
    const t = day(0)
    const cs = contracts.filter((c) => myBranch(c.branch_id))
    const awaiting = cs.filter((c) => c.status === 'draft')
    const unpaid = cs.filter((c) => !['cancelled', 'draft'].includes(c.status) && c.debt_amount > 0)
    const expiring = cs.filter((c) => c.status === 'active' && c.end_date && c.end_date >= t && c.end_date <= day(2))
    const refunds = payments.filter((p) => p.refund_requested && p.status === 'confirmed' && myBranch(contracts.find((c) => c.id === p.contract_id)?.branch_id ?? ''))
    return ok({
      awaiting_signature: { count: awaiting.length, items: awaiting.slice(0, 5).map((c) => ({ id: c.id, code: c.code, member_name: c.member.name })) },
      unpaid: { count: unpaid.length, total_debt: unpaid.reduce((s, c) => s + c.debt_amount, 0), items: unpaid.slice(0, 5).map((c) => ({ id: c.id, code: c.code, member_name: c.member.name, debt_amount: c.debt_amount })) },
      expiring_in_2_days: { count: expiring.length, items: expiring.slice(0, 5).map((c) => ({ id: c.id, code: c.code, member_name: c.member.name, end_date: c.end_date as string })) },
      pending_refunds: { count: refunds.length, items: refunds.slice(0, 5).map((p) => ({ id: p.id, contract_code: contracts.find((c) => c.id === p.contract_id)?.code ?? '', amount: p.amount })) },
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
