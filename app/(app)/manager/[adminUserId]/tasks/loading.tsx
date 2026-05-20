export default function ManagerTaskLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-4 px-6 border-b border-border bg-white">
        <div className="h-4 w-16 my-3 rounded bg-border animate-pulse" />
        <div className="h-4 w-24 my-3 rounded bg-border animate-pulse opacity-60" />
      </div>

      {/* Toolbar */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex items-center gap-3">
        <div className="h-5 w-24 rounded bg-border animate-pulse" />
        <div className="h-7 w-32 rounded-[6px] bg-border animate-pulse" />
      </div>

      {/* Task rows */}
      <div className="flex-1 px-6 pt-4 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 rounded-[6px] bg-border animate-pulse opacity-60" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  )
}
