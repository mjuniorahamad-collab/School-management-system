import { useState } from "react"
import { Link } from "react-router-dom"
import { Banknote, Receipt } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { InvoiceDetailDialog } from "@/components/fees/InvoiceDetailDialog"
import { PaymentMethodLabel } from "@/components/fees/FeeStatusBadges"
import { PaymentDetailDialog } from "@/components/payments/PaymentDetailDialog"
import { PaymentFormDialog } from "@/components/payments/PaymentFormDialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useFeeInvoices } from "@/hooks/useFeeInvoices"
import { useInvoicePayments } from "@/hooks/usePayments"
import { formatFullDate, formatINR } from "@/lib/format"
import type { AcademicSessionStatus } from "@/types/students"

const RECENT_PAYMENT_LIMIT = 5

interface StudentFeesCardProps {
  studentId: string
  sessionId: string
  sessionName: string
  sessionStatus: AcademicSessionStatus
}

interface MoneyCellProps {
  label: string
  value: number
  tone?: "default" | "positive" | "negative"
}

function MoneyCell({ label, value, tone = "default" }: MoneyCellProps) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-foreground"

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${toneClass}`}>{formatINR(value)}</dd>
    </div>
  )
}

function StateRow({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>
}

function FeesEmptyState({ message, showFeesLink = false }: { message: string; showFeesLink?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <StateRow message={message} />
      {showFeesLink && (
        <Button variant="outline" size="sm" asChild>
          <Link to="/fees">Go to fees</Link>
        </Button>
      )}
    </div>
  )
}

export function StudentFeesCard({
  studentId,
  sessionId,
  sessionName,
  sessionStatus,
}: StudentFeesCardProps) {
  const { can } = useAuth()
  const [collectOpen, setCollectOpen] = useState(false)
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)
  const [paymentId, setPaymentId] = useState<string | null>(null)

  const canViewPayments = can("payments:view")
  const canCollect = can("payments:create")

  // The session is the student's own ACTIVE enrollment. Never widen to an older
  // session: if it is not the ACTIVE one there is no current fee figure to show.
  const sessionReady = sessionStatus === "ACTIVE" && Boolean(sessionId)
  const invoicesQuery = useFeeInvoices(
    { studentId, sessionId, pageSize: 1 },
    { enabled: sessionReady },
  )

  // A disabled query holds no data, but a previously cached result can survive
  // a session flipping out of ACTIVE while the card is mounted. Dropping the
  // invoice here - not just disabling the fetch - is what stops a stale
  // non-current session from being rendered or read from.
  const invoice = sessionReady ? (invoicesQuery.data?.items[0] ?? null) : null
  const due = invoice?.balance ?? 0
  // The complete collection rule, written out rather than inferred: an invoice
  // must exist, still owe money, not be settled, and the actor must be allowed
  // to create a payment. `invoice !== null` (not `Boolean(invoice)`) so
  // TypeScript narrows the type for the two field reads below.
  //
  // OVERDUE is deliberately not excluded - an overdue invoice is exactly the
  // one a bursar most needs to collect. The `status !== "PAID"` clause is
  // defense in depth: today's server rules never produce a PAID invoice with a
  // positive balance, so the clause cannot change current behaviour, but stating
  // it keeps the UI honest if that ever changes.
  const canCollectThisInvoice =
    invoice !== null && invoice.balance > 0 && invoice.status !== "PAID" && canCollect

  // Payment history is a READ path, so it is gated only on having an invoice to
  // read and on payments:view. It must NOT depend on an outstanding balance: a
  // fully paid invoice is precisely the one whose payments explain how it got
  // there, and hiding them would leave the card unable to show the payments that
  // produced the "fully paid" state. `due > 0` belongs to the Collect Fee
  // action above, which is a write and does need money outstanding.
  const paymentsEnabled = Boolean(invoice) && canViewPayments
  const paymentsQuery = useInvoicePayments(invoice?.id ?? null, RECENT_PAYMENT_LIMIT, {
    enabled: paymentsEnabled,
  })

  const recentPayments = paymentsQuery.data?.items ?? []

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Fees</CardTitle>
        <CardDescription data-slot="card-description">
          {sessionReady ? `Fee position for ${sessionName}` : `Current session fees`}
        </CardDescription>
        {canCollectThisInvoice && (
          <CardAction>
            <Button size="sm" onClick={() => setCollectOpen(true)}>
              <Banknote className="size-4" aria-hidden="true" />
              Collect fee
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Say why the figures are missing. The gate below is deliberately
            strict, so a silent empty card would read as "no fees" rather than
            "not the current session". */}
        {!sessionReady && (
          <FeesEmptyState
            showFeesLink
            message={
              sessionId
                ? `Fee position is only shown for the current academic session. This student is enrolled in ${sessionName}, which is not the current session.`
                : "This student has no academic session enrollment, so there is no current fee position to show."
            }
          />
        )}

        {sessionReady && invoicesQuery.isPending && <FeesSkeleton />}

        {sessionReady && invoicesQuery.isError && (
          <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-4">
            <p className="text-sm text-muted-foreground">
              Could not load fee information for this session.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void invoicesQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {sessionReady && !invoicesQuery.isPending && !invoicesQuery.isError && !invoice && (
          <FeesEmptyState
            showFeesLink
            message={`No fee invoice has been generated for ${sessionName}.`}
          />
        )}

        {invoice && (
          <>
            <dl className="grid grid-cols-3 gap-2">
              <MoneyCell label="Total fee" value={invoice.totalAmount} />
              <MoneyCell label="Paid" value={invoice.amountPaid} tone="positive" />
              <MoneyCell label="Due" value={due} tone={due > 0 ? "negative" : "positive"} />
            </dl>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {/* The breakdown lives behind the same fees:view permission that
                  already gated this card, so drilling in needs no extra gate. */}
              <button
                type="button"
                onClick={() => setDetailInvoiceId(invoice.id)}
                className="rounded font-mono text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {invoice.invoiceNumber}
              </button>
              <span aria-hidden="true">·</span>
              <span>{invoice.sessionName}</span>
              {invoice.nextDueDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Next installment {formatFullDate(invoice.nextDueDate)}</span>
                </>
              )}
            </p>

            {due <= 0 && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                This session&apos;s fees are fully paid.
              </p>
            )}

            {paymentsEnabled && recentPayments.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Recent payments</p>
                <ul className="flex flex-col divide-y divide-border">
                  {recentPayments.map((payment) => (
                    <li key={payment.id}>
                      <button
                        type="button"
                        onClick={() => setPaymentId(payment.id)}
                        className="flex w-full items-center justify-between gap-3 py-2 text-left transition-colors hover:bg-muted/50"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm text-foreground">
                            {formatFullDate(payment.paymentDate)}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <PaymentMethodLabel method={payment.method} />
                            {payment.transactionRef ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate font-mono">{payment.transactionRef}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatINR(payment.amount)}
                          </span>
                          <Receipt
                            className="size-3.5 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>

      {invoice && (
        <PaymentFormDialog
          open={collectOpen}
          onOpenChange={setCollectOpen}
          selectedInvoice={invoice}
        />
      )}
      {paymentId && (
        <PaymentDetailDialog
          paymentId={paymentId}
          onOpenChange={(open) => {
            if (!open) setPaymentId(null)
          }}
        />
      )}
      <InvoiceDetailDialog
        invoiceId={detailInvoiceId}
        onOpenChange={(open) => {
          if (!open) setDetailInvoiceId(null)
        }}
      />
    </Card>
  )
}

function FeesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
      <Skeleton className="h-3 w-48" />
    </div>
  )
}
