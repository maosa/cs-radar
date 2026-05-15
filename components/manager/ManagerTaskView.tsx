import ManagerViewTabs from './ManagerViewTabs'
import TaskTableView from '@/components/tasks/TaskTableView'

interface ManagerTaskViewProps {
  adminUserId: string
  accountHealthEnabled: boolean
}

export default function ManagerTaskView({ adminUserId, accountHealthEnabled }: ManagerTaskViewProps) {
  return (
    <div className="flex flex-col h-full">
      <ManagerViewTabs adminUserId={adminUserId} accountHealthEnabled={accountHealthEnabled} />
      <TaskTableView readOnly adminUserId={adminUserId} />
    </div>
  )
}
