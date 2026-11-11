/*
 * Shared UI kit (restyle "vang"). Import everything from './components/ui' (or '../components/ui').
 *
 * Layout:   PageHeader{title,sub?,action?}  Panel{title?,count?,note?,flush?}  KpiRow > Kpi{value,label}
 * Table:    DataTable<T>{columns[{key,header,render,sortValue?,numeric?}],rows,rowKey,onRowClick?,selectable?,
 *           selected?,onSelectionChange?,defaultSort?,pageSize?,loading?,error?,emptyText?,itemLabel?}
 * Status:   Chip{tone:'ok'|'warn'|'bad'|'neutral'}  BranchTag{branch,cross?}  memberStatus(contract)->{label,tone}
 * Inputs:   Field/FormField{label,htmlFor,hint?,error?,full?}  Input  Select  Textarea  Segmented  Tabs
 * Misc:     Button{variant:'primary'|'secondary'|'danger',small}  Avatar{name,src?,size?}  EmptyState  Icon
 * Overlay:  Modal{title,onClose,footer?,size:'normal'|'large'} (./Modal)  useToast()(text,isError?) (./Toast)
 * Format:   fmtMoney (700.000 d)  fmtDate (13/09/2026)  daysLeftText (Con n ngay)  fmtDateTime  fmtTime
 * Rules:    yellow only for primary action / active tab / active nav; all strings Vietnamese; React escapes user text.
 */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { Branch, ContractStatus, MemberStatus, PayStatus } from '../types'
import { CONTRACT_STATUS, PAY_STATUS, initials, type ChipTone } from '../lib/format'

export { Icon } from './icons'
export { DataTable, sortRows, paginate, pageButtons } from './DataTable'
export type { Column } from './DataTable'
export { Modal } from './Modal'
export { ToastProvider, useToast } from './Toast'
export { fmtMoney, fmtDate, fmtDateTime, fmtTime, daysLeft, daysLeftText, memberStatus, initials } from '../lib/format'
export type { ChipTone } from '../lib/format'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger'; small?: boolean }
export function Button({ variant = 'secondary', small, className = '', type = 'button', ...rest }: BtnProps) {
  const v = variant === 'secondary' ? '' : `btn-${variant}`
  return <button type={type} className={`btn ${v} ${small ? 'btn-sm' : ''} ${className}`} {...rest} />
}

interface FieldProps {
  label: string
  error?: string
  hint?: string
  full?: boolean
  htmlFor: string
  children: ReactNode
}
export function Field({ label, error, hint, full, htmlFor, children }: FieldProps) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  )
}
export const FormField = Field

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ invalid, ...rest }, ref) {
  return <input ref={ref} className="input" aria-invalid={invalid || undefined} {...rest} />
})

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select" {...props} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input" {...props} />
}

interface TabsProps<T extends string> {
  tabs: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}
export function Tabs<T extends string>({ tabs, value, onChange }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" className="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string; dot?: 'q2' | 'nb' | 'q7' | 'all' }[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`seg ${o.dot === 'all' ? 'seg-all' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.dot && o.dot !== 'all' && <span className={`dot dot-${o.dot}`} aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ tone, children }: { tone?: 'ok' | 'warn' | 'bad' | 'q2' | 'nb' | 'q7'; children: ReactNode }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>
}

export function Chip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

const STATUS: Record<MemberStatus, { tone: 'ok' | 'warn' | 'bad'; label: string }> = {
  active: { tone: 'ok', label: 'Đang hiệu lực' },
  expired: { tone: 'bad', label: 'Hết hạn' },
  frozen: { tone: 'warn', label: 'Tạm dừng' },
}
export function StatusBadge({ status }: { status: MemberStatus }) {
  const s = STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function ContractBadge({ status }: { status: ContractStatus }) {
  const s = CONTRACT_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}
export function PayBadge({ status }: { status: PayStatus }) {
  const s = PAY_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function BranchBadge({ branch }: { branch?: Branch }) {
  if (!branch) return <Badge>Tất cả</Badge>
  const c = branch.code.toLowerCase()
  return <Badge tone={c === 'q2' || c === 'nb' || c === 'q7' ? c : undefined}>{branch.code}</Badge>
}

export const branchColor = (code?: string | null) => {
  const c = (code ?? '').toLowerCase()
  return c === 'q2' || c === 'nb' || c === 'q7' ? c : 'all'
}

export function BranchTag({ branch, cross }: { branch?: { code: string; name: string } | null; cross?: boolean }) {
  if (!branch) return <span className="hint-muted">-</span>
  const c = branchColor(branch.code)
  return (
    <span className="branch-tag">
      <span className={`tag tag-${c}`}><span className={`dot dot-${c}`} aria-hidden="true" />{branch.name}</span>
      {cross && <span className="branch-cross">Liên chi nhánh</span>}
    </span>
  )
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) }
  if (src) return <img className="avatar" style={style} src={src} alt={name} />
  return <span className="avatar" style={style} aria-hidden="true">{initials(name)}</span>
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div>{title}</div>
      {hint && <div className="hint-muted">{hint}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {action && <div className="page-action">{action}</div>}
    </div>
  )
}

interface PanelProps { title?: string; count?: ReactNode; note?: ReactNode; flush?: boolean; className?: string; children: ReactNode }
export function Panel({ title, count, note, flush, className = '', children }: PanelProps) {
  const right = count ?? note
  return (
    <section className={`panel ${className}`}>
      {(title || right != null) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {right != null && <span className="panel-note">{right}</span>}
        </div>
      )}
      <div className={flush ? '' : 'panel-body'}>{children}</div>
    </section>
  )
}

export function Kpi({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="kpi2">
      <div className="kpi2-value">{value}</div>
      <div className="kpi2-label">{label}</div>
    </div>
  )
}
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="kpi-row">{children}</div>
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  return (
    <div className="pager">
      <span>
        {total} kết quả - trang {page}/{pages}
      </span>
      <div>
        <Button small disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</Button>
        <Button small disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau</Button>
      </div>
    </div>
  )
}
