import { requireUser } from '@/lib/permissions'
import { getProject } from '@/lib/data'
import { AppShell } from '@/components/shell/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, project] = await Promise.all([requireUser(), getProject()])
  return (
    <AppShell user={user} projectName={project.name}>
      {children}
    </AppShell>
  )
}
