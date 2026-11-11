import type { TodayTasks } from '../types'
import { fmtMoney } from './format'

export interface TaskRow {
  key: string
  rank: number
  tone: 'bad' | 'warn' | 'yellow'
  title: string
  detail: string
  actionLabel: string
  to: string
}

const names = (xs: string[]) => {
  const head = xs.slice(0, 3).join(', ')
  return xs.length > 3 ? `${head} và ${xs.length - 3} người khác` : head
}

export function buildTasks(t: TodayTasks | null | undefined): TaskRow[] {
  if (!t) return []
  const out: Omit<TaskRow, 'rank'>[] = []
  const a = t.awaiting_signature
  if (a.count > 0) {
    out.push({
      key: 'sign', tone: 'warn', title: `${a.count} hợp đồng chờ khách ký`, detail: names(a.items.map((i) => i.member_name)),
      actionLabel: 'Mở hợp đồng', to: a.count === 1 && a.items[0] ? `/contracts/${a.items[0].id}` : '/contracts',
    })
  }
  const u = t.unpaid
  if (u.count > 0) {
    out.push({ key: 'unpaid', tone: 'bad', title: `${u.count} hợp đồng còn nợ`, detail: `Còn thiếu ${fmtMoney(u.total_debt)}: ${names(u.items.map((i) => i.member_name))}`, actionLabel: 'Xem công nợ', to: '/debt' })
  }
  const e = t.expiring_in_2_days
  if (e.count > 0) {
    out.push({ key: 'expiring', tone: 'warn', title: `${e.count} hợp đồng hết hạn trong 2 ngày`, detail: names(e.items.map((i) => i.member_name)), actionLabel: 'Xem hợp đồng', to: '/contracts' })
  }
  const r = t.pending_refunds
  if (r.count > 0) {
    out.push({ key: 'refund', tone: 'yellow', title: `${r.count} yêu cầu hoàn tiền chờ duyệt`, detail: r.items.map((i) => `${i.contract_code} ${fmtMoney(i.amount)}`).slice(0, 3).join(', '), actionLabel: 'Xem phiếu thu', to: '/payments' })
  }
  return out.map((x, i) => ({ ...x, rank: i + 1 }))
}
