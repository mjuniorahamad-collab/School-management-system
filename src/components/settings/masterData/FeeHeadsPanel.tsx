import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import {
  feeHeadFormToPayload,
  validateFeeHeadForm,
  type FeeHeadFormValue,
} from "@/lib/masterDataFormRules"
import { useCreateFeeHead, useFeeHeads, useSetFeeHeadActive, useUpdateFeeHead } from "@/hooks/useMasterData"
import { DataTable, type Column } from "./DataTable"
import { MasterDataToolbar } from "./MasterDataToolbar"
import { MasterDataFormDialog, type FieldConfig } from "./MasterDataFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useLifecycleToggle } from "./useLifecycleToggle"

interface EditingState {
  id: string
  code: string
  name: string
  isRecurring: boolean
}

const COLUMNS: Column[] = [
  {
    key: "name",
    header: "Name",
    render: (item) => (
      <span className="font-medium text-foreground">{String(item.name ?? "")}</span>
    ),
  },
  {
    key: "code",
    header: "Code",
    render: (item) => (
      <span className="font-mono text-xs text-muted-foreground">{String(item.code ?? "")}</span>
    ),
  },
  {
    key: "recurring",
    header: "Recurring",
    render: (item) => (
      <span className="text-muted-foreground">{item.isRecurring ? "Yes" : "No"}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (item) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          item.isActive !== false
            ? "bg-emerald-50 text-emerald-700"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {item.isActive !== false ? "Active" : "Inactive"}
      </span>
    ),
  },
]

const FIELDS: FieldConfig[] = [
  { key: "name", label: "Name", placeholder: "e.g. Tuition", required: true },
  { key: "code", label: "Code", placeholder: "e.g. TU", required: true },
  { key: "isRecurring", label: "Recurring fee", type: "switch" },
]

export function FeeHeadsPanel() {
  const { can } = useAuth()
  const [search, setSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EditingState | null>(null)

  const canEdit = can("fees:update")
  const { data, isPending, isError, refetch } = useFeeHeads({
    search: search || undefined,
    includeInactive,
  })

  const createMutation = useCreateFeeHead()
  const updateMutation = useUpdateFeeHead(editing?.id ?? "")
  const toggleMutation = useSetFeeHeadActive()
  const lifecycle = useLifecycleToggle({
    toggleActive: toggleMutation.mutate,
  })

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (item: Record<string, unknown>) => {
    setEditing({
      id: String(item.id),
      code: String(item.code ?? ""),
      name: String(item.name ?? ""),
      isRecurring: Boolean(item.isRecurring),
    })
    setDialogOpen(true)
  }

  const initial = editing
    ? { name: editing.name, code: editing.code, isRecurring: editing.isRecurring }
    : { name: "", code: "", isRecurring: false }

  const handleSubmit = (values: Record<string, string | boolean>) => {
    const form: FeeHeadFormValue = {
      name: String(values.name),
      code: String(values.code),
      isRecurring: Boolean(values.isRecurring),
    }
    const payload = feeHeadFormToPayload(form)
    if (editing) {
      updateMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) })
    } else {
      createMutation.mutate(payload, { onSuccess: () => setDialogOpen(false) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <MasterDataToolbar
        search={search}
        canEdit={canEdit}
        createLabel="New Fee Head"
        includeInactive={includeInactive}
        onSearchChange={setSearch}
        onCreateClick={openCreate}
        onIncludeInactiveChange={setIncludeInactive}
      />
      <DataTable
        columns={COLUMNS}
        items={(data?.items ?? []) as unknown as Array<Record<string, unknown>>}
        isPending={isPending}
        isError={isError}
        canEdit={canEdit}
        emptyLabel="No fee heads found"
        errorText="Could not load fee heads."
        onRetry={() => void refetch()}
        onEdit={openEdit}
        onToggleActive={(item, nextActive) => lifecycle.openToggle(item, nextActive)}
        isTogglingActive={(item) =>
          toggleMutation.isPending && toggleMutation.variables?.id === String(item.id)
        }
      />
      <MasterDataFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New fee head"
        description="Add a fee head to the master catalog. Codes must be unique within the school."
        createLabel="Create fee head"
        editLabel="Edit fee head"
        fields={FIELDS}
        initial={initial}
        editingLabel={editing?.name}
        validate={(values) => {
          const errors = validateFeeHeadForm({
            name: String(values.name),
            code: String(values.code),
            isRecurring: Boolean(values.isRecurring),
          })
          return errors[0]?.message ?? null
        }}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
      <ConfirmDialog
        open={lifecycle.open}
        onOpenChange={(open) => {
          if (!open) lifecycle.close()
        }}
        title={lifecycle.dialogProps.title}
        description={lifecycle.dialogProps.description}
        confirmLabel={lifecycle.dialogProps.confirmLabel}
        pendingLabel={lifecycle.dialogProps.pendingLabel}
        isPending={lifecycle.isPending || toggleMutation.isPending}
        onConfirm={lifecycle.dialogProps.onConfirm}
      />
    </div>
  )
}
