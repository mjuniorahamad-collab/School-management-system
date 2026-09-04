import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import {
  periodSlotFormToPayload,
  validatePeriodSlotForm,
  type PeriodSlotFormValue,
} from "@/lib/masterDataFormRules"
import { useCreatePeriodSlot, usePeriodSlots, useUpdatePeriodSlot } from "@/hooks/useMasterData"
import { DataTable, type Column } from "./DataTable"
import { MasterDataToolbar } from "./MasterDataToolbar"
import { MasterDataFormDialog, type FieldConfig } from "./MasterDataFormDialog"

interface EditingState {
  id: string
  name: string
  startTime: string
  endTime: string
  sortOrder: number
}

const COLUMNS: Column[] = [
  {
    key: "name",
    header: "Period",
    render: (item) => (
      <span className="font-medium text-foreground">{String(item.name ?? "")}</span>
    ),
  },
  {
    key: "times",
    header: "Times",
    render: (item) => (
      <span className="text-muted-foreground tabular-nums">
        {String(item.startTime ?? "")} – {String(item.endTime ?? "")}
      </span>
    ),
  },
  {
    key: "sortOrder",
    header: "Order",
    render: (item) => (
      <span className="text-muted-foreground tabular-nums">{String(item.sortOrder ?? "")}</span>
    ),
  },
]

const FIELDS: FieldConfig[] = [
  { key: "name", label: "Period name", placeholder: "e.g. Period 1", required: true },
  { key: "startTime", label: "Start (HH:MM)", placeholder: "08:00", required: true },
  { key: "endTime", label: "End (HH:MM)", placeholder: "08:45", required: true },
  { key: "sortOrder", label: "Sort order", type: "number", min: 0 },
]

export function PeriodSlotsPanel() {
  const { can } = useAuth()
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EditingState | null>(null)

  const canEdit = can("timetable:update")
  const { data, isPending, isError, refetch } = usePeriodSlots({ search: search || undefined })

  const createMutation = useCreatePeriodSlot()
  const updateMutation = useUpdatePeriodSlot(editing?.id ?? "")

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (item: Record<string, unknown>) => {
    setEditing({
      id: String(item.id),
      name: String(item.name ?? ""),
      startTime: String(item.startTime ?? ""),
      endTime: String(item.endTime ?? ""),
      sortOrder: Number(item.sortOrder ?? 0),
    })
    setDialogOpen(true)
  }

  const initial = editing
    ? {
        name: editing.name,
        startTime: editing.startTime,
        endTime: editing.endTime,
        sortOrder: String(editing.sortOrder),
      }
    : { name: "", startTime: "", endTime: "", sortOrder: "" }

  const handleSubmit = (values: Record<string, string | boolean>) => {
    const form: PeriodSlotFormValue = {
      name: String(values.name),
      startTime: String(values.startTime),
      endTime: String(values.endTime),
      sortOrder: String(values.sortOrder),
    }
    const payload = periodSlotFormToPayload(form)
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
        createLabel="New Period Slot"
        onSearchChange={setSearch}
        onCreateClick={openCreate}
      />
      <DataTable
        columns={COLUMNS}
        items={(data?.items ?? []) as unknown as Array<Record<string, unknown>>}
        isPending={isPending}
        isError={isError}
        canEdit={canEdit}
        emptyLabel="No period slots found"
        errorText="Could not load period slots."
        onRetry={() => void refetch()}
        onEdit={openEdit}
      />
      <MasterDataFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New period slot"
        description="Define a period slot for the school timetable."
        createLabel="Create period slot"
        editLabel="Edit period slot"
        fields={FIELDS}
        initial={initial}
        editingLabel={editing?.name}
        validate={(values) => {
          const errors = validatePeriodSlotForm({
            name: String(values.name),
            startTime: String(values.startTime),
            endTime: String(values.endTime),
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
