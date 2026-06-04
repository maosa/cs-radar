export default function BuyerMatrixLoading() {
  return (
    <div className="flex flex-col">
      <div className="px-6 pt-6 pb-4 border-b border-border flex flex-col gap-3">
        <div className="h-5 w-36 rounded bg-border animate-pulse" />
      </div>
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <div className="h-7 w-7 rounded-full bg-border animate-pulse" />
        <div className="h-4 w-48 rounded bg-border animate-pulse opacity-60" />
      </div>
    </div>
  )
}
