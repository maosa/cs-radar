import { permanentRedirect } from 'next/navigation'

export default async function ManagerAdminUserPage({
  params,
}: {
  params: Promise<{ adminUserId: string }>
}) {
  const { adminUserId } = await params
  permanentRedirect(`/manager/${adminUserId}/project-tracker`)
}
