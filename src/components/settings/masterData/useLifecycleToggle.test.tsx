// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useLifecycleToggle } from "@/components/settings/masterData/useLifecycleToggle"

// DOM test for the shared master-data lifecycle confirmation.
//
// Deactivate / Reactivate are destructive-adjacent actions (the row disappears
// from every picker), so they are confirmed. The rules this test pins down:
//   - the dialog stays OPEN while the request is in flight, so the
//     action-specific pending label is actually visible;
//   - a second confirm click while pending is ignored (no duplicate write);
//   - the dialog closes only after a successful write;
//   - a failed write keeps the dialog open so the user can retry.

afterEach(() => {
  cleanup()
})

type ToggleVars = { id: string; isActive: boolean }
type ToggleOptions = { onSuccess?: () => void; onError?: (error: Error) => void }

function Harness({ mutate }: { mutate: (vars: ToggleVars, options?: ToggleOptions) => void }) {
  const lifecycle = useLifecycleToggle({ toggleActive: mutate })
  return (
    <>
      <button
        type="button"
        onClick={() => lifecycle.openToggle({ id: "row-1", name: "Tuition" }, false)}
      >
        open-deactivate
      </button>
      <button
        type="button"
        onClick={() => lifecycle.openToggle({ id: "row-1", name: "Tuition" }, true)}
      >
        open-reactivate
      </button>
      <ConfirmDialog
        open={lifecycle.open}
        onOpenChange={(open) => {
          if (!open) lifecycle.close()
        }}
        title={lifecycle.dialogProps.title}
        description={lifecycle.dialogProps.description}
        confirmLabel={lifecycle.dialogProps.confirmLabel}
        pendingLabel={lifecycle.dialogProps.pendingLabel}
        isPending={lifecycle.isPending}
        onConfirm={lifecycle.dialogProps.onConfirm}
      />
    </>
  )
}

function setup() {
  const mutate = vi.fn()
  render(<Harness mutate={mutate} />)
  return { mutate }
}

describe("useLifecycleToggle", () => {
  it("asks for confirmation before toggling", () => {
    const { mutate } = setup()
    act(() => {
      screen.getByRole("button", { name: "open-deactivate" }).click()
    })

    expect(screen.getByText("Deactivate Tuition?")).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })

  it("uses action-specific labels for deactivate", () => {
    const { mutate } = setup()
    act(() => {
      screen.getByRole("button", { name: "open-deactivate" }).click()
    })

    expect(screen.getByRole("button", { name: "Deactivate" })).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })

  it("uses action-specific labels for reactivate", () => {
    const { mutate } = setup()
    act(() => {
      screen.getByRole("button", { name: "open-reactivate" }).click()
    })

    expect(screen.getByText("Reactivate Tuition?")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })

  it("keeps the dialog open with a pending label while the request is in flight", () => {
    const { mutate } = setup()
    act(() => {
      screen.getByRole("button", { name: "open-deactivate" }).click()
    })
    act(() => {
      screen.getByRole("button", { name: "Deactivate" }).click()
    })

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0]).toEqual({ id: "row-1", isActive: false })
    // The dialog is still open and shows the action-specific pending label.
    expect(screen.getByText("Deactivating…")).toBeTruthy()
  })

  it("ignores a second confirm click while the request is pending", () => {
    const { mutate } = setup()
    act(() => {
      screen.getByRole("button", { name: "open-deactivate" }).click()
    })
    act(() => {
      screen.getByRole("button", { name: "Deactivate" }).click()
    })
    act(() => {
      screen.getByText("Deactivating…").click()
    })

    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it("closes the dialog after a successful write", () => {
    const { mutate } = setup()
    act(() => {
      screen.getByRole("button", { name: "open-deactivate" }).click()
    })
    act(() => {
      screen.getByRole("button", { name: "Deactivate" }).click()
    })
    act(() => {
      mutate.mock.calls[0][1]?.onSuccess?.()
    })

    expect(screen.queryByText("Deactivate Tuition?")).toBeNull()
  })

  it("keeps the dialog open after a failed write", () => {
    const { mutate } = setup()
    act(() => {
      screen.getByRole("button", { name: "open-deactivate" }).click()
    })
    act(() => {
      screen.getByRole("button", { name: "Deactivate" }).click()
    })
    act(() => {
      mutate.mock.calls[0][1]?.onError?.(new Error("nope"))
    })

    expect(screen.getByText("Deactivate Tuition?")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeTruthy()
  })
})
