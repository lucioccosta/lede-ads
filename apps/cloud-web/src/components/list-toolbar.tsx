import { Input } from "@/components/ui/input"
import { type ReactNode } from "react"

export function ListToolbar({
  search,
  onSearchChange,
  placeholder = "Buscar…",
  children,
}: {
  search: string
  onSearchChange: (value: string) => void
  placeholder?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        className="sm:max-w-xs"
      />
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}
