export default function ManagerLoading() {
  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="h-5 w-32 rounded bg-border animate-pulse" />
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 w-56 rounded-[8px] bg-border animate-pulse opacity-60" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  )
}
