import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

export interface DateRange { from: string; to: string }

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const fmt = (s: string) => { const d = parse(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` }
const weekStart = (d: Date) => addDays(d, -d.getDay())

interface Preset { key: string; label: string; range: (t: Date) => DateRange }
const r = (a: Date, b: Date): DateRange => ({ from: iso(a), to: iso(b) })
const PRESETS: Preset[] = [
  { key: 'all', label: 'Tất cả thời gian', range: () => ({ from: '', to: '' }) },
  { key: 'today', label: 'Hôm nay', range: (t) => r(t, t) },
  { key: 'yesterday', label: 'Hôm qua', range: (t) => r(addDays(t, -1), addDays(t, -1)) },
  { key: 'd7', label: '7 ngày qua', range: (t) => r(addDays(t, -6), t) },
  { key: 'd14', label: '14 ngày qua', range: (t) => r(addDays(t, -13), t) },
  { key: 'd28', label: '28 ngày qua', range: (t) => r(addDays(t, -27), t) },
  { key: 'd30', label: '30 ngày qua', range: (t) => r(addDays(t, -29), t) },
  { key: 'thisWeek', label: 'Tuần này', range: (t) => r(weekStart(t), t) },
  { key: 'lastWeek', label: 'Tuần trước', range: (t) => { const s = addDays(weekStart(t), -7); return r(s, addDays(s, 6)) } },
  { key: 'thisMonth', label: 'Tháng này', range: (t) => r(new Date(t.getFullYear(), t.getMonth(), 1), t) },
  { key: 'lastMonth', label: 'Tháng trước', range: (t) => r(new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)) },
  { key: 'lastQuarter', label: 'Quý trước', range: (t) => { const q = Math.floor(t.getMonth() / 3) * 3; return r(new Date(t.getFullYear(), q - 3, 1), new Date(t.getFullYear(), q, 0)) } },
]

function presetOf(v: DateRange, today: Date) {
  return PRESETS.find((p) => { const x = p.range(today); return x.from === v.from && x.to === v.to })
}

export function rangeLabel(v: DateRange, today = new Date()) {
  const p = presetOf(v, today)
  if (p) return p.key === 'all' ? p.label : `${p.label}: ${fmt(v.from)}${v.from !== v.to ? ` - ${fmt(v.to)}` : ''}`
  if (v.from && v.to) return `${fmt(v.from)} - ${fmt(v.to)}`
  if (v.from) return `Từ ${fmt(v.from)}`
  if (v.to) return `Đến ${fmt(v.to)}`
  return 'Tất cả thời gian'
}

function Month({ y, m, draft, onPick }: { y: number; m: number; draft: DateRange; onPick: (d: string) => void }) {
  const first = new Date(y, m, 1)
  const days = new Date(y, m + 1, 0).getDate()
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(y, m, i + 1)))]
  return (
    <div className="drp-grid">
      {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((w) => <span key={w} className="drp-dow">{w}</span>)}
      {cells.map((c, i) => {
        if (!c) return <span key={i} />
        const edge = c === draft.from || c === draft.to
        const mid = draft.from && draft.to && c > draft.from && c < draft.to
        return <button key={c} type="button" className={`drp-day${edge ? ' drp-edge' : ''}${mid ? ' drp-mid' : ''}`} onClick={() => onPick(c)}>{parse(c).getDate()}</button>
      })}
    </div>
  )
}

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const today = new Date()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(value)
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth() - 1, 1))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const show = () => {
    setDraft(value)
    const base = value.from ? parse(value.from) : today
    setView(new Date(base.getFullYear(), base.getMonth() - 1, 1))
    setOpen(true)
  }
  const pick = (d: string) => {
    if (!draft.from || draft.to) setDraft({ from: d, to: '' })
    else setDraft(d < draft.from ? { from: d, to: draft.from } : { from: draft.from, to: d })
  }
  const applyPreset = (p: Preset) => {
    const x = p.range(today)
    setDraft(x)
    if (x.from) setView(new Date(parse(x.from).getFullYear(), parse(x.from).getMonth(), 1))
  }
  const second = new Date(view.getFullYear(), view.getMonth() + 1, 1)
  const active = presetOf(draft, today)?.key ?? 'custom'
  const monthName = (d: Date) => `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`

  return (
    <div className="drp" ref={ref}>
      <button type="button" className="btn drp-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? setOpen(false) : show())}>
        {rangeLabel(value, today)}
      </button>
      {open && (
        <div className="drp-pop" role="dialog" aria-label="Chọn khoảng thời gian">
          <div className="drp-side">
            {PRESETS.map((p) => (
              <label key={p.key} className="drp-preset">
                <input type="radio" name="drp-preset" checked={active === p.key} onChange={() => applyPreset(p)} /> {p.label}
              </label>
            ))}
            <label className="drp-preset"><input type="radio" name="drp-preset" checked={active === 'custom'} onChange={() => undefined} /> Tùy chỉnh</label>
          </div>
          <div className="drp-main">
            <div className="drp-months">
              <div>
                <div className="drp-nav">
                  <button type="button" className="icon-btn" aria-label="Tháng trước" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>‹</button>
                  <strong>{monthName(view)}</strong>
                  <span className="drp-nav-gap" />
                </div>
                <Month y={view.getFullYear()} m={view.getMonth()} draft={draft} onPick={pick} />
              </div>
              <div>
                <div className="drp-nav">
                  <span className="drp-nav-gap" />
                  <strong>{monthName(second)}</strong>
                  <button type="button" className="icon-btn" aria-label="Tháng sau" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>›</button>
                </div>
                <Month y={second.getFullYear()} m={second.getMonth()} draft={draft} onPick={pick} />
              </div>
            </div>
            <div className="drp-inputs">
              <input className="input" type="date" aria-label="Từ ngày" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              <span>-</span>
              <input className="input" type="date" aria-label="Đến ngày" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </div>
            <div className="drp-foot">
              <span className="hint-muted">Ngày hiển thị theo giờ TP Hồ Chí Minh</span>
              <Button onClick={() => setOpen(false)}>Hủy</Button>
              <Button variant="primary" onClick={() => { onChange(draft.from && !draft.to ? { from: draft.from, to: draft.from } : draft); setOpen(false) }}>Cập nhật</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
