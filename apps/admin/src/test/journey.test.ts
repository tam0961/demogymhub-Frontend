import { describe, expect, it, beforeEach } from 'vitest'
import axios from 'axios'
import { mockAdapter } from '../mock/adapter'
import { barLayout, contractActions, diffRoles, diffTone, fmtMoney, needsConfirm, parseMoney, priceWithVat, reasonText, toCSV } from '../lib/format'
import { auditToCSV } from '../pages/Audit'
import { loadSavedBranch, saveBranch } from '../lib/session'

const can = (...ps: string[]) => (p: string) => ps.includes(p)

describe('contractActions', () => {
  it('draft: sign is the only primary action', () => {
    const a = contractActions({ status: 'draft', debt_amount: 100 }, can('contracts.sign', 'payments.create'))
    expect(a.sign).toBe(true)
    expect(a.primary).toBe('sign')
    expect(a.activate).toBe(false)
  })
  it('signed with debt blocks activation; approve allows debt', () => {
    const base = { status: 'signed' as const, debt_amount: 500 }
    const a = contractActions(base, can('contracts.activate', 'payments.create'))
    expect(a.activateBlockedByDebt).toBe(true)
    expect(a.activate).toBe(false)
    expect(a.activateWithDebt).toBe(false)
    expect(a.primary).toBe('pay')
    expect(contractActions(base, can('contracts.activate', 'contracts.approve')).activateWithDebt).toBe(true)
  })
  it('signed and paid: activate primary', () => {
    expect(contractActions({ status: 'signed', debt_amount: 0 }, can('contracts.activate')).primary).toBe('activate')
  })
  it('cancelled has no actions except pdf', () => {
    const a = contractActions({ status: 'cancelled', debt_amount: 10 }, can('contracts.cancel', 'payments.create', 'contracts.read'))
    expect(a.cancel || a.pay || a.freeze).toBe(false)
    expect(a.pdf).toBe(true)
  })
  it('freeze/unfreeze by status', () => {
    expect(contractActions({ status: 'active', debt_amount: 0 }, can('contracts.freeze')).freeze).toBe(true)
    expect(contractActions({ status: 'frozen', debt_amount: 0 }, can('contracts.freeze')).unfreeze).toBe(true)
  })
})

describe('format helpers', () => {
  it('money and parse', () => {
    expect(fmtMoney(1200000)).toMatch(/^1\.200\.000\s?₫$/)
    expect(parseMoney('1.200.000 đ')).toBe(1200000)
    expect(priceWithVat(600000, 8)).toBe(648000)
  })
  it('diffTone', () => {
    expect(diffTone(0)).toBe('ok')
    expect(diffTone(-20000)).toBe('warn')
    expect(diffTone(120000)).toBe('bad')
  })
  it('role diff and privileged confirm', () => {
    const d = diffRoles(['receptionist'], ['manager', 'admin'])
    expect(d).toEqual({ add: ['manager', 'admin'], remove: ['receptionist'] })
    expect(needsConfirm(d)).toBe(true)
    expect(needsConfirm(diffRoles(['a'], ['b']))).toBe(false)
  })
  it('csv escapes', () => {
    expect(toCSV([['a', 'b,c', 'd"e']])).toBe('a,"b,c","d""e"')
    expect(auditToCSV([{ id: '1', action: 'x', created_at: 't', actor_email: 'a@b' }]).split('\r\n')).toHaveLength(2)
  })
  it('barLayout scales to max', () => {
    expect(barLayout([0, 50, 100], 100)).toEqual([0, 50, 100])
    expect(barLayout([0, 0], 100)).toEqual([0, 0])
  })
  it('reason text in Vietnamese', () => {
    expect(reasonText('EXPIRED')).toBe('Hợp đồng đã hết hạn')
    expect(reasonText(null)).toBe('')
  })
})

describe('branch persistence', () => {
  beforeEach(() => localStorage.clear())
  it('saves and restores', () => {
    expect(loadSavedBranch()).toBeNull()
    saveBranch('b-q7')
    expect(loadSavedBranch()).toBe('b-q7')
    saveBranch(null)
    expect(loadSavedBranch()).toBeNull()
  })
})

describe('mock MVP journey', () => {
  const http = axios.create({ adapter: mockAdapter, headers: { Authorization: 'Bearer t' } })
  const err = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (e) {
      return (e as { response: { status: number; data: { error: { code: string } } } }).response
    }
    throw new Error('expected failure')
  }

  it('shift -> contract -> sign -> pay -> activate -> check-in', async () => {
    await http.post('/auth/login', { email: 'letan@gymhub.vn', password: 'letan123' })
    expect((await http.get('/shifts/current')).data.data).toBeNull()

    const c = (await http.post('/contracts', { member_id: 'm9', package_id: 'p2' })).data.data
    expect(c.status).toBe('draft')
    await http.post(`/contracts/${c.id}/sign`, { signature: 'data:image/png;base64,AAAA' })

    const noShift = await err(http.post('/payments', { contract_id: c.id, method: 'cash', amount: c.total_amount }))
    expect(noShift.data.error.code).toBe('NO_OPEN_SHIFT')

    const act = await err(http.post(`/contracts/${c.id}/activate`, {}))
    expect(act.status).toBe(409)

    await http.post('/shifts/open', { opening_cash: 100000 })
    const vq = (await http.post('/payments', { contract_id: c.id, method: 'vietqr', amount: 100000 })).data.data
    expect(vq.status).toBe('pending')
    expect((await http.get(`/contracts/${c.id}`)).data.data.paid_amount).toBe(0)
    expect((await http.get(`/payments/${vq.id}/qr`)).data.data.transfer_content).toContain(c.code)
    expect((await err(http.post(`/payments/${vq.id}/confirm`))).status).toBe(403)

    await http.post('/payments', { contract_id: c.id, method: 'cash', amount: c.total_amount })
    const after = (await http.get(`/contracts/${c.id}`)).data.data
    expect(after.debt_amount).toBe(0)
    await http.post(`/contracts/${c.id}/activate`, {})

    const other = (await http.post('/checkins', { member_code: 'HV0009' })).data.data
    expect(other.result).toBe('denied')
    expect(other.reason).toBe('WRONG_BRANCH')

    const closed = (await http.post(`/shifts/${(await http.get('/shifts/current')).data.data.id}/close`, { counted_cash: 0 })).data.data
    expect(closed.expected_cash).toBe(100000 + c.total_amount)
    expect(closed.difference).toBe(-closed.expected_cash)
  })

  it('check-in denied reasons and override permission', async () => {
    await http.post('/auth/login', { email: 'letan@gymhub.vn', password: 'letan123' })
    expect((await http.post('/checkins', { member_code: 'HV0003' })).data.data.reason).toBe('WRONG_BRANCH')
    expect((await err(http.post('/checkins/override', { member_id: 'm3', reason: 'x' }))).status).toBe(403)
    await http.post('/auth/login', { email: 'quanly@gymhub.vn', password: 'quanly123' })
    expect((await http.post('/checkins', { member_code: 'HV0003' })).data.data.reason).toBe('EXPIRED')
    expect((await http.post('/checkins', { member_code: 'HV0004' })).data.data.reason).toBe('FROZEN')
    expect((await http.post('/checkins', { member_code: 'HV0009' })).data.data.result).toBe('allowed')
    await http.post('/auth/login', { email: 'admin@gymhub.vn', password: 'admin123' })
    const vo = await err(http.post('/checkins', { member_code: 'HV0009' }))
    expect(vo.status).toBe(403)
    expect(vo.data.error.code).toBe('VIEW_ONLY')
    await http.post('/auth/login', { email: 'quanly@gymhub.vn', password: 'quanly123' })
    expect((await http.post('/checkins/override', { member_id: 'm3', reason: 'khách quen' })).data.data.result).toBe('allowed')
  })

  it('reports gated and closing total matches items', async () => {
    await http.post('/auth/login', { email: 'letan@gymhub.vn', password: 'letan123' })
    expect((await err(http.get('/reports/dashboard'))).status).toBe(403)
    await http.post('/auth/login', { email: 'admin@gymhub.vn', password: 'admin123' })
    const d = (await http.get('/reports/dashboard')).data.data
    expect(d.revenue_7d).toHaveLength(7)
    const cl = (await http.get('/reports/daily-closing')).data.data
    expect(cl.items.reduce((s: number, p: { amount: number }) => s + p.amount, 0)).toBe(cl.total)
  })
})

describe('mock package bundle rules', () => {
  const http = axios.create({ adapter: mockAdapter, headers: { Authorization: 'Bearer t' } })
  const code = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (e) {
      return (e as { response: { data: { error: { code: string } } } }).response.data.error.code
    }
    return null
  }

  it('PT sale creates a linked free member contract, cascades, and used packages are locked', async () => {
    await http.post('/auth/login', { email: 'quanly@gymhub.vn', password: 'quanly123' })
    const list = (await http.get('/packages', { params: { limit: 200 } })).data.data as { id: string; bundled_member_package: unknown; in_use: boolean; category: string }[]
    expect(list.filter((p) => p.category.startsWith('pt_') && p.bundled_member_package === null).length).toBeGreaterThan(0)
    const m = (await http.get('/members/m9')).data.data
    const pid = ({ 'b-nb': 'p3', 'b-q7': 'p10', 'b-q2': 'p14' } as Record<string, string>)[m.branch_id]
    const c = (await http.post('/contracts', { member_id: m.id, package_id: pid })).data.data
    expect(c.bundled_contracts).toHaveLength(1)
    const b = c.bundled_contracts[0]
    await http.post(`/contracts/${c.id}/sign`, { signature: 'data:image/png;base64,AAAA' })
    const bd = (await http.get(`/contracts/${b.id}`)).data.data
    expect(bd.status).toBe('signed')
    expect(bd.total_amount).toBe(0)
    expect(bd.bundle_of_id).toBe(c.id)
    expect(await code(http.patch(`/packages/${pid}`, { price: 1 }))).toBe('PACKAGE_IN_USE')
    expect((await http.patch(`/packages/${pid}`, { active: true })).data.data.in_use).toBe(true)
    await http.post(`/contracts/${c.id}/cancel`, { reason: 'test' })
    expect((await http.get(`/contracts/${b.id}`)).data.data.status).toBe('cancelled')
  })

  it('new version replaces and deactivates the old package', async () => {
    await http.post('/auth/login', { email: 'quanly@gymhub.vn', password: 'quanly123' })
    const body = { name: 'Gói test v2', type: 'month', category: 'member', duration_days: 30, price: 1, vat_percent: 8, branch_id: 'b-nb', replaces_id: 'p9', deactivate_replaced: true }
    const n = (await http.post('/packages', body)).data.data
    expect(n.replaces_id).toBe('p9')
    expect((await http.get('/packages/p9')).data.data.active).toBe(false)
    expect(await code(http.post('/packages', { ...body, category: 'pt_1on1', type: 'session', sessions: 5, bundled_member_package_id: 'p9' }))).toBe('INVALID_BUNDLE')
  })
})
