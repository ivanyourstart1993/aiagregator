import { LoginForm } from '@/components/LoginForm';

interface Props {
  searchParams: { callbackUrl?: string };
}

export default function LoginPage({ searchParams }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="space-y-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            AI
          </div>
          <h1 className="text-xl font-semibold">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">
            Только для администраторов / Admins only
          </p>
        </div>
        <LoginForm callbackUrl={searchParams.callbackUrl ?? '/'} />
      </div>
    </div>
  );
}
