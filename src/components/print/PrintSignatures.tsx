export interface PrintSignatureEntry {
  role: string
  /** A name the server already returned, printed above the rule. */
  name?: string | null
}

/**
 * Signature lines for documents a school expects to be signed for.
 *
 * When the server supplied a name it is printed above the rule rather than
 * discarded: a receipt that records `receivedByName` should not then ask someone
 * to write the same name by hand.
 */
export function PrintSignatureRow({
  roles = ["Received by", "Verified by"],
  entries,
  stamp = false,
}: {
  roles?: string[]
  entries?: PrintSignatureEntry[]
  /** Adds a bordered school-stamp box beside the signatures. */
  stamp?: boolean
}) {
  const lines: PrintSignatureEntry[] =
    entries ?? roles.map((role) => ({ role, name: null }))

  return (
    <div className={stamp === true ? "print-document-signatures" : "print-document-signatures-no-stamp"}>
      <div className="print-document-signature-grid">
        {lines.map((entry) => (
          <div key={entry.role}>
            {entry.name !== undefined && entry.name !== null && entry.name !== "" && (
              <p className="print-document-note mb-1">{entry.name}</p>
            )}
            <div className="print-document-signature-rule" />
            <p className="print-document-note mt-1">{entry.role}</p>
          </div>
        ))}
      </div>
      {stamp === true && (
        <div className="print-document-stamp">
          <p className="print-document-note">School stamp</p>
        </div>
      )}
    </div>
  )
}
