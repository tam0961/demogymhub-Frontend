import { fmtDate, type ChipTone } from './format'
import type { ExpiringRow, LeadStatus } from '../types'

export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'trial_booked', 'converted', 'lost']

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: ChipTone }> = {
  new: { label: 'Mới', tone: 'neutral' },
  contacted: { label: 'Đã liên hệ', tone: 'warn' },
  trial_booked: { label: 'Hẹn tập thử', tone: 'warn' },
  converted: { label: 'Đã chuyển hội viên', tone: 'ok' },
  lost: { label: 'Không thành công', tone: 'bad' },
}

export function leadErrorText(e: { status: number; code: string; message: string }): { phone?: string; form?: string } {
  if (e.code === 'DUPLICATE_PHONE') return { form: 'Số điện thoại đã là hội viên, không thể chuyển đổi' }
  if (e.code === 'ALREADY_CONVERTED') return { form: 'Khách này đã được chuyển thành hội viên' }
  return { form: e.message }
}

export function reminderText(r: Pick<ExpiringRow, 'name' | 'package_name' | 'end_date' | 'days_left'>): string {
  const when = r.days_left <= 0 ? 'hôm nay' : `ngày ${fmtDate(r.end_date)} (còn ${r.days_left} ngày)`
  return `Chào ${r.name}, gói ${r.package_name} của bạn tại DemoGym sẽ hết hạn ${when}. Bạn vui lòng liên hệ quầy lễ tân để gia hạn và tiếp tục tập luyện nhé. Cảm ơn bạn!`
}
