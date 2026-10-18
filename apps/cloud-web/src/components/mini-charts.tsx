import { cn } from "@/lib/utils"

type Point = { label?: string; value: number }

function maxOf(values: number[], minFloor = 1) {
  return Math.max(minFloor, ...values)
}

/** Sparkline com área preenchida (evolução). */
export function Sparkline({
  values,
  className,
  stroke = "var(--primary)",
  fill = "color-mix(in oklch, var(--primary) 22%, transparent)",
}: {
  values: number[]
  className?: string
  stroke?: string
  fill?: string
}) {
  const w = 120
  const h = 36
  const pad = 2
  if (values.length < 2) {
    return (
      <div
        className={cn("h-9 w-full rounded-md bg-muted/40", className)}
        aria-hidden
      />
    )
  }
  const max = maxOf(values)
  const min = Math.min(...values)
  const span = Math.max(1, max - min)
  const coords = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return { x, y }
  })
  const line = coords.map((c) => `${c.x},${c.y}`).join(" ")
  const area = `M${coords[0].x},${h} L${line.replace(/ /g, " L")} L${coords[coords.length - 1].x},${h} Z`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-9 w-full overflow-visible", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={area} fill={fill} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Barras verticais compactas (ex.: 7 dias). */
export function MiniBarChart({
  points,
  className,
  barClassName = "bg-primary/80",
}: {
  points: Point[]
  className?: string
  barClassName?: string
}) {
  const max = maxOf(points.map((p) => p.value))
  return (
    <div className={cn("flex h-12 items-end gap-1", className)} aria-hidden>
      {points.map((p, i) => {
        const pct = Math.max(6, (p.value / max) * 100)
        return (
          <div
            key={`${p.label ?? i}`}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
            title={
              p.label != null
                ? `${p.label}: ${p.value.toLocaleString("pt-BR")}`
                : String(p.value)
            }
          >
            <div
              className={cn("w-full rounded-sm transition-all", barClassName)}
              style={{ height: `${pct}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

/** Barra segmentada (composição). */
export function SegmentedBar({
  segments,
  className,
}: {
  segments: Array<{ value: number; className: string; label: string }>
  className?: string
}) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  if (total <= 0) {
    return <div className={cn("h-2 w-full rounded-full bg-muted", className)} />
  }
  return (
    <div
      className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
    >
      {segments.map((s) =>
        s.value > 0 ? (
          <div
            key={s.label}
            className={cn("h-full", s.className)}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ) : null,
      )}
    </div>
  )
}

/** Barras horizontais de ocupação. */
export function OccupancyBars({
  items,
  className,
}: {
  items: Array<{ label: string; pct: number; full?: boolean }>
  className?: string
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Sem grupos de capacidade</p>
    )
  }
  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">{item.label}</span>
            <span className="shrink-0 tabular-nums text-foreground">
              {Math.round(item.pct)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                item.full || item.pct >= 90
                  ? "bg-destructive"
                  : item.pct >= 70
                    ? "bg-amber-500"
                    : "bg-primary",
              )}
              style={{ width: `${Math.min(100, Math.max(0, item.pct))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function deltaLabel(current: number, previous: number) {
  if (previous <= 0 && current <= 0) return null
  if (previous <= 0) return { text: "novo", up: true }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { text: "estável", up: true }
  return {
    text: `${pct > 0 ? "+" : ""}${pct}%`,
    up: pct >= 0,
  }
}
