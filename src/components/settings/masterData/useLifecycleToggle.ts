import { useState } from "react"

interface DialogConfig {
  title: string
  description: string
  confirmLabel: string
  pendingLabel: string
}

export interface LifecycleToggleVars {
  id: string
  isActive: boolean
}

type ToggleMutate = (
  vars: LifecycleToggleVars,
  options?: {
    onSuccess?: () => void
    onError?: (error: Error) => void
  },
) => void

interface ToggleTarget {
  id: string
  name: string
  nextActive: boolean
}

/**
 * Shared confirm-and-toggle state for the master-data lifecycle actions.
 *
 * Deactivation and reactivation are destructive-adjacent operations (a
 * deactivated row disappears from pickers), so both go through an explicit
 * confirmation dialog rather than firing from the icon click alone. The pending
 * label is action-appropriate ("Deactivating…"/"Reactivating…") instead of the
 * dialog's delete-oriented default.
 *
 * The dialog stays open while the request is in flight so the pending label is
 * actually visible, and it only closes once the mutation succeeded. A second
 * confirm click is ignored while the request is pending.
 */
export function useLifecycleToggle({ toggleActive }: { toggleActive: ToggleMutate }) {
  const [target, setTarget] = useState<ToggleTarget | null>(null)
  const [isPending, setIsPending] = useState(false)

  const openToggle = (item: Record<string, unknown>, nextActive: boolean) => {
    const name = item.name ?? item.grade ?? ""
    setTarget({
      id: String(item.id),
      name: String(name),
      nextActive,
    })
  }

  const isActive = target?.nextActive === false
  const label = isActive ? "Deactivate" : "Reactivate"
  const pendingLabel = isActive ? "Deactivating…" : "Reactivating…"
  const noun = target ? target.name : ""
  const dialogProps: DialogConfig & { onConfirm: () => void } = {
    title: target ? `${label} ${noun}?` : "",
    description:
      label === "Deactivate"
        ? `${noun} will be kept for historical records but can no longer be selected for new entries.`
        : `${noun} will become selectable again for new entries.`,
    confirmLabel: label,
    pendingLabel,
    onConfirm: () => {
      if (!target || isPending) return
      setIsPending(true)
      toggleActive(
        { id: target.id, isActive: target.nextActive },
        {
          onSuccess: () => {
            setIsPending(false)
            setTarget(null)
          },
          onError: () => {
            setIsPending(false)
          },
        },
      )
    },
  }

  return {
    target,
    dialogProps,
    close: () => {
      if (isPending) return
      setTarget(null)
    },
    openToggle,
    isPending,
    open: target !== null,
  }
}
