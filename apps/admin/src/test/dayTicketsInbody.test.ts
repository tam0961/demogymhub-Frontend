import { describe, expect, it } from 'vitest'
import axios from 'axios'
import { mockAdapter } from '../mock/adapter'
import { canSellDayTicket, normalizePhone, saleBody } from '../lib/dayTickets'
import { changeText, inbodyBody, inbodyErrors, trendLines, type InbodyForm } from '../lib/inbody'
import { NAV_GROUPS } from '../components/Layout'
import type { InbodyRecord } from '../types'

const form = (over: Partial<InbodyForm> = {}): InbodyForm => ({ measured_on: '2026-11-10', weight: '70,5', height: '172', body_fat: '18.2', muscle: '32', note: '', ...over })
const rec = (date: string, weight: number, fat: number, muscle: number): InbodyRecord => ({ id: date, member_id: 'm1', measured_on: date, weight, height: 170, body_fat: fat, muscle, source: 'manual', note: null, created_by: null, created_by_name: null, created_at: date })

describe('day ticket helpers', () => {
  it('normalizes phones and gates the sale button', () => {
    expect(normalizePhone('0903 123.456')).toBe('0903123456')
    expect(canSellDayTicket({ name: ' An ', phone: '0903 123 456' })).toBe(true)
    expect(canSellDayTicket({ name: '', phone: '0903123456' })).toBe(false)
    expect(canSellDayTicket({ name: 'An', phone: '123' })).toBe(false)
  })
  it('builds the sale body with the branch only when known', () => {
    expect(saleBody({ name: ' An ', phone: '0903 123 456', method: 'momo' }, 'b1')).toEqual({ name: 'An', phone: '0903123456', method: 'momo', branch_id: 'b1' })
    expect(saleBody({ name: 'An', phone: '0903123456', method: 'cash' }, '')).toEqual({ name: 'An', phone: '0903123456', method: 'cash' })
  })
  it('lives inside the access page, with no separate menu entry', () => {
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.to === '/day-tickets')).toBe(false)
  })
})

describe('inbody helpers', () => {
  it('validates ranges and the date', () => {
    expect(inbodyErrors(form(), '2026-11-20')).toEqual({})
    expect(Object.keys(inbodyErrors(form({ weight: '19', height: '99', body_fat: '71', muscle: '4' }), '2026-11-20')).sort()).toEqual(['body_fat', 'height', 'muscle', 'weight'])
    expect(inbodyErrors(form({ weight: '' }), '2026-11-20').weight).toBeTruthy()
    expect(inbodyErrors(form({ measured_on: '2026-12-01' }), '2026-11-20').measured_on).toBeTruthy()
  })
  it('turns the form into numbers and drops an empty note', () => {
    expect(inbodyBody(form())).toEqual({ measured_on: '2026-11-10', weight: 70.5, height: 172, body_fat: 18.2, muscle: 32 })
    expect(inbodyBody(form({ note: ' ok ' })).note).toBe('ok')
  })
  it('scales each series oldest to newest and reports the change', () => {
    const rows = [rec('2026-11-10', 68, 17, 33), rec('2026-10-10', 70, 19, 32)]
    const w = trendLines(rows, 100, 100, 10).find((l) => l.key === 'weight')!
    expect(w.points.map((p) => p.date)).toEqual(['2026-10-10', '2026-11-10'])
    expect(w.points[0]).toMatchObject({ x: 10, y: 10 })
    expect(w.points[1]).toMatchObject({ x: 90, y: 90 })
    expect(changeText(rows, 'weight')).toBe('-2')
    expect(changeText(rows, 'muscle')).toBe('+1')
    expect(changeText([rows[0]], 'weight')).toBeNull()
  })
})

describe('mock day tickets and inbody', () => {
  const http = axios.create({ adapter: mockAdapter, headers: { Authorization: 'Bearer t' } })
  const fail = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (e) {
      return (e as { response: { status: number; data: { error: { code: string } } } }).response
    }
    throw new Error('expected failure')
  }

  it('sells a ticket after opening a shift, blocks a duplicate, and lists it', async () => {
    await http.post('/auth/login', { email: 'letan@gymhub.vn', password: 'letan123' })
    await http.post('/shifts/open', { opening_cash: 0 })
    const t = (await http.post('/day-tickets', { name: 'An', phone: '0903111222', method: 'momo' })).data.data
    expect(t.amount).toBe(100000)
    expect(t.method).toBe('ewallet')
    const dup = await fail(http.post('/day-tickets', { name: 'An', phone: '0903111222', method: 'card' }))
    expect(dup.status).toBe(409)
    await http.post(`/day-tickets/${t.id}/checkout`)
    await http.post('/day-tickets', { name: 'An', phone: '0903111222', method: 'card' })
    const list = (await http.get('/day-tickets')).data
    expect(list.meta.count).toBeGreaterThanOrEqual(2)
    expect(list.meta.total).toBe(list.data.reduce((s: number, x: { amount: number }) => s + x.amount, 0))
  })

  it('stores inbody records newest first and enforces ranges', async () => {
    await http.post('/auth/login', { email: 'letan@gymhub.vn', password: 'letan123' })
    const mid = (await http.get('/members', { params: { limit: 5 } })).data.data.find((m: { branch_id: string }) => m.branch_id === 'b-q7').id
    expect((await fail(http.post(`/members/${mid}/inbody`, { weight: 10, height: 170, body_fat: 20, muscle: 30 }))).status).toBe(400)
    await http.post(`/members/${mid}/inbody`, { measured_on: '2026-10-01', weight: 70, height: 170, body_fat: 20, muscle: 30 })
    const r = (await http.post(`/members/${mid}/inbody`, { measured_on: '2026-11-01', weight: 69, height: 170, body_fat: 19, muscle: 31 })).data.data
    const list = (await http.get(`/members/${mid}/inbody`)).data.data
    expect(list.map((x: { weight: number }) => x.weight)).toEqual([69, 70])
    await http.delete(`/members/${mid}/inbody/${r.id}`)
    expect((await http.get(`/members/${mid}/inbody`)).data.data).toHaveLength(1)
  })
})
