import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/verify-email')({
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: "/" })
  },
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm text-center space-y-3">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Check your email</h1>
        <p className="text-sm text-muted-foreground">We sent a verification link to your email address. Click it to continue.</p>
      </div>
    </div>
  )
}
