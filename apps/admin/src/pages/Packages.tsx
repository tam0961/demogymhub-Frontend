import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { PACKAGE_CATEGORIES, PACKAGE_CATEGORY, fmtDate, fmtMoney, isPtCategory, todayISO } from '../lib/format'
import { BOX_ORDER, bundleText, groupPackages, packageError, termText } from '../lib/packages'
import { PROMO_OPTIONS, promoAllowed, type PromoType } from '../lib/promo'
import { PT_RULE_HINT, hasHsd } from '../lib/pt'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { ConfirmDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'
import { Button, Chip, DataTable, Field, Input, MoneyInput, Panel, Select, useToast, type Column } from '../components/ui'
import type { ListResp, PackageCategory, PackageType, Pkg } from '../types'

export type FormTarget = { mode: 'new'; category: PackageCategory } | { mode: 'edit'; pkg: Pkg } | { mode: 'version'; pkg: Pkg }

export interface BoxActions {
  onAdd: (c: PackageCategory) => void
  onEdit: (p: Pkg) => void
  onDelete: (p: Pkg) => void
}

export function PackageBoxes({ rows, showInactive, q, canEdit, actions }: { rows: Pkg[]; showInactive: boolean; q: string; canEdit: boolean; canCreate: boolean; actions: BoxActions }) {
  const groups = useMemo(() => groupPackages(rows, showInactive, q), [rows, showInactive, q])
  const columnsFor = (cat: PackageCategory): Column<Pkg>[] => {
    const pt = isPtCategory(cat)
    const cols: Column<Pkg>[] = [
      {
        key: 'name', className: 'pk-name', header: 'Tên gói', sortValue: (p) => p.name,
        render: (p) => <><span className="cell-main">{p.name}</span>{p.replaces_id && <> <Chip>Phiên bản mới</Chip></>}{p.bundle_only && <> <Chip tone="warn">Tặng kèm</Chip></>}{p.promo_type && <> <Chip tone="ok">KM đến {fmtDate(p.promo_until)}</Chip></>}</>,
      },
      { key: 'price', className: 'pk-price', header: 'Giá', numeric: true, sortValue: (p) => p.price, render: (p) => <>{fmtMoney(p.price)}</> },
      {
        key: 'term', className: 'pk-term', header: pt ? 'Số buổi' : 'Thời hạn', sortValue: (p) => (p.type === 'session' ? p.sessions : p.duration_days),
        render: (p) => termText(p),
      },
    ]
    cols.push({ key: 'gift', className: 'pk-gift', header: 'Quà tặng', render: (p) => p.gift || '-' })
    if (pt) cols.push({ key: 'bundle', className: 'pk-bundle', header: 'Gói member đi kèm', render: (p) => (p.bundled_member_package ? bundleText(p.bundled_member_package) : <Chip tone="warn">Chưa gắn</Chip>) })
    cols.push(
      { key: 'active', className: 'pk-status', header: 'Trạng thái', sortValue: (p) => (p.active ? 0 : 1), render: (p) => (p.active ? <Chip tone="ok">Đang bán</Chip> : <Chip>Đã vô hiệu hóa</Chip>) },
      { key: 'count', className: 'pk-count', header: 'Số hợp đồng', numeric: true, sortValue: (p) => p.contracts_count ?? 0, render: (p) => p.contracts_count ?? 0 },
    )
    if (canEdit) {
      cols.push({
        key: 'act', header: '', className: 'actions',
        render: (p) => (
          <>
            <Button small onClick={() => actions.onEdit(p)}>Sửa</Button>
            <Button small variant="danger" onClick={() => actions.onDelete(p)}>Xóa</Button>
          </>
        ),
      })
    }
    return cols
  }
  return (
    <div className="stack pkg-boxes">
      {BOX_ORDER.map((cat) => (
        <Panel key={cat} title={<>{PACKAGE_CATEGORY[cat]}<span className="panel-count">{groups[cat].length} gói</span></>} flush>
          {hasHsd(cat) && <div className="panel-note">{PT_RULE_HINT}</div>}
          {cat !== 'member' && <div className="panel-note">Gói PT đi kèm một gói member: khi bán gói PT, hệ thống tự gán gói member đó cho khách.</div>}
          <DataTable
            columns={columnsFor(cat)}
            rows={groups[cat]}
            rowKey={(p) => p.id}
            rowClassName={(p) => (p.active ? '' : 'row-muted')}
            hidePager
            pageSize={500}
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
  const [delTarget, setDelTarget] = useState<Pkg | null>(null)
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

  const doDelete = async (p: Pkg) => {
    setBusy(true)
    try {
      await api.delete(`/packages/${p.id}`)
      toast('Đã xóa gói')
      setDelTarget(null)
      load()
    } catch (e) {
      setDelTarget(null)
      toast(packageError(e), true)
    } finally {
      setBusy(false)
    }
  }

  const actions: BoxActions = {
    onAdd: (category) => setForm({ mode: 'new', category }),
    onEdit: (pkg) => setForm({ mode: 'edit', pkg }),
    onDelete: (p) => setDelTarget(p),
  }

  return (
    <>
      <div className="page-head members-head">
        <h1>Gói dịch vụ</h1>
        <div className="members-filters">
          <input className="input" type="search" placeholder="Tìm tên gói" aria-label="Tìm gói dịch vụ" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Hiện gói đã vô hiệu hóa</label>
        </div>
        <div className="page-action">
          {can('packages.create') && <Button variant="primary" onClick={() => actions.onAdd('member')}>Thêm gói</Button>}
        </div>
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
          onSaved={(kind) => {
            setForm(null)
            toast(kind === 'update' ? 'Đã cập nhật gói' : form.mode === 'edit' ? 'Đã lưu thành gói mới, gói cũ đã được vô hiệu hóa' : 'Đã lưu gói dịch vụ')
            load()
          }}
        />
      )}
      {delTarget && (
        <ConfirmDialog
          title={`Xóa ${delTarget.name}`}
          message="Gói sẽ bị xóa hẳn. Chỉ xóa được gói chưa có hợp đồng và không được gói PT nào gắn kèm."
          confirmLabel="Xóa gói"
          danger
          busy={busy}
          onConfirm={() => doDelete(delTarget)}
          onClose={() => setDelTarget(null)}
        />
      )}
    </>
  )
}

interface FormState { name: string; category: PackageCategory; months: string; sessions: string; price: string; branch_id: string; bundle: string; bundleOnly: boolean; groupBox: boolean; gift: string; checkinBefore: string; promoType: '' | PromoType; promoValue: string; promoUntil: string }

export function PackageModal({ target, allPkgs, onClose, onSaved }: { target: FormTarget; allPkgs: Pkg[]; onClose: () => void; onSaved: (kind?: 'new' | 'update') => void }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const pkg = target.mode === 'new' ? null : target.pkg
  const replacing = target.mode !== 'new'
  const [f, setF] = useState<FormState>({
    name: pkg?.name ?? '',
    category: target.mode === 'new' ? target.category : pkg?.category ?? 'member',
    months: String(pkg?.duration_days ? Math.round((pkg.duration_days / 30) * 10) / 10 : 1),
    sessions: String(pkg?.sessions ?? 12),
    price: String(pkg?.price ?? ''),
    branch_id: pkg?.branch_id ?? branchId ?? user?.branches.find((b) => b.code.toUpperCase() === 'Q7')?.id ?? (user?.branches.length === 1 ? user.branches[0].id : ''),
    bundle: pkg?.bundled_member_package?.id ?? '',
    bundleOnly: pkg?.bundle_only ?? false,
    groupBox: pkg?.display_group === 'pt_group',
    gift: pkg?.gift ?? '',
    checkinBefore: pkg?.checkin_before ?? '',
    promoType: pkg?.promo_type ?? '',
    promoValue: String(pkg?.promo_value ?? ''),
    promoUntil: pkg?.promo_until ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }))
  const pt = isPtCategory(f.category)
  const type: PackageType = f.category === 'member' ? (pkg?.type === 'day' ? 'day' : 'month') : 'session'
  const days = Math.max(1, Math.round((Number(f.months) || 0) * 30))
  const members = allPkgs.filter((p) => p.category === 'member' && p.active && p.branch_id === f.branch_id)
  const promoNum = Number(f.promoValue.replace(/\D/g, '')) || 0
  const promoOpt = PROMO_OPTIONS.find((o) => o.value === f.promoType)

  const validate = () => {
    if (f.promoType) {
      if (promoNum < 1) return 'Hãy nhập giá trị khuyến mãi'
      if (f.promoType === 'percent' && promoNum > 100) return 'Khuyến mãi phần trăm tối đa 100%'
      if (!f.promoUntil) return 'Hãy chọn ngày kết thúc khuyến mãi'
    }
    return ''
  }

  const saveInPlace = async () => {
    if (!pkg) return
    setBusy(true)
    setError('')
    try {
      await api.patch(`/packages/${pkg.id}`, {
        name: f.name.trim(), category: f.category, type,
        duration_days: type === 'session' ? (pt && Number(f.months) > 0 ? days : null) : days,
        sessions: type === 'session' ? Number(f.sessions) : null,
        price: Number(f.price), vat_percent: 0, gift: f.gift.trim() || null,
        promo_type: f.promoType || null, promo_value: f.promoType ? promoNum : null, promo_until: f.promoType ? f.promoUntil : null,
        bundled_member_package_id: pt && f.bundle ? f.bundle : null,
        ...(f.category === 'member' ? { bundle_only: f.bundleOnly, display_group: f.groupBox ? 'pt_group' : null, checkin_before: f.checkinBefore || null } : {}),
      })
      onSaved('update')
    } catch (err) {
      setAsking(false)
      setError(packageError(err))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post('/packages', {
        name: f.name.trim(), category: f.category, type,
        duration_days: type === 'session' ? (pt && Number(f.months) > 0 ? days : null) : days,
        sessions: type === 'session' ? Number(f.sessions) : null,
        price: Number(f.price), vat_percent: 0, branch_id: f.branch_id, active: true, gift: f.gift.trim() || null,
        promo_type: f.promoType || null, promo_value: f.promoType ? promoNum : null, promo_until: f.promoType ? f.promoUntil : null,
        ...(pt && f.bundle ? { bundled_member_package_id: f.bundle } : {}),
        ...(f.category === 'member' ? { bundle_only: f.bundleOnly, display_group: f.groupBox ? 'pt_group' : null, checkin_before: f.checkinBefore || null } : {}),
        ...(replacing && pkg ? { replaces_id: pkg.id, deactivate_replaced: true } : {}),
      })
      onSaved('new')
    } catch (err) {
      setAsking(false)
      setError(packageError(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = validate()
    if (v) { setError(v); return }
    setError('')
    if (replacing) setAsking(true)
    else save()
  }

  return (
    <>
    <Modal
      title={replacing ? 'Sửa gói dịch vụ' : 'Thêm gói dịch vụ'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="package-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
        </>
      }
    >
      <form id="package-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <Field label="Tên gói" htmlFor="p-name" full>
          <Input id="p-name" required value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Loại gói" htmlFor="p-category" hint={hasHsd(f.category) ? PT_RULE_HINT : undefined}>
          <Select id="p-category" value={f.category} onChange={(e) => set('category', e.target.value as PackageCategory)}>
            {PACKAGE_CATEGORIES.map((c) => <option key={c} value={c}>{PACKAGE_CATEGORY[c]}</option>)}
          </Select>
        </Field>
        {type === 'session' ? (
          <Field label="Số buổi" htmlFor="p-sessions">
            <Input id="p-sessions" type="number" min={1} required value={f.sessions} onChange={(e) => set('sessions', e.target.value)} />
          </Field>
        ) : (
          <Field label="Số tháng" htmlFor="p-months">
            <Input id="p-months" type="number" min={0.5} step={0.5} required value={f.months} onChange={(e) => set('months', e.target.value)} />
          </Field>
        )}
        {pt && (
          <Field label="Hết hạn sau (tháng)" htmlFor="p-months">
            <Input id="p-months" type="number" min={0.5} step={0.5} value={f.months} onChange={(e) => set('months', e.target.value)} />
          </Field>
        )}
        <Field label="Giá (đ)" htmlFor="p-price">
          <MoneyInput id="p-price" required value={f.price} onValueChange={(v) => set('price', v)} />
        </Field>
        {f.category === 'member' && (
          <Field label="Check-in trước giờ" htmlFor="p-before" hint="Để trống nếu không giới hạn. Gói Eco: 14:00">
            <Input id="p-before" type="time" value={f.checkinBefore} onChange={(e) => set('checkinBefore', e.target.value)} />
          </Field>
        )}
        <div className="full pk-row3">
          <Field label="Khuyến mãi" htmlFor="p-promo">
            <Select id="p-promo" value={f.promoType} onChange={(e) => { set('promoType', e.target.value as '' | PromoType); set('promoValue', '') }}>
              {PROMO_OPTIONS.map((o) => <option key={o.value} value={o.value} disabled={!promoAllowed(o.value, type)}>{o.label}</option>)}
            </Select>
          </Field>
          {f.promoType ? (
            <>
              <Field label={promoOpt?.valueLabel ?? 'Giá trị'} htmlFor="p-promo-val">
                {f.promoType === 'amount'
                  ? <MoneyInput id="p-promo-val" placeholder="0 ₫" value={f.promoValue} onValueChange={(v) => set('promoValue', v)} />
                  : <Input id="p-promo-val" inputMode="numeric" placeholder="0" value={f.promoValue} onChange={(e) => set('promoValue', e.target.value)} />}
              </Field>
              <Field label="Đến ngày" htmlFor="p-promo-until">
                <Input id="p-promo-until" type="date" min={todayISO()} value={f.promoUntil} onChange={(e) => set('promoUntil', e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        <div className="full pk-row3">
          <Field label="Quà tặng" htmlFor="p-gift">
            <Input id="p-gift" maxLength={200} value={f.gift} onChange={(e) => set('gift', e.target.value)} />
          </Field>
        </div>
        {f.category === 'member' && (
          <>
            <label className="check full"><input type="checkbox" checked={f.bundleOnly} onChange={(e) => set('bundleOnly', e.target.checked)} />Chỉ tặng kèm gói PT (không bán riêng cho khách)</label>
            <label className="check full"><input type="checkbox" checked={f.groupBox} onChange={(e) => set('groupBox', e.target.checked)} />Xếp vào box PT nhóm (tính doanh số riêng PT nhóm, vẫn check-in như member)</label>
          </>
        )}
        {pt && (
          <Field label="Gói member đi kèm" htmlFor="p-bundle" full hint="Khi bán gói PT, hệ thống tự gán gói member này cho khách (giá 0 đ, đã nằm trong giá gói PT)">
            <Select id="p-bundle" value={f.bundle} onChange={(e) => set('bundle', e.target.value)}>
              <option value="">Chưa gắn</option>
              {members.map((p) => <option key={p.id} value={p.id}>{bundleText(p)}</option>)}
            </Select>
          </Field>
        )}
      </form>
    </Modal>
    {asking && (
      <Modal
        title="Lưu thành gói mới?"
        onClose={() => setAsking(false)}
        footer={
          <>
            <Button onClick={() => setAsking(false)} disabled={busy}>Hủy</Button>
            <Button onClick={saveInPlace} disabled={busy || !!pkg?.in_use} title={pkg?.in_use ? 'Gói đã có hợp đồng nên không cập nhật trực tiếp được' : undefined}>Cập nhật vào gói hiện tại</Button>
            <Button variant="primary" onClick={save} disabled={busy}>Xác nhận</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>Bạn muốn lưu thành gói mới và vô hiệu hóa gói cũ không? Các hợp đồng đã bán vẫn giữ nguyên gói cũ.</p>
        <p className="hint-muted" style={{ marginTop: 8 }}>{pkg?.in_use ? 'Gói này đã có hợp đồng nên chỉ lưu được thành gói mới.' : 'Hoặc chọn "Cập nhật vào gói hiện tại" để sửa trực tiếp, không tạo gói mới.'}</p>
      </Modal>
    )}
    </>
  )
}
