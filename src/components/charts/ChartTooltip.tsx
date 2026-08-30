interface ChartTooltipPayloadItem {
  name?: string
  value?: number | string
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayloadItem[]
  label?: string
  formatter?: (value: number) => string
  labelPrefix?: string
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelPrefix,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-card ring-1 ring-foreground/5">
      {label && <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{labelPrefix ?? item.name}</span>
            <span className="ml-auto font-semibold tabular-nums">
              {typeof item.value === "number" && formatter ? formatter(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}