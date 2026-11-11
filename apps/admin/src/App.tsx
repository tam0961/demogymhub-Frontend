import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/Layout'
import { PermRoute } from './components/PermRoute'
import Audit from './pages/Audit'
import Closing from './pages/Closing'
import ContractDetail from './pages/ContractDetail'
import ContractNew from './pages/ContractNew'
import Contracts from './pages/Contracts'
import ForgotPassword from './pages/ForgotPassword'
import Forbidden from './pages/Forbidden'
import Login from './pages/Login'
import Me from './pages/Me'
import Members from './pages/Members'
import NotFound from './pages/NotFound'
import Packages from './pages/Packages'
import Payments from './pages/Payments'
import Reports from './pages/Reports'
import ResetPassword from './pages/ResetPassword'
import Roles from './pages/Roles'
import ShiftPage from './pages/ShiftPage'
import Today from './pages/Today'
import Users from './pages/Users'
import { usePermission } from './context/usePermission'
import type { ReactNode } from 'react'

function AnyPerm({ any, children }: { any: string[]; children: ReactNode }) {
  const { canAny } = usePermission()
  return canAny(...any) ? <>{children}</> : <Forbidden />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Today />} />
        <Route path="members" element={<PermRoute permission="members.read"><Members /></PermRoute>} />
        <Route path="packages" element={<PermRoute permission="packages.read"><Packages /></PermRoute>} />
        <Route path="contracts" element={<PermRoute permission="contracts.read"><Contracts /></PermRoute>} />
        <Route path="contracts/new" element={<PermRoute permission="contracts.create"><ContractNew /></PermRoute>} />
        <Route path="contracts/:id" element={<PermRoute permission="contracts.read"><ContractDetail /></PermRoute>} />
        <Route path="payments" element={<PermRoute permission="payments.read"><Payments /></PermRoute>} />
        <Route path="shift" element={<AnyPerm any={['shifts.open', 'shifts.close']}><ShiftPage /></AnyPerm>} />
        <Route path="reports" element={<PermRoute permission="reports.view"><Reports /></PermRoute>} />
        <Route path="reports/closing" element={<PermRoute permission="reports.view"><Closing /></PermRoute>} />
        <Route path="users" element={<PermRoute permission="roles.read"><Users /></PermRoute>} />
        <Route path="roles" element={<PermRoute permission="roles.read"><Roles /></PermRoute>} />
        <Route path="audit" element={<PermRoute permission="system.view_audit_log"><Audit /></PermRoute>} />
        <Route path="me" element={<Me />} />
        <Route path="403" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
