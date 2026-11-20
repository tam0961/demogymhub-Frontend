import type { InbodyRecord } from '../types'

export interface InbodyForm { measured_on: string; weight: string; height: string; body_fat: string; muscle: string; note: string }

export const INBODY_LIMITS = {
  weight: { min: 20, max: 300, label: 'Cân nặng (kg)' },
  height: { min: 100, max: 250, label: 'Chiều cao (cm)' },
  body_fat: { min: 1, max: 70, label: 'Mỡ cơ thể (%)' },
  muscle: { min: 5, max: 150, label: 'Khối lượng cơ (kg)' },
} as const

type NumKey = keyof typeof INBODY_LIMITS
const num = (s: string) => Number(s.replace(',', '.'))

export function inbodyErrors(f: InbodyForm, today: string): Partial<Record<NumKey | 'measured_on', string>> {
  const out: Partial<Record<NumKey | 'measured_on', string>> = {}
  for (const k of Object.keys(INBODY_LIMITS) as NumKey[]) {
    const { min, max } = INBODY_LIMITS[k]
    const v = num(f[k])
    if (f[k].trim() === '' || !Number.isFinite(v) || v < min || v > max) out[k] = `Nhập từ ${min} đến ${max}`
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.measured_on) || f.measured_on > today) out.measured_on = 'Ngày đo không hợp lệ'
  return out
}

export const inbodyBody = (f: InbodyForm) => ({
  measured_on: f.measured_on,
  weight: num(f.weight),
  height: num(f.height),
  body_fat: num(f.body_fat),
  muscle: num(f.muscle),
  ...(f.note.trim() ? { note: f.note.trim() } : {}),
})

export type TrendKey = 'weight' | 'body_fat' | 'muscle'

export interface TrendLine { key: TrendKey; points: { x: number; y: number; value: number; date: string }[]; min: number; max: number }

/** Oldest first, each series scaled to its own range so kg and % share one chart. */
export function trendLines(records: InbodyRecord[], width: number, height: number, pad = 12): TrendLine[] {
  const rows = records.slice().sort((a, b) => a.measured_on.localeCompare(b.measured_on))
  const w = Math.max(1, width - pad * 2)
  const h = Math.max(1, height - pad * 2)
  return (['weight', 'body_fat', 'muscle'] as TrendKey[]).map((key) => {
    const vals = rows.map((r) => r[key])
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min
    return {
      key,
      min,
      max,
      points: rows.map((r, i) => ({
        x: pad + (rows.length === 1 ? w / 2 : (i / (rows.length - 1)) * w),
        y: pad + (span === 0 ? h / 2 : h - ((r[key] - min) / span) * h),
        value: r[key],
        date: r.measured_on,
      })),
    }
  })
}

export const changeText = (records: InbodyRecord[], key: TrendKey) => {
  if (records.length < 2) return null
  const rows = records.slice().sort((a, b) => a.measured_on.localeCompare(b.measured_on))
  const d = Math.round((rows[rows.length - 1][key] - rows[0][key]) * 10) / 10
  return d === 0 ? '0' : `${d > 0 ? '+' : ''}${d}`
}
