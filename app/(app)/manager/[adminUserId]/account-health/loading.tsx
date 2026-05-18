export default function ManagerAccountHealthLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-4 px-6 border-b border-border bg-white">
        <div className="h-4 w-16 my-3 rounded bg-border animate-pulse opacity-60" />
        <div className="h-4 w-24 my-3 rounded bg-border animate-pulse" />
      </div>

      {/* Controls bar */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex flex-col gap-3">
        <div className="h-5 w-36 rounded bg-border animate-pulse" />
        <div className="flex items-end gap-3">
          <div className="h-8 w-48 rounded-[6px] bg-border animate-pulse" />
        </div>
      </div>

      {/* Empty state placeholder */}
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <div className="h-7 w-7 rounded-full bg-border animate-pulse" />
        <div className="h-4 w-48 rounded bg-border animate-pulse opacity-60" />
      </div>
    </div>
  )
}
