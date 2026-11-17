import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { PACKAGE_CATEGORIES, PACKAGE_CATEGORY, fmtMoney, isPtCategory } from '../lib/format'
import { BOX_ORDER, IN_USE_TITLE, bundleText, changedFields, groupPackages, packageError, termText, type PkgForm } from '../lib/packages'
import { PT_RULE_HINT, hasHsd, hsdRuleText } from '../lib/pt'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { ConfirmDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'
import { BranchTag, Button, Chip, DataTable, Field, Input, PageHeader, Panel, Select, useToast, type Column } from '../components/ui'
import type { ListResp, PackageCategory, PackageType, Pkg } from '../types'

const CALC_LABEL: Record<PackageType, string> = { day: 'Theo ngày', month: 'Theo tháng', session: 'Theo buổi' }

export type FormTarget = { mode: 'new'; category: PackageCategory } | { mode: 'edit'; pkg: Pkg } | { mode: 'version'; pkg: Pkg }

export interface BoxActions {
  onAdd: (c: PackageCategory) => void
  onEdit: (p: Pkg) => void
  onVersion: (p: Pkg) => void
  onToggle: (p: Pkg) => void
}

export function PackageBoxes({ rows, showInactive, q, canEdit, canCreate, actions }: { rows: Pkg[]; showInactive: boolean; q: string; canEdit: boolean; canCreate: boolean; actions: BoxActions }) {
  const { user } = useAuth()
  const groups = useMemo(() => groupPackages(rows, showInactive, q), [rows, showInactive, q])
  const columnsFor = (cat: PackageCategory): Column<Pkg>[] => {
    const pt = isPtCategory(cat)
    const cols: Column<Pkg>[] = [
      {
        key: 'name', header: 'Tên gói', sortValue: (p) => p.name,
        render: (p) => <><span className="cell-main">{p.name}</span>{p.replaces_id && <> <Chip>Phiên bản mới</Chip></>}<div className="cell-sub">{CALC_LABEL[p.type]}</div></>,
      },
      { key: 'price', header: 'Giá', numeric: true, sortValue: (p) => p.price, render: (p) => <>{fmtMoney(p.price)}<div className="cell-sub">đã gồm VAT {p.vat_percent}%</div></> },
      {
        key: 'term', header: pt ? 'Số buổi' : 'Thời hạn', sortValue: (p) => (p.type === 'session' ? p.sessions : p.duration_days),
        render: (p) => termText(p),
      },
    ]
    if (hasHsd(cat)) cols.push({ key: 'hsd', header: 'HSD', sortValue: (p) => p.sessions, render: (p) => hsdRuleText(p.sessions) })
    if (pt) cols.push({ key: 'bundle', header: 'Gói member đi kèm', render: (p) => (p.bundled_member_package ? bundleText(p.bundled_member_package) : <Chip tone="warn">Chưa gắn</Chip>) })
    if ((user?.branches.length ?? 0) > 1) cols.push({ key: 'branch', header: 'Chi nhánh', render: (p) => <BranchTag branch={user?.branches.find((b) => b.id === p.branch_id)} /> })
    cols.push(
      { key: 'active', header: 'Trạng thái', sortValue: (p) => (p.active ? 0 : 1), render: (p) => (p.active ? <Chip tone="ok">Đang bán</Chip> : <Chip>Đã vô hiệu hóa</Chip>) },
      { key: 'count', header: 'Số hợp đồng', numeric: true, sortValue: (p) => p.contracts_count ?? 0, render: (p) => p.contracts_count ?? 0 },
    )
    if (canEdit) {
      cols.push({
        key: 'act', header: '', className: 'actions',
        render: (p) => (
          <>
            <Button small disabled={!!p.in_use} title={p.in_use ? IN_USE_TITLE : undefined} onClick={() => actions.onEdit(p)}>Sửa</Button>
            {canCreate && <Button small title="Sao chép / tạo phiên bản mới" onClick={() => actions.onVersion(p)}>Sao chép</Button>}
            <Button small variant={p.active ? 'danger' : 'secondary'} onClick={() => actions.onToggle(p)}>{p.active ? 'Vô hiệu hóa' : 'Kích hoạt lại'}</Button>
          </>
        ),
      })
    }
    return cols
  }
  return (
    <div className="stack">
      {BOX_ORDER.map((cat) => (
        <Panel key={cat} title={PACKAGE_CATEGORY[cat]} count={<>{groups[cat].length} gói {canCreate && <Button small onClick={() => actions.onAdd(cat)}>Thêm gói</Button>}</>} flush>
          {hasHsd(cat) && <div className="panel-note">{PT_RULE_HINT}</div>}
          {cat !== 'member' && <div className="panel-note">Gói PT đi kèm một gói member: khi bán gói PT, hệ thống tự gán gói member đó cho khách.</div>}
          <DataTable
            columns={columnsFor(cat)}
            rows={groups[cat]}
            rowKey={(p) => p.id}
            rowClassName={(p) => (p.active ? '' : 'row-muted')}
            emptyText="Chưa có gói"
            itemLabel="gói"
          />
        </Panel>
      ))}
    </div>
  )
}

export default function Packages() {
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [rows, setRows] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormTarget | null>(null)
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [confirm, setConfirm] = useState<Pkg | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<Pkg>>('/packages', { params: { branch_id: branchId ?? undefined, limit: 200 } })
      setRows(data.data)
    } catch (e) {
      setError(packageError(e))
    } finally {
      setLoading(false)
    }
  }, [branchId])
  useEffect(() => {
    load()
  }, [load])

  const setActive = async (p: Pkg, active: boolean) => {
    setBusy(true)
    try {
      await api.patch(`/packages/${p.id}`, { active })
      toast(active ? 'Đã kích hoạt lại gói' : 'Đã vô hiệu hóa gói')
      setConfirm(null)
      load()
    } catch (e) {
      setConfirm(null)
      toast(packageError(e), true)
    } finally {
      setBusy(false)
    }
  }

  const actions: BoxActions = {
    onAdd: (category) => setForm({ mode: 'new', category }),
    onEdit: (pkg) => setForm({ mode: 'edit', pkg }),
    onVersion: (pkg) => setForm({ mode: 'version', pkg }),
    onToggle: (p) => (p.active ? setConfirm(p) : setActive(p, true)),
  }

  return (
    <>
      <PageHeader title="Gói dịch vụ" />
      <div className="toolbar">
        <input className="input" type="search" placeholder="Tìm tên gói" aria-label="Tìm gói dịch vụ" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Hiện gói đã vô hiệu hóa</label>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && rows.length === 0 ? <div className="loading">Đang tải...</div> : (
        <PackageBoxes rows={rows} showInactive={showInactive} q={q} canEdit={can('packages.update')} canCreate={can('packages.create')} actions={actions} />
      )}
      {form && (
        <PackageModal
          target={form}
          allPkgs={rows}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            toast(form.mode === 'version' ? 'Đã tạo phiên bản mới' : 'Đã lưu gói dịch vụ')
            load()
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Vô hiệu hóa ${confirm.name}`}
          message="Gói sẽ không hiện khi bán mới. Các hợp đồng đã bán giữ nguyên."
          confirmLabel="Vô hiệu hóa"
          danger
          busy={busy}
          onConfirm={() => setActive(confirm, false)}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  )
}

interface FormState { name: string; category: PackageCategory; type: PackageType; duration_days: string; sessions: string; price: string; vat_percent: string; branch_id: string; bundle: string; deactivateOld: 'replace' | 'copy' }

export function PackageModal({ target, allPkgs, onClose, onSaved }: { target: FormTarget; allPkgs: Pkg[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const pkg = target.mode === 'new' ? null : target.pkg
  const [f, setF] = useState<FormState>({
    name: pkg?.name ?? '',
    category: target.mode === 'new' ? target.category : pkg?.category ?? 'member',
    type: pkg?.type ?? (target.mode === 'new' && target.category !== 'member' ? 'session' : 'month'),
    duration_days: String(pkg?.duration_days ?? 30),
    sessions: String(pkg?.sessions ?? 12),
    price: String(pkg?.price ?? ''),
    vat_percent: String(pkg?.vat_percent ?? 8),
    branch_id: pkg?.branch_id ?? branchId ?? (user?.branches.length === 1 ? user.branches[0].id : ''),
    bundle: pkg?.bundled_member_package?.id ?? '',
    deactivateOld: 'replace',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }))
  const pt = isPtCategory(f.category)
  const members = allPkgs.filter((p) => p.category === 'member' && p.active && p.branch_id === f.branch_id)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const next: PkgForm = {
      name: f.name.trim(), category: f.category, type: f.type,
      duration_days: f.type === 'session' ? (pt && f.duration_days ? Number(f.duration_days) : null) : Number(f.duration_days),
      sessions: f.type === 'session' ? Number(f.sessions) : null,
      price: Number(f.price), vat_percent: Number(f.vat_percent), bundled_member_package_id: f.bundle,
    }
    try {
      if (target.mode === 'edit') {
        await api.patch(`/packages/${target.pkg.id}`, changedFields(target.pkg, next))
      } else {
        const { bundled_member_package_id, ...rest } = next
        await api.post('/packages', {
          ...rest, branch_id: f.branch_id, active: true,
          ...(pt && bundled_member_package_id ? { bundled_member_package_id } : {}),
          ...(target.mode === 'version' && f.deactivateOld === 'replace' ? { replaces_id: target.pkg.id, deactivate_replaced: true } : {}),
        })
      }
      onSaved()
    } catch (err) {
      setError(packageError(err))
    } finally {
      setBusy(false)
    }
  }

  const title = target.mode === 'edit' ? 'Sửa gói dịch vụ' : target.mode === 'version' ? `Tạo phiên bản mới của ${target.pkg.name}` : 'Thêm gói dịch vụ'
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="package-form" disabled={busy}>{busy ? 'Đang lưu...' : target.mode === 'version' ? 'Tạo phiên bản' : 'Lưu'}</Button>
        </>
      }
    >
      <form id="package-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        {target.mode === 'version' && <p className="full hint-muted">Gói cũ và các hợp đồng đã bán giữ nguyên, không bị thay đổi. Hãy sửa tên gói nếu cần.</p>}
        <Field label="Tên gói" htmlFor="p-name" full>
          <Input id="p-name" required value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Loại gói" htmlFor="p-category" hint={hasHsd(f.category) ? PT_RULE_HINT : undefined}>
          <Select id="p-category" value={f.category} onChange={(e) => set('category', e.target.value as PackageCategory)}>
            {PACKAGE_CATEGORIES.map((c) => <option key={c} value={c}>{PACKAGE_CATEGORY[c]}</option>)}
          </Select>
        </Field>
        <Field label="Tính theo" htmlFor="p-type">
          <Select id="p-type" value={f.type} onChange={(e) => set('type', e.target.value as PackageType)}>
            <option value="day">Theo ngày</option>
            <option value="month">Theo tháng</option>
            <option value="session">Theo buổi</option>
          </Select>
        </Field>
        {f.type === 'session' ? (
          <>
            <Field label="Số buổi" htmlFor="p-sessions">
              <Input id="p-sessions" type="number" min={1} required value={f.sessions} onChange={(e) => set('sessions', e.target.value)} />
            </Field>
            {pt && (
              <Field label="Hết hạn sau (ngày)" htmlFor="p-days">
                <Input id="p-days" type="number" min={1} value={f.duration_days} onChange={(e) => set('duration_days', e.target.value)} />
              </Field>
            )}
          </>
        ) : (
          <Field label="Số ngày" htmlFor="p-days">
            <Input id="p-days" type="number" min={1} required value={f.duration_days} onChange={(e) => set('duration_days', e.target.value)} />
          </Field>
        )}
        <Field label="Giá (đ)" htmlFor="p-price">
          <Input id="p-price" type="number" min={0} required value={f.price} onChange={(e) => set('price', e.target.value)} />
        </Field>
        <Field label="VAT (%)" htmlFor="p-vat">
          <Input id="p-vat" type="number" min={0} max={100} required value={f.vat_percent} onChange={(e) => set('vat_percent', e.target.value)} />
        </Field>
        <Field label="Chi nhánh" htmlFor="p-branch">
          <Select id="p-branch" required disabled={target.mode === 'edit'} value={f.branch_id} onChange={(e) => setF((x) => ({ ...x, branch_id: e.target.value, bundle: '' }))}>
            <option value="" disabled>Chọn chi nhánh</option>
            {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        {pt && (
          <Field label="Gói member đi kèm" htmlFor="p-bundle" full hint="Khi bán gói PT, hệ thống tự gán gói member này cho khách (giá 0 đ, đã nằm trong giá gói PT)">
            <Select id="p-bundle" value={f.bundle} onChange={(e) => set('bundle', e.target.value)}>
              <option value="">Chưa gắn</option>
              {members.map((p) => <option key={p.id} value={p.id}>{bundleText(p)}</option>)}
            </Select>
          </Field>
        )}
        {target.mode === 'version' && (
          <fieldset className="full stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Cách tạo</legend>
            <label className="check"><input type="radio" name="p-mode" checked={f.deactivateOld === 'replace'} onChange={() => set('deactivateOld', 'replace')} />Thay thế gói cũ (vô hiệu hóa gói cũ)</label>
            <label className="check"><input type="radio" name="p-mode" checked={f.deactivateOld === 'copy'} onChange={() => set('deactivateOld', 'copy')} />Chỉ sao chép (giữ cả hai gói đang bán)</label>
          </fieldset>
        )}
      </form>
    </Modal>
  )
}
