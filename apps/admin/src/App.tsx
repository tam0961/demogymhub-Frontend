import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/Layout'
import { PermRoute } from './components/PermRoute'
import Audit from './pages/Audit'
import Closing from './pages/Closing'
import ContractDetail from './pages/ContractDetail'
import Contracts from './pages/Contracts'
import ForgotPassword from './pages/ForgotPassword'
import Forbidden from './pages/Forbidden'
import Login from './pages/Login'
import Me from './pages/Me'
import Members from './pages/Members'
import Leads from './pages/Leads'
import Expiring from './pages/Expiring'
import NotFound from './pages/NotFound'
import Packages from './pages/Packages'
import Payments from './pages/Payments'
import PtClasses from './pages/PtClasses'
import PublicBooking from './pages/PublicBooking'
import PtOne from './pages/PtOne'
import ZnsSettings from './pages/ZnsSettings'
import InvoiceSettings from './pages/InvoiceSettings'
import BankSettings from './pages/BankSettings'
import SheetSettings from './pages/SheetSettings'
import PrintTemplates from './pages/PrintTemplates'
import PtDesk from './pages/PtDesk'
import RevenueServices from './pages/RevenueServices'
import ContractProgress from './pages/ContractProgress'
import OpsStats from './pages/OpsStats'
import MarketingStats from './pages/MarketingStats'
import IpadPage from './pages/IpadPage'
import Reports from './pages/Reports'
import ResetPassword from './pages/ResetPassword'
import Roles from './pages/Roles'
import ShiftPage from './pages/ShiftPage'
import Today from './pages/Today'
import Staff from './pages/Staff'
import Attendance from './pages/Attendance'
import Devices from './pages/Devices'
import Users from './pages/Users'
import Tickets from './pages/Tickets'
import DayTickets from './pages/DayTickets'
import Payroll from './pages/Payroll'
import { usePermission } from './context/usePermission'

const pageModules = import.meta.glob('./pages/{Access,Debt}.tsx') as Record<string, () => Promise<{ default: ComponentType }>>
const optionalPage = (file: string) => lazy(pageModules[`./pages/${file}.tsx`] ?? (() => import('./pages/NotFound')))
const Access = optionalPage('Access')
const Debt = optionalPage('Debt')

function AnyPerm({ any, children }: { any: string[]; children: ReactNode }) {
  const { canAny } = usePermission()
  return canAny(...any) ? <>{children}</> : <Forbidden />
}

export default function App() {
  return (
    <Suspense fallback={<div className="loading">Đang tải...</div>}>
    <Routes>
      <Route path="/dang-ky-lop" element={<PublicBooking />} />
      <Route path="/ipad" element={<IpadPage />} />
      <Route path="/ipad/:token" element={<IpadPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Today />} />
        <Route path="access" element={<PermRoute permission="checkins.read"><Access /></PermRoute>} />
        <Route path="pt" element={<Navigate to="/pt/one" replace />} />
        <Route path="settings/bank" element={<PermRoute permission="roles.read"><BankSettings /></PermRoute>} />
        <Route path="settings/zns" element={<PermRoute permission="roles.read"><ZnsSettings /></PermRoute>} />
        <Route path="settings/invoice" element={<PermRoute permission="roles.read"><InvoiceSettings /></PermRoute>} />
        <Route path="settings/sheets" element={<PermRoute permission="roles.read"><SheetSettings /></PermRoute>} />
        <Route path="settings/print" element={<PermRoute permission="roles.read"><PrintTemplates /></PermRoute>} />
        <Route path="marketing/stats" element={<PermRoute permission="reports.view"><MarketingStats /></PermRoute>} />
        <Route path="pt/one"element={<PermRoute permission="pt_sessions.read"><PtOne /></PermRoute>} />
        <Route path="pt/desk" element={<PermRoute permission="pt_sessions.read"><PtDesk /></PermRoute>} />
        <Route path="reports/services" element={<PermRoute permission="reports.view"><RevenueServices /></PermRoute>} />
        <Route path="reports/progress" element={<PermRoute permission="reports.view"><ContractProgress /></PermRoute>} />
        <Route path="reports/ops" element={<PermRoute permission="reports.view"><OpsStats /></PermRoute>} />
        <Route path="pt/classes" element={<PermRoute permission="pt_sessions.read"><PtClasses /></PermRoute>} />
        <Route path="debt" element={<PermRoute permission="contracts.read"><Debt /></PermRoute>} />
        <Route path="day-tickets" element={<PermRoute permission="day_tickets.read"><DayTickets /></PermRoute>} />
        <Route path="tickets" element={<PermRoute permission="contracts.approve"><Tickets /></PermRoute>} />
        <Route path="payroll" element={<PermRoute permission="payroll.read"><Payroll /></PermRoute>} />
        <Route path="members" element={<PermRoute permission="members.read"><Members /></PermRoute>} />
        <Route path="leads" element={<PermRoute permission="leads.read"><Leads /></PermRoute>} />
        <Route path="expiring" element={<PermRoute permission="reports.view"><Expiring /></PermRoute>} />
        <Route path="packages"element={<PermRoute permission="packages.read"><Packages /></PermRoute>} />
        <Route path="contracts" element={<PermRoute permission="contracts.read"><Contracts /></PermRoute>} />
        <Route path="contracts/new" element={<PermRoute permission="contracts.read"><Contracts /></PermRoute>} />
        <Route path="contracts/:id" element={<PermRoute permission="contracts.read"><ContractDetail /></PermRoute>} />
        <Route path="payments" element={<PermRoute permission="payments.read"><Payments /></PermRoute>} />
        <Route path="shift" element={<AnyPerm any={['shifts.open', 'shifts.close']}><ShiftPage /></AnyPerm>} />
        <Route path="reports" element={<PermRoute permission="reports.view"><Reports /></PermRoute>} />
        <Route path="reports/closing" element={<PermRoute permission="reports.view"><Closing /></PermRoute>} />
        <Route path="staff" element={<PermRoute permission="staff.read"><Staff /></PermRoute>} />
        <Route path="settings/devices" element={<PermRoute permission="devices.manage"><Devices /></PermRoute>} />
        <Route path="attendance" element={<PermRoute permission="attendance.read"><Attendance /></PermRoute>} />
        <Route path="users" element={<PermRoute permission="roles.read"><Users /></PermRoute>} />
        <Route path="roles" element={<PermRoute permission="roles.read"><Roles /></PermRoute>} />
        <Route path="audit" element={<PermRoute permission="system.view_audit_log"><Audit /></PermRoute>} />
        <Route path="me" element={<Me />} />
        <Route path="403" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
  )
}
