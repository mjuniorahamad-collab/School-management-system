import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import {
  gradingBandFormToPayload,
  validateGradingBandForm,
  type GradingBandFormValue,
} from "@/lib/masterDataFormRules"
import { useCreateGradingBand, useGradingBands, useSetGradingBandActive, useUpdateGradingBand } from "@/hooks/useMasterData"
import { DataTable, type Column } from "./DataTable"
import { MasterDataToolbar } from "./MasterDataToolbar"
import { MasterDataFormDialog, type FieldConfig } from "./MasterDataFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useLifecycleToggle } from "./useLifecycleToggle"

interface EditingState {
  id: string
  minPercent: number
  maxPercent: number
  grade: string
  description?: string
  sortOrder: number
}

const COLUMNS: Column[] = [
  {
    key: "grade",
    header: "Grade",
    render: (item) => (
      <span className="inline-flex items-center justify-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
        {String(item.grade ?? "")}
      </span>
    ),
  },
  {
    key: "range",
    header: "Range",
    render: (item) => (
      <span className="text-muted-foreground tabular-nums">
        {String(item.minPercent ?? "")}% – {String(item.maxPercent ?? "")}%
      </span>
    ),
  },
  {
    key: "description",
    header: "Description",
    render: (item) => (
      <span className="text-muted-foreground">{String(item.description ?? "—")}</span>
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
  { key: "grade", label: "Grade", placeholder: "e.g. A", required: true },
  { key: "minPercent", label: "Minimum %", type: "number", min: 0, required: true },
  { key: "maxPercent", label: "Maximum %", type: "number", min: 0, required: true },
  { key: "description", label: "Description", placeholder: "e.g. Excellent" },
  { key: "sortOrder", label: "Sort order", type: "number", min: 0 },
]

export function GradingBandsPanel() {
  const { can } = useAuth()
  const [search, setSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EditingState | null>(null)

  const canEdit = can("results:update")
  const { data, isPending, isError, refetch } = useGradingBands({
    search: search || undefined,
    includeInactive,
  })

  const createMutation = useCreateGradingBand()
  const updateMutation = useUpdateGradingBand(editing?.id ?? "")
  const toggleMutation = useSetGradingBandActive()
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
      minPercent: Number(item.minPercent ?? 0),
      maxPercent: Number(item.maxPercent ?? 0),
      grade: String(item.grade ?? ""),
      description: item.description ? String(item.description) : undefined,
      sortOrder: Number(item.sortOrder ?? 0),
    })
    setDialogOpen(true)
  }

  const initial = editing
    ? {
        grade: editing.grade,
        minPercent: String(editing.minPercent),
        maxPercent: String(editing.maxPercent),
        description: editing.description ?? "",
        sortOrder: String(editing.sortOrder),
      }
    : { grade: "", minPercent: "", maxPercent: "", description: "", sortOrder: "" }

  const handleSubmit = (values: Record<string, string | boolean>) => {
    const form: GradingBandFormValue = {
      grade: String(values.grade),
      minPercent: String(values.minPercent),
      maxPercent: String(values.maxPercent),
      description: String(values.description),
      sortOrder: String(values.sortOrder),
    }
    const payload = gradingBandFormToPayload(form)
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
        createLabel="New Grading Band"
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
        emptyLabel="No grading bands found"
        errorText="Could not load grading bands."
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
        title="New grading band"
        description="Define a grade band used for result classification. Bands should not overlap."
        createLabel="Create band"
        editLabel="Edit band"
        fields={FIELDS}
        initial={initial}
        editingLabel={editing ? `Grade ${editing.grade}` : undefined}
        validate={(values) => {
          const errors = validateGradingBandForm({
            grade: String(values.grade),
            minPercent: String(values.minPercent),
            maxPercent: String(values.maxPercent),
            description: String(values.description),
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
