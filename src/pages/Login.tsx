import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorAlert, FieldError, Eyebrow } from '@/components/site/ui-bits';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { DEMO_PASSWORD_HINT } from '../../shared/constants';
import { loginSchema } from '../../shared/schemas';
import type { SessionUser } from '../../shared/types';

type LoginValues = { email: string; password: string };

const SAFE_NEXT = /^\/(?!\/)[^\s]*$/;

export function nextPath(params: URLSearchParams, fallback: string): string {
  const next = params.get('next');
  return next && SAFE_NEXT.test(next) ? next : fallback;
}

export function Login() {
  const { setUser, config } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Keeps the destination through sign-up, so a new account is returned to the same place.
  const returnTo = nextPath(params, '');
  const signupLink = returnTo ? `/signup?next=${encodeURIComponent(returnTo)}` : '/signup';
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema) as unknown as Resolver<LoginValues>,
    defaultValues: { email: '', password: '' },
  });
  const { register, handleSubmit, formState, setValue, setError } = form;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const data = await api.post<{ user: SessionUser }>('/api/auth/login', values);
      setUser(data.user);
      navigate(nextPath(params, '/dashboard'));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'BAD_CREDENTIALS') {
        setError('password', { message: 'That email and password do not match our records.' });
      } else {
        setFormError(errorMessage(error));
      }
    }
  });

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-6">
        <Eyebrow>Welcome back</Eyebrow>
        <h1 className="text-5xl font-black uppercase leading-[0.92] tracking-tight md:text-6xl">Log in to Photo Shoot</h1>
        <p className="max-w-md text-muted-foreground">Open your dashboard, follow your projects, and pick up where you left off.</p>
        <p className="text-sm">New here? <Link className="font-semibold underline underline-offset-4 hover:text-brand-red-text" to={signupLink}>Create an account</Link></p>
      </div>

      <div className="flex flex-col gap-10">
        <form onSubmit={submit} noValidate className="flex flex-col gap-6 rounded-lg border border-border bg-card p-7 md:p-9" aria-labelledby="login-title" data-testid="login-form">
          <h2 id="login-title" className="text-2xl font-black uppercase tracking-tight">Log in</h2>
          {formError ? <ErrorAlert message={formError} /> : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" type="email" autoComplete="email" aria-invalid={Boolean(formState.errors.email)} {...register('email')} className="bg-background" />
            <FieldError message={formState.errors.email?.message} id="login-email-error" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-password">Password</Label>
            <Input id="login-password" type="password" autoComplete="current-password" aria-invalid={Boolean(formState.errors.password)} {...register('password')} className="bg-background" />
            <FieldError message={formState.errors.password?.message} id="login-password-error" />
          </div>
          <Button type="submit" size="lg" disabled={formState.isSubmitting} data-testid="login-submit">
            {formState.isSubmitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        {config?.demoAccounts?.length ? (
          <section aria-labelledby="demo-accounts" className="flex flex-col gap-4 rounded-lg border border-dashed border-border-strong p-6" data-testid="demo-accounts">
            <h2 id="demo-accounts" className="text-sm font-semibold uppercase tracking-[0.14em]">Demonstration accounts</h2>
            <p className="text-sm text-muted-foreground">
              Fill in a sample account, then log in. Every sample account uses the password <span className="font-mono text-foreground">{DEMO_PASSWORD_HINT}</span>. Payments in this environment are simulated.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {config.demoAccounts.map((account) => (
                <li key={account.email}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                    onClick={() => {
                      setValue('email', account.email, { shouldValidate: true });
                      setValue('password', DEMO_PASSWORD_HINT);
                    }}
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{account.label}</span>
                      <span className="text-xs text-muted-foreground">{account.email}</span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
