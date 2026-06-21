type Status = 'running' | 'stopped' | 'unknown' | 'enabled' | 'disabled'

const MAP: Record<Status, { cls: string; label: string }> = {
  running:  { cls: 'badge-running', label: 'Running' },
  enabled:  { cls: 'badge-running', label: 'Enabled' },
  stopped:  { cls: 'badge-stopped', label: 'Stopped' },
  disabled: { cls: 'badge-stopped', label: 'Disabled' },
  unknown:  { cls: 'badge-unknown', label: 'Unknown' },
}

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[(status as Status)] ?? MAP.unknown
  return <span className={`badge ${m.cls}`}>{m.label}</span>
}
