interface PageHeaderProps {
  title: string
}

export default function PageHeader({ title }: PageHeaderProps) {
  return (
    <div className="px-6 pt-6 pb-4 border-b border-border bg-white flex-shrink-0">
      <h1 className="text-base font-medium text-navy">{title}</h1>
    </div>
  )
}
