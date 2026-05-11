import TaskTableView from '@/components/tasks/TaskTableView'

export default function ManagerTaskView({ adminUserId }: { adminUserId: string }) {
  return <TaskTableView readOnly adminUserId={adminUserId} />
}
