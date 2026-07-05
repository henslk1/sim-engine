import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/admin/')({
  component: AdminDashboard,
})

function AdminDashboard() {
  return (
    <div className='p-6'>
      <h1 className='font-serif text-2x1 font-semibold text-foreground mb-2'>Admin Console</h1>
      <p className='text-sm text-muted-foreground'>Select a section from the sidebar to get started.</p>
    </div>
  )
}
