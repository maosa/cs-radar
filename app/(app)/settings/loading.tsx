export default function SettingsLoading() {
  return (
    <div className="p-6 max-w-2xl flex flex-col gap-5">
      <div className="h-5 w-20 rounded bg-border animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-[8px] border border-border bg-white p-5 flex flex-col gap-3">
          <div className="h-4 w-36 rounded bg-border animate-pulse" />
          <div className="h-9 w-full rounded-[6px] bg-border animate-pulse opacity-60" style={{ animationDelay: `${i * 60}ms` }} />
          <div className="h-9 w-full rounded-[6px] bg-border animate-pulse opacity-40" style={{ animationDelay: `${i * 80}ms` }} />
        </div>
      ))}
    </div>
  )
}
