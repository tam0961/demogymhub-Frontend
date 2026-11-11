import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import type { Branch, ContractStatus, MemberStatus, PayStatus } from '../types'
import { CONTRACT_STATUS, PAY_STATUS } from '../lib/format'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger'; small?: boolean }
export function Button({ variant = 'secondary', small, className = '', type = 'button', ...rest }: BtnProps) {
  const v = variant === 'secondary' ? '' : `btn-${variant}`
  return <button type={type} className={`btn ${v} ${small ? 'btn-sm' : ''} ${className}`} {...rest} />
}

interface FieldProps {
  label: string
  error?: string
  full?: boolean
  htmlFor: string
  children: ReactNode
}
export function Field({ label, error, full, htmlFor, children }: FieldProps) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ invalid, ...rest }, ref) {
  return <input ref={ref} className="input" aria-invalid={invalid || undefined} {...rest} />
})

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select" {...props} />
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

export function Badge({ tone, children }: { tone?: 'ok' | 'warn' | 'bad' | 'nb' | 'q7'; children: ReactNode }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>
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
  return <Badge tone={c === 'nb' || c === 'q7' ? c : undefined}>{branch.code}</Badge>
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

const ICONS: Record<string, string> = {
  today: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  members: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  packages: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  menu: 'M4 6h16M4 12h16M4 18h16',
  contracts: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  payments: 'M3 6h18v12H3zM3 10h18M7 15h3',
  reports: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 8a3 3 0 010 6M21 20a6 6 0 00-4-5.6',
  roles: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  audit: 'M9 4h6M8 2h8v4H8zM6 4H5v18h14V4h-1M9 12h6M9 16h6',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  closing: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
}
export function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}
