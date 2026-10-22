import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import {
  examTypeFormToPayload,
  validateExamTypeForm,
  type ExamTypeFormValue,
} from "@/lib/masterDataFormRules"
import { useCreateExamType, useExamTypes, useSetExamTypeActive, useUpdateExamType } from "@/hooks/useMasterData"
import { DataTable, type Column } from "./DataTable"
import { MasterDataToolbar } from "./MasterDataToolbar"
import { MasterDataFormDialog, type FieldConfig } from "./MasterDataFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useLifecycleToggle } from "./useLifecycleToggle"

interface EditingState {
  id: string
  code: string
  name: string
  sortOrder: number
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
    key: "sortOrder",
    header: "Sort order",
    render: (item) => <span className="text-muted-foreground">{String(item.sortOrder ?? 0)}</span>,
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
  { key: "name", label: "Exam type name", placeholder: "e.g. Midterm", required: true },
  { key: "code", label: "Code", placeholder: "e.g. MID", required: true },
  { key: "sortOrder", label: "Sort order", type: "number", min: 0 },
]

export function ExamTypesPanel() {
  const { can } = useAuth()
  const [search, setSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EditingState | null>(null)

  const canEdit = can("exams:update")
  const { data, isPending, isError, refetch } = useExamTypes({
    search: search || undefined,
    includeInactive,
  })

  const createMutation = useCreateExamType()
  const updateMutation = useUpdateExamType(editing?.id ?? "")
  const toggleMutation = useSetExamTypeActive()
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
      sortOrder: Number(item.sortOrder ?? 0),
    })
    setDialogOpen(true)
  }

  const initial = editing
    ? { name: editing.name, code: editing.code, sortOrder: String(editing.sortOrder) }
    : { name: "", code: "", sortOrder: "" }

  const handleSubmit = (values: Record<string, string | boolean>) => {
    const form: ExamTypeFormValue = {
      name: String(values.name),
      code: String(values.code),
      sortOrder: String(values.sortOrder),
    }
    const payload = examTypeFormToPayload(form)
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
        createLabel="New Exam Type"
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
        emptyLabel="No exam types found"
        errorText="Could not load exam types."
        onRetry={() => void refetch()}
        onEdit={openEdit}
        onToggleActive={(item, nextActive) => lifecycle.openToggle(item, nextActive)}
        isTogglingActive={(item) =>
          toggleMutation.isPending && toggleMutation.variables?.id === String(item.id)
        }
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
      <MasterDataFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New exam type"
        description="Define an exam type used across assessment cycles."
        createLabel="Create exam type"
        editLabel="Edit exam type"
        fields={FIELDS}
        initial={initial}
        editingLabel={editing?.name}
        validate={(values) => {
          const errors = validateExamTypeForm({
            name: String(values.name),
            code: String(values.code),
            sortOrder: String(values.sortOrder),
          })
          return errors[0]?.message ?? null
        }}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  )
}
