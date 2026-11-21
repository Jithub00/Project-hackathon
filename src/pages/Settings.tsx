import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BiographyEditor } from '@/components/marketplace/BiographyEditor';
import { ErrorAlert, FieldError, PageHeader } from '@/components/site/ui-bits';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { passwordChangeSchema } from '../../shared/schemas';

export function Settings() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(null);
    setFormError(null);
    const parsed = passwordChangeSchema.safeParse({ currentPassword: current, newPassword: next, confirmPassword: confirm });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0] ?? 'form');
        if (!map[key]) map[key] = issue.message;
      });
      setErrors(map);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.post('/api/me/password', { currentPassword: current, newPassword: next, confirmPassword: confirm });
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved('Password updated. Use the new password next time you log in.');
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.currentPassword) {
        setErrors({ currentPassword: error.fieldErrors.currentPassword });
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader eyebrow="Account settings" title="Settings" description="Update your name and biography, change your password, and manage how you appear to others." />

      <div className="mt-12 flex flex-col gap-14">
        <section className="rounded-lg border border-border bg-card p-7 md:p-9">
          <BiographyEditor user={user} title="Name and biography" />
        </section>

        <section aria-labelledby="account-title" className="flex flex-col gap-5">
          <h2 id="account-title" className="text-2xl font-black uppercase tracking-tight">Account</h2>
          <dl className="grid gap-4 rounded-lg border border-border bg-card p-6 text-sm md:grid-cols-3">
            <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Email</dt><dd className="mt-1 font-semibold">{user.email}</dd></div>
            <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Account type</dt><dd className="mt-1 font-semibold">{user.role === 'creator' ? 'Creator' : 'Customer'}</dd></div>
            <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Environment</dt><dd className="mt-1 font-semibold">{user.isDemo ? 'Demonstration account' : 'Standard account'}</dd></div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Edit services, packages, portfolio and availability on the <Link to="/account/profile" className="underline underline-offset-4">profile page</Link>.
          </p>
        </section>

        <section aria-labelledby="password-title" className="flex flex-col gap-6">
          <h2 id="password-title" className="text-2xl font-black uppercase tracking-tight">Change password</h2>
          <form onSubmit={changePassword} noValidate className="grid max-w-xl gap-6" data-testid="password-form">
            {formError ? <ErrorAlert message={formError} /> : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="pw-current">Current password</Label>
              <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={Boolean(errors.currentPassword)} className="bg-card" />
              <FieldError message={errors.currentPassword} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pw-new">New password</Label>
              <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={Boolean(errors.newPassword)} className="bg-card" />
              <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
              <FieldError message={errors.newPassword} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={Boolean(errors.confirmPassword)} className="bg-card" />
              <FieldError message={errors.confirmPassword} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</Button>
              {saved ? <p role="status" className="text-sm font-semibold">{saved}</p> : null}
            </div>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-black uppercase tracking-tight">Session</h2>
          <div>
            <Button
              variant="outline"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              data-testid="logout"
            >
              Log out
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
