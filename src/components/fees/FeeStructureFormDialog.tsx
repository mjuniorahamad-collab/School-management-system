import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { FeeClassSelect } from "@/components/shared/FeeClassSelect"
import { FeeSessionSelect } from "@/components/shared/FeeSessionSelect"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFeeStructure, useCreateFeeStructure, useUpdateFeeStructure } from "@/hooks/useFeeStructures"
import { useFeeHeads } from "@/hooks/useMasterData"
import { formatINR } from "@/lib/format"
import type { FeeStructureFormPayload, FeeStructureListItem } from "@/types/fees"

interface ItemRow {
  feeHeadId: string
  amount: string
}

interface InitialValues {
  name: string
  sessionId: string
  classId: string
  isActive: boolean
  items: ItemRow[]
}

interface FeeStructureFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: FeeStructureListItem | null
}

export function FeeStructureFormDialog({ open, onOpenChange, editing }: FeeStructureFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <FeeStructureFormContent
          key={editing?.id ?? "new"}
          editing={editing}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  )
}

function FeeStructureFormContent({
  editing,
  onOpenChange,
}: {
  editing: FeeStructureListItem | null
  onOpenChange: (open: boolean) => void
}) {
  const detail = useFeeStructure(editing?.id ?? null)

  if (!editing) {
    return <FeeStructureForm editingId={null} initial={{ name: "", sessionId: "", classId: "", isActive: true, items: [] }} onOpenChange={onOpenChange} />
  }

  if (detail.isPending) {
    return (
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit fee structure</DialogTitle>
        </DialogHeader>
        <p className="py-8 text-center text-sm text-muted-foreground">Loading structure…</p>
      </DialogContent>
    )
  }

  if (detail.isError || !detail.data) {
    return (
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit fee structure</DialogTitle>
          <DialogDescription>Could not load this structure to edit it.</DialogDescription>
        </DialogHeader>
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    )
  }

  return (
    <FeeStructureForm
      editingId={editing.id}
      initial={{
        name: detail.data.name,
        sessionId: detail.data.session.id,
        classId: detail.data.class.id,
        isActive: detail.data.isActive,
        items: detail.data.items.map((item) => ({
          feeHeadId: item.feeHead.id,
          amount: String(item.amount),
        })),
      }}
      onOpenChange={onOpenChange}
    />
  )
}

function FeeStructureForm({
  editingId,
  initial,
  onOpenChange,
}: {
  editingId: string | null
  initial: InitialValues
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(initial.name)
  const [sessionId, setSessionId] = useState(initial.sessionId)
  const [classId, setClassId] = useState(initial.classId)
  const [isActive, setIsActive] = useState(initial.isActive)
  const [items, setItems] = useState<ItemRow[]>(initial.items)

  const feeHeads = useFeeHeads({})
  const createMutation = useCreateFeeStructure()
  const updateMutation = useUpdateFeeStructure(editingId)

  const isSaving = createMutation.isPending || updateMutation.isPending
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  const setRow = (index: number, patch: Partial<ItemRow>) => {
    setItems((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeRow = (index: number) => {
    setItems((previous) => previous.filter((_, i) => i !== index))
  }

  const addRow = () => {
    setItems((previous) => [...previous, { feeHeadId: "", amount: "" }])
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !sessionId || !classId) {
      toast.error("Please choose a name, academic session and class")
      return
    }
    const rows = items.filter((row) => row.feeHeadId && Number(row.amount) > 0)
    if (rows.length === 0) {
      toast.error("Add at least one fee item with an amount")
      return
    }
    const payload: FeeStructureFormPayload = {
      name: name.trim(),
      sessionId,
      classId,
      isActive,
      items: rows.map((row, index) => ({
        feeHeadId: row.feeHeadId,
        amount: Number(row.amount),
        sortOrder: index,
      })),
    }
    if (editingId) {
      updateMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    }
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{editingId ? "Edit fee structure" : "New fee structure"}</DialogTitle>
        <DialogDescription>
          One structure per class and academic session. It defines the fee components billed to
          each enrolled student.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structure-name">Structure name</Label>
          <Input
            id="structure-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Annual Tuition 2026"
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structure-session">Academic session</Label>
            <FeeSessionSelect
              value={sessionId}
              onValueChange={(value) => setSessionId(value ?? "")}
              placeholder="Select session"
              includeAll={false}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structure-class">Class</Label>
            <FeeClassSelect
              value={classId}
              onValueChange={(value) => setClassId(value ?? "")}
              placeholder="Select class"
              includeAll={false}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Active</p>
            <p className="text-xs text-muted-foreground">
              Invoices can only be generated from active structures.
            </p>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Active" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Fee items</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addRow} className="h-7">
              <Plus className="size-4" aria-hidden="true" />
              Add item
            </Button>
          </div>
          {items.map((row, index) => {
            const head = feeHeads.data?.items.find((feeHead) => feeHead.id === row.feeHeadId)
            return (
              <div key={index} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <Select
                  value={row.feeHeadId || undefined}
                  onValueChange={(value) => setRow(index, { feeHeadId: value })}
                >
                  <SelectTrigger className="w-full" aria-label="Fee head">
                    <SelectValue placeholder="Fee head" />
                  </SelectTrigger>
                  <SelectContent>
                    {(feeHeads.data?.items ?? []).map((feeHead) => (
                      <SelectItem key={feeHead.id} value={feeHead.id}>
                        {feeHead.name} ({feeHead.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(event) => setRow(index, { amount: event.target.value })}
                  placeholder="Amount"
                  aria-label={`Amount for ${head?.name ?? `item ${index + 1}`}`}
                  className="w-32"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove ${head?.name ?? `item ${index + 1}`}`}
                  disabled={items.length === 1}
                  className="size-8 text-muted-foreground"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            )
          })}
          {items.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No fee items yet — add the fee components.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
          <p className="text-sm text-muted-foreground">Total per student</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">{formatINR(total)}</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {editingId ? "Save changes" : "Create structure"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}