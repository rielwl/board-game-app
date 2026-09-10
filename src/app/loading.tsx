/** Route-level loading state. Skeletons keep the layout from jumping. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-[var(--color-paper-sunken)]" />
      <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-paper-sunken)]" />
      <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-paper-sunken)]" />
    </div>
  );
}
