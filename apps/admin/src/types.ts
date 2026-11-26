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
  debt_amount?: number
  debt_due_date?: string | null
  created_at: string
  branch?: Branch | null
  current_contract?: CurrentContract | null
  pt_contract?: PtContract | null
}
export interface PtContract {
  id: string
  code: string
  status: ContractStatus
  package_name: string
  package_category?: PackageCategory
  start_date: string | null
  end_date: string | null
  sessions_total: number | null
  sessions_left: number | null
  usage_deadline: string | null
  usage_valid: boolean
}
export type PtReason = 'MEMBER_PACKAGE_EXPIRED' | 'NO_PT_PACKAGE' | 'PT_USAGE_EXPIRED' | 'PT_PACKAGE_EXPIRED'
export interface PtEligibility {
  eligible: boolean
  reasons: PtReason[]
  member_package: { ok: boolean; contract_code: string | null; end_date: string | null }
  pt_package: { category?: PackageCategory | null; ok: boolean; contract_code: string | null; end_date: string | null; usage_deadline: string | null; sessions_left: number | null }
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
export type PackageCategory = 'member' | 'pt_1on1' | 'pt_1on2' | 'pt_group'
export interface Pkg {
  id: string
  name: string
  type: PackageType
  category: PackageCategory
  duration_days: number | null
  sessions: number | null
  price: number
  vat_percent: number
  branch_id: string | null
  active: boolean
  bundled_member_package?: BundledPkg | null
  bundle_only?: boolean
  display_group?: 'pt_group' | null
  gift?: string | null
  checkin_before?: string | null
  promo_type?: 'bonus_months' | 'bonus_days' | 'bonus_sessions' | 'percent' | 'amount' | null
  promo_value?: number | null
  promo_until?: string | null
  replaces_id?: string | null
  contracts_count?: number
  in_use?: boolean
}
export interface BundledPkg { id: string; name: string; duration_days: number | null; price: number }
export interface BundledContract { id: string; code: string; status: ContractStatus; start_date: string | null; end_date: string | null; package: { id: string; name: string; type: PackageType; category: PackageCategory } }
export interface ListMeta { page: number; limit: number; total: number }
export interface ListResp<T> { data: T[]; meta: ListMeta }

export type ContractStatus = 'draft' | 'signed' | 'active' | 'frozen' | 'expired' | 'cancelled'
export interface ContractEvent { id: string; type: string; by_user: string | null; by_user_name?: string | null; reason: string | null; diff: unknown; created_at: string }
export type PayMethod = 'cash' | 'transfer' | 'card' | 'vietqr' | 'ewallet'
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
  created_by_name?: string | null
  created_at: string
  confirmed_at: string | null
  refund_requested?: boolean
  contract?: { id: string; code: string; member?: { id?: string; code?: string; name: string } }
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
  due_date?: string | null
  overdue_days?: number
  is_deposit?: boolean
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
  member: { id: string; code: string; name: string; phone: string; email?: string | null }
  package: { id: string; name: string; type: PackageType; category: PackageCategory }
  usage_deadline?: string | null
  bundle_of_id?: string | null
  sale?: { id: string | null; name: string | null } | null
  pt?: { id: string | null; name: string | null } | null
  bundled_contracts?: BundledContract[]
  last_payment_method?: PayMethod | null
  last_paid_at?: string | null
  branch?: Branch | null
  events?: ContractEvent[]
  payments?: Payment[]
}
export interface Shift { id: string; user_id: string; branch_id: string; opened_at: string; closed_at: string | null; opening_cash: number }
export interface ShiftClose { expected_cash: number; counted_cash: number; difference: number; totals_by_method: Partial<Record<PayMethod, number>> }
export type CheckinReason = 'NO_ACTIVE_CONTRACT' | 'EXPIRED' | 'FROZEN' | 'NO_SESSIONS' | 'WRONG_BRANCH' | 'OUTSIDE_HOURS' | 'NOT_CHECKED_IN' | null
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
  revenue_by_kind?: Record<string, number>
  contract_value_by_kind?: Record<string, number>
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
export interface UserRoleRef { id: string; role: string; branch_id: string | null; branch_code?: string | null }
export interface AdminUser { id: string; email: string; name: string; employee_no?: string | null; roles: UserRoleRef[] }
export interface RoleRow { id: string; key?: string; name: string; description?: string | null; permissions: (string | { key: string })[] }
export interface AuditRow { id: string; actor_id?: string | null; target_id?: string | null; actor?: string | null; actor_email?: string | null; action: string; resource?: string | null; result?: string | null; ip?: string | null; created_at: string }
export interface SessionRow { id: string; device?: string | null; user_agent?: string | null; ip?: string | null; created_at: string; last_used_at?: string | null; current?: boolean }

export interface TodayTasks {
  awaiting_signature: { count: number; items: { id: string; code: string; member_name: string }[] }
  unpaid: { count: number; total_debt: number; items: { id: string; code: string; member_name: string; debt_amount: number; due_date?: string | null; overdue_days?: number }[] }
  expiring_in_2_days: { count: number; items: { id: string; code: string; member_name: string; end_date: string }[] }
  pending_refunds: { count: number; items: { id: string; contract_code: string; amount: number }[] }
}

export interface CheckinStatsBranch { branch: Branch; checkins_today: number; denied_today: number; inside_now: number; by_hour: { hour: number; count: number }[] }
export interface CheckinStats { date: string; branches: CheckinStatsBranch[]; totals: { checkins_today: number; denied_today: number; inside_now: number } }

export type PtStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export interface PtSession {
  id: string
  branch_id: string
  trainer: { id: string; name: string }
  member: { id: string; code: string; name: string; phone: string } | null
  contract_id: string | null
  contract_code: string | null
  sessions_left: number | null
  start_at: string
  end_at: string
  status: PtStatus
  source: string
  note: string | null
  completed_at: string | null
}

export interface GroupClass {
  id: string
  branch_id: string
  title: string
  muscle_group: string | null
  trainer: { id: string; name: string } | null
  start_at: string
  end_at: string
  capacity: number
  registered: number
  status: 'scheduled' | 'completed' | 'cancelled'
  completed_at: string | null
}
export type GroupRegStatus = 'booked' | 'attended' | 'absent' | 'cancelled' | 'waitlist'
export interface GroupReg {
  id: string
  member_id: string
  name: string
  phone: string
  email: string | null
  status: GroupRegStatus
  deducted: boolean
  contract_code: string | null
  sessions_left?: number | null
  created_at: string
  cancel_count?: number
  class: { id: string; title: string; muscle_group?: string | null; start_at: string; end_at: string; status: GroupClass['status']; trainer: { id: string; name: string } | null }
}
export interface GroupStats {
  classes: { total: number; scheduled: number; completed: number; cancelled: number }
  registrations: { booked: number; attended: number; absent: number; cancelled: number; waitlist: number }
  fill_rate: number
  trainers: { id: string; name: string; classes: number; attended: number }[]
}
export interface GroupTemplate { id: string; branch_id: string; weekday: number; start_time: string; end_time: string; capacity: number; muscle_group: string | null }
export interface GroupReportRow { month: string; trainer: string; classes: number; attended: number }

export type LeadStatus = 'new' | 'contacted' | 'trial_booked' | 'converted' | 'lost'
export interface Lead {
  id: string
  name: string
  phone: string
  email: string | null
  source: string | null
  interest: string | null
  pt_name?: string | null
  outcome?: string | null
  call_response?: string | null
  option_pref?: string | null
  reg_type?: string | null
  status: LeadStatus
  note: string | null
  branch_id: string
  assigned_to: string | null
  trial_at: string | null
  member_id: string | null
  created_at: string
  updated_at: string
}
export interface ExpiringRow {
  member_id: string
  member_code: string
  name: string
  phone: string
  package_name: string
  end_date: string
  days_left: number
  branch: Branch
}

export interface Ticket {
  id: string
  contract_id: string
  contract_code: string
  member_name: string
  member_code: string
  type: 'upgrade' | 'downgrade' | 'convert' | 'transfer' | 'branch_change' | 'cancel'
  status: 'applied' | 'pending' | 'rejected'
  fee: number
  payload: Record<string, unknown> | null
  reason: string | null
  requested_by: string | null
  requested_by_name: string | null
  decided_by: string | null
  decided_by_name: string | null
  decided_at: string | null
  created_at: string
}


export type PayrollPosition = 'pt_fulltime' | 'pt_parttime' | 'marketing' | 'sale' | 'other'
export type PayrollTaxMode = 'progressive' | 'flat10' | 'none'
export interface PayrollTier { upTo: number | null; rate: number }
export interface PayrollSettings {
  memberTiers: PayrollTier[]
  ptTiers: PayrollTier[]
  marketingTiers: PayrollTier[]
  ptImmediateShare: number
  ptSessionShare: number
  classRate: number
  insuranceRate: number
  insuranceBase: number | null
  fixedTax: number
  partTimeTaxRate: number
  taxBrackets: PayrollTier[]
  personalDeduction: number | null
  dependentDeduction: number | null
}
export interface PayrollProfile {
  position: PayrollPosition
  base_salary: number
  has_insurance: boolean
  tax_mode: PayrollTaxMode
  dependents: number
  active: boolean
}
export interface PayrollStaff {
  user_id: string
  name: string
  email: string
  roles: string[]
  branch_codes: string[]
  profile: PayrollProfile | null
}
export interface PayrollRow {
  user_id: string
  name: string
  position: PayrollPosition
  base_salary: number
  member_sales: number
  member_commission: number
  marketing_commission: number
  pt_sales: number
  pt_rate: number
  pt_immediate: number
  pt_session_pay: number
  pt_sessions_taught: number
  group_classes: number
  group_pay: number
  gross: number
  insurance: number
  tax: number
  tax_pending: boolean
  penalty: number
  adjustment: number
  net: number
  note: string | null
}
export interface PayrollPreview {
  month: string
  status: 'open' | 'closed'
  updated_at?: string
  rows: PayrollRow[]
  totals: Omit<PayrollRow, 'user_id' | 'name' | 'position' | 'tax_pending' | 'note' | 'pt_rate'> & Partial<Pick<PayrollRow, 'pt_rate'>>
}

export interface PtStatClient {
  contract_id: string
  contract_code: string
  member_id: string
  member_code: string
  member_name: string
  package_name: string
  sessions_total: number | null
  sessions_left: number | null
  taught_in_month: number
  end_date: string | null
  session_pay: number
}
export interface PtStatClass { id: string; title: string; start_at: string }
export interface PtStatSale {
  contract_id: string
  contract_code: string
  member_name: string
  package_name: string
  kind: 'member' | 'pt'
  amount: number
}
export interface PtStatRow {
  user_id: string
  name: string
  position: PayrollPosition
  clients: PtStatClient[]
  sessions_taught: number
  group_classes: number
  classes: PtStatClass[]
  member_sales: number
  pt_sales: number
  sales: PtStatSale[]
  class_rate: number
  group_pay: number
  session_pay: number
}
export interface PtStats { month: string; rows: PtStatRow[] }

export type StaffPosition = 'pt_fulltime' | 'pt_parttime' | 'marketing' | 'sale' | 'reception' | 'other'
export interface StaffKpi {
  contracts_sold: number; member_contracts: number; pt_contracts: number; new_customers: number
  revenue: number; member_revenue: number; pt_revenue: number; avg_contract_value: number; debt_outstanding: number
  active_clients: number; sessions_taught: number; group_classes: number
  session_done_rate: number | null; no_show_rate: number | null; sessions_left_total: number; expiring_30: number; renewal_rate: number | null
}
export interface StaffPrev { contracts_sold: number; revenue: number; sessions_taught: number; new_customers: number }
export interface StaffRow {
  user_id: string; name: string; phone: string | null; position: StaffPosition; active: boolean
  hired_on: string | null; left_on: string | null; note: string | null; employee_no: string | null
  branches: { id: string; code: string; name: string }[]
  kpi: StaffKpi; prev: StaffPrev; rank: { revenue: number | null }
}
export interface StaffList { month: string; prev_month: string; rows: StaffRow[] }
export interface StaffTrendPoint { month: string; contracts_sold: number; revenue: number; sessions_taught: number; new_customers: number }
export interface StaffClient { member_id: string; member_code: string; member_name: string; package_name: string; contract_code: string; sessions_left: number | null; end_date: string | null; status: string }
export interface StaffContract { id: string; code: string; member_name: string; package_name: string; total_amount: number; paid_amount: number; created_at: string; role: 'sale' | 'pt' }
export interface StaffDetail { staff: StaffRow; trend: StaffTrendPoint[]; clients: StaffClient[]; contracts: StaffContract[] }
export interface StaffForm {
  name: string; phone: string; position: StaffPosition; branch_id: string; hired_on: string; employee_no: string; note: string
}

export type DayTicketMethod = 'cash' | 'transfer' | 'card' | 'momo'
export interface DayTicket {
  id: string
  name: string
  phone: string
  branch_id: string
  issued_on: string
  amount: number
  method: PayMethod
  payment_id: string
  payment_status: PayStatus
  checked_out_at: string | null
  created_at: string
  created_by: string | null
  created_by_name: string | null
}
export interface DayTicketList { data: DayTicket[]; meta: { from: string; to: string; count: number; total: number; price: number } }

export interface InbodyRecord {
  id: string
  member_id: string
  measured_on: string
  weight: number
  height: number
  body_fat: number
  muscle: number
  source: string
  note: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

export interface InvoiceCfg {
  live: boolean; base: string; supplierCode: string; invoiceType: string; templateCode: string; user: string; vat: number
  sellerName: string; sellerTaxCode: string; sellerAddress: string; sellerPhone: string; sellerEmail: string; sellerBank: string; sellerAccount: string
}
export interface InvoiceCfgResp { cfg: InvoiceCfg; has_pass: boolean; vat_rates: number[] }
export interface InvoicePublicCfg { live: boolean; vat: number; vat_rates: number[] }
export interface InvoiceCalc {
  items: { line: number; name: string; unit: string; qty: number; vat: number; gross: number; net: number; tax: number; unitPrice: number }[]
  net: number; tax: number; total: number
}
export interface InvoiceIssued { id: string; status: 'test' | 'issued'; live: boolean; note: string | null; invoice_no: string | null; reservation_code: string | null; calc: InvoiceCalc; words: string }
export interface InvoiceRow { id: string; status: 'test' | 'issued' | 'failed'; invoice_no: string | null; buyer_name: string; net: number; tax: number; total: number; error: string | null; created_at: string }

export interface SheetWriteProblem {
  id: string
  status: 'failed' | 'skipped'
  reason: string | null
  attempts: number
  member_name: string
  phone: string
  class_date: string
  class_start: string
  created_at: string
}
export interface SheetSyncCfg {
  write_on: boolean
  bridge_url: string
  pull_on: boolean
  dump_url: string
  branch_id: string
  last_pull_at: string | null
  last_pull_error: string | null
  last_pull_counts: Record<string, number> | null
  write_log: { counts: Record<string, number>; problems: SheetWriteProblem[] }
}

export interface PendingSheetMember {
  name: string
  phone: string
  email: string
  expiry: string
  learned: number
  remaining: number
  note: string
  seenAt: string
}
