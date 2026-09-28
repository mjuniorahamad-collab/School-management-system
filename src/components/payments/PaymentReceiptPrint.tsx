import { useEffect, useRef } from "react"
import { Printer } from "lucide-react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"
import { receiptsService } from "@/services/receiptsService"
import { printDocument, PRINT_HIDDEN } from "@/lib/print"
import type { ReceiptDetail } from "@/types/fees"

/**
 * Prints the receipt belonging to a payment.
 *
 * The payment DTO carries only the receipt number and the balance after it, not
 * the receipt itself, so the full `ReceiptDetail` is fetched on demand — opening
 * the payment dialog costs no extra request, and nothing is fetched at all for an
 * actor without `receipts:view`.
 *
 * This is the asynchronous counterpart to `PrintButton`: the document has to exist
 * before the print dialog can open, so the trigger resolves the receipt through the
 * service seam and then calls the same `printDocument()` entry point. A failed
 * fetch never opens a blank print dialog — it reports the failure instead.
 *
 * This component renders the trigger only. The document itself is mounted by the
 * caller through `onLoaded`, as a direct child of the dialog content, so the
 * receipt is never laid out inside a screen card or a flex row — nesting it made
 * the document a flex item, which sized it by its own content instead of by the
 * page box and rendered it narrower than the sheet.
 */
export function PaymentReceiptPrint({
  receiptId,
  onLoaded,
}: {
  receiptId: string
  onLoaded: (receipt: ReceiptDetail) => void
}) {
  const { can } = useAuth()

  const receipt = useMutation({
    mutationFn: (id: string) => receiptsService.get(id),
    onError: () => toast.error("Could not load this receipt to print."),
  })

  // Printing waits until the receipt document is actually in the DOM. Calling
  // printDocument() straight from the mutation's onSuccess opened the dialog while
  // this component was still rendering `receipt.data === undefined`, so the browser
  // snapshotted the surrounding page instead of the receipt. onLoaded is called
  // first so the caller commits the document synchronously; React flushes that
  // state update in a microtask, and the animation frame then runs once the
  // document is in the DOM and laid out.
  //
  // onLoaded is held in a ref rather than listed as a dependency. The caller
  // stores the receipt in state, so re-running this effect on a new callback
  // identity would re-notify, re-render, and open the print dialog again on a loop.
  const onLoadedRef = useRef(onLoaded)
  useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])

  useEffect(() => {
    const data = receipt.data
    if (data === undefined) return
    onLoadedRef.current(data)
    const frame = requestAnimationFrame(() => {
      printDocument({ title: `Fee Receipt ${data.receiptNumber}` })
    })
    return () => cancelAnimationFrame(frame)
  }, [receipt.data])

  if (!can("receipts:view")) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={`${PRINT_HIDDEN} shrink-0`}
      disabled={receipt.isPending}
      onClick={() => receipt.mutate(receiptId)}
    >
      <Printer className="size-3.5" aria-hidden="true" />
      {receipt.isPending ? "Preparing…" : "Print receipt"}
    </Button>
  )
}
