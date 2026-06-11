import ManagerViewTabs from './ManagerViewTabs'
import TaskTableView from '@/components/tasks/TaskTableView'

interface ManagerTaskViewProps {
  adminUserId: string
  accountHealthEnabled: boolean
  buyerMatrixEnabled?: boolean
}

export default function ManagerTaskView({ adminUserId, accountHealthEnabled, buyerMatrixEnabled = false }: ManagerTaskViewProps) {
  return (
    <div className="flex flex-col">
      <TaskTableView
        readOnly
        adminUserId={adminUserId}
        tabBar={<ManagerViewTabs adminUserId={adminUserId} accountHealthEnabled={accountHealthEnabled} buyerMatrixEnabled={buyerMatrixEnabled} />}
      />
    </div>
  )
}
