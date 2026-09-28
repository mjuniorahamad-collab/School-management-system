import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { printDocument, PRINT_HIDDEN } from "@/lib/print"
import type { PrintOrientation } from "@/lib/print"

export interface PrintButtonProps {
  /** Visible label. Also the button's accessible name. */
  children: React.ReactNode
  /** Overrides the accessible name when the visible label is not descriptive. */
  ariaLabel?: string
  /** Printed as document.title, and used by the browser's save-as-PDF filename. */
  documentTitle: string
  /** Wide artifacts (timetable, result sheet) pass "landscape". */
  orientation?: PrintOrientation
  disabled?: boolean
  className?: string
}

/**
 * The single print action for the whole application.
 *
 * It carries `print:hidden` by construction: a Print button must never appear on
 * its own output. Callers place it inside the surface's `print:hidden` action row;
 * the class is repeated here so the button is safe even when a caller forgets.
 *
 * This is a synchronous trigger. Surfaces that must first collect a full filtered
 * dataset (library circulation, transport assignments) call printDocument()
 * themselves once their data has arrived — see useFullFilteredList.
 */
export function PrintButton({
  children,
  ariaLabel,
  documentTitle,
  orientation,
  disabled,
  className,
}: PrintButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${PRINT_HIDDEN} shrink-0 ${className ?? ""}`.trim()}
      onClick={() => printDocument({ title: documentTitle, orientation })}
    >
      <Printer className="size-3.5" aria-hidden="true" />
      {children}
    </Button>
  )
}
