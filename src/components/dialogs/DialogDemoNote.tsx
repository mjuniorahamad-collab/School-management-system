import { Info } from "lucide-react"

export function DialogDemoNote() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Demo workflow — nothing is saved yet. This wires up to the live API when the feature ships.
      </span>
    </p>
  )
}