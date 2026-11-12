export interface Branch { id: string; code: string; name: string }
export interface Me {
  id: string
  email: string
  name: string
  roles: string[]
  permissions: string[]
  branches: Branch[]
  can_checkin?: boolean
  checkin_branch?: Branch | null
}
export type MemberStatus = 'active' | 'expired' | 'frozen'
export type Gender = 'male' | 'female' | 'other'
export interface Member {
  id: string
  code: string
  name: string
  phone: string
  email: string | null
  gender: Gender | null
  dob: string | null
  status: MemberStatus
  branch_id: string
  avatar_url: string | null
  face_id?: string | null
  has_photo?: boolean
  photo_version?: number | null
  created_at: string
  branch?: Branch | null
  current_contract?: CurrentContract | null
}
export interface CurrentContract {
  id: string
  code: string
  status: ContractStatus
  package_name: string
  package_type: PackageType
  start_date: string | null
  end_date: string | null
  sessions_left: number | null
}
export type PackageType = 'day' | 'month' | 'session'
export interface Pkg {
  id: string
  name: string
  type: PackageType
  duration_days: number | null
  sessions: number | null
  price: number
  vat_percent: number
  branch_id: string | null
  active: boolean
}
export interface ListMeta { page: number; limit: number; total: number }
export interface ListResp<T> { data: T[]; meta: ListMeta }

export type ContractStatus = 'draft' | 'signed' | 'active' | 'frozen' | 'expired' | 'cancelled'
export interface ContractEvent { id: string; type: string; by_user: string | null; by_user_name?: string | null; reason: string | null; diff: unknown; created_at: string }
export type PayMethod = 'cash' | 'transfer' | 'vietqr' | 'ewallet'
export type PayStatus = 'pending' | 'confirmed' | 'failed' | 'refunded'
export interface Payment {
  id: string
  contract_id: string
  method: PayMethod
  amount: number
  status: PayStatus
  ref: string | null
  shift_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
  confirmed_at: string | null
  refund_requested?: boolean
  contract?: { id: string; code: string; member?: { name: string } }
}
export interface Contract {
  id: string
  code: string
  member_id: string
  package_id: string
  branch_id: string
  status: ContractStatus
  total_amount: number
  discount: number
  paid_amount: number
  debt_amount: number
  start_date: string | null
  end_date: string | null
  sessions_total: number | null
  sessions_left: number | null
  signed_at: string | null
  activated_at: string | null
  frozen_until: string | null
  renewed_from_id: string | null
  note: string | null
  created_at: string
  member: { id: string; code: string; name: string; phone: string }
  package: { id: string; name: string; type: PackageType }
  last_payment_method?: PayMethod | null
  branch?: Branch | null
  events?: ContractEvent[]
  payments?: Payment[]
}
export interface Shift { id: string; user_id: string; branch_id: string; opened_at: string; closed_at: string | null; opening_cash: number }
export interface ShiftClose { expected_cash: number; counted_cash: number; difference: number; totals_by_method: Partial<Record<PayMethod, number>> }
export type CheckinReason = 'NO_ACTIVE_CONTRACT' | 'EXPIRED' | 'FROZEN' | 'NO_SESSIONS' | 'WRONG_BRANCH' | 'NOT_CHECKED_IN' | null
export interface CheckinItem {
  id: string
  member: { id: string; code: string; name: string }
  result: 'allowed' | 'denied'
  reason: CheckinReason
  created_at: string
  checked_in_at?: string
  checked_out_at: string | null
}
export interface CheckinResult {
  result: 'allowed' | 'denied'
  reason: CheckinReason
  member: { id: string; code: string; name: string; phone?: string } | null
  contract: Partial<Contract> | null
  checkin_id: string | null
}
export interface Dashboard {
  revenue_today: number
  revenue_by_method: Partial<Record<PayMethod, number>>
  new_contracts_today: number
  active_members: number
  expiring_in_7_days: number
  checkins_today: number
  denied_today: number
  inside_now: number
  debt_total: number
  revenue_7d: { date: string; amount: number }[]
}
export interface Closing { totals_by_method: Partial<Record<PayMethod, number>>; total: number; items: Payment[] }
export interface UserRoleRef { id: string; role: string; branch_id: string | null }
export interface AdminUser { id: string; email: string; name: string; roles: UserRoleRef[] }
export interface RoleRow { id: string; name: string; description?: string | null; permissions: (string | { key: string })[] }
export interface AuditRow { id: string; actor_id?: string | null; target_id?: string | null; actor?: string | null; actor_email?: string | null; action: string; resource?: string | null; result?: string | null; ip?: string | null; created_at: string }
export interface SessionRow { id: string; device?: string | null; user_agent?: string | null; ip?: string | null; created_at: string; last_used_at?: string | null; current?: boolean }

export interface TodayTasks {
  awaiting_signature: { count: number; items: { id: string; code: string; member_name: string }[] }
  unpaid: { count: number; total_debt: number; items: { id: string; code: string; member_name: string; debt_amount: number }[] }
  expiring_in_2_days: { count: number; items: { id: string; code: string; member_name: string; end_date: string }[] }
  pending_refunds: { count: number; items: { id: string; contract_code: string; amount: number }[] }
}

export interface CheckinStatsBranch { branch: Branch; checkins_today: number; denied_today: number; inside_now: number; by_hour: { hour: number; count: number }[] }
export interface CheckinStats { date: string; branches: CheckinStatsBranch[]; totals: { checkins_today: number; denied_today: number; inside_now: number } }
