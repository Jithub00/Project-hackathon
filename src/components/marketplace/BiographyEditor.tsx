import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorAlert, FieldError } from '@/components/site/ui-bits';
import { WordCountField } from './WordCountField';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { BIO_MAX_WORDS, countWords } from '../../../shared/biography';
import type { SessionUser } from '../../../shared/types';

/** Biography and display name. Used in profile setup and in account settings. */
export function BiographyEditor({ user, title = 'Biography', description }: { user: SessionUser; title?: string; description?: string }) {
  const { setUser } = useApp();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const words = countWords(bio);
  const tooLong = words > BIO_MAX_WORDS;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(null);
    setFormError(null);
    setNameError(null);
    if (tooLong) {
      setFieldError(`Your biography is ${words} words. Shorten it to ${BIO_MAX_WORDS} words or fewer to save.`);
      return;
    }
    setSaving(true);
    try {
      const data = await api.put<{ user: SessionUser }>('/api/me/profile', { name, bio });
      setUser(data.user);
      setFieldError(null);
      setSaved('Saved. Your biography is live on your profile.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'BIO_TOO_LONG') {
        setFieldError(error.message);
      } else if (error instanceof ApiError && error.fieldErrors.name) {
        setNameError(error.fieldErrors.name);
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-7" aria-labelledby="bio-heading" data-testid="biography-form">
      <div>
        <h2 id="bio-heading" className="text-2xl font-black uppercase tracking-tight">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description ?? 'Up to 350 words. Describe your experience, specialties, creative approach and working style.'}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="display-name" className="text-sm font-semibold">Display name</Label>
        <Input
          id="display-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(nameError)}
          className="max-w-md bg-card"
          autoComplete="name"
        />
        <FieldError message={nameError} />
      </div>
      <WordCountField
        id="bio"
        label="Biography"
        value={bio}
        onChange={(next) => {
          setBio(next);
          setSaved(null);
          setFieldError(null);
        }}
        error={fieldError}
        hint={
          user.role === 'creator'
            ? 'Tell clients about your experience, specialties, creative approach and how you like to work.'
            : 'Tell creators about yourself or your business, the content you make, and the projects you want to create.'
        }
        placeholder={user.role === 'creator' ? 'I photograph…' : 'We are a…'}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={saving || tooLong} data-testid="save-bio">
          {saving ? 'Saving…' : 'Save biography'}
        </Button>
        {tooLong ? <p className="text-sm text-muted-foreground">Save is unavailable until the biography is {BIO_MAX_WORDS} words or fewer.</p> : null}
        {saved ? <p role="status" data-testid="bio-saved" className="text-sm font-semibold">{saved}</p> : null}
      </div>
      {formError ? <ErrorAlert message={formError} /> : null}
    </form>
  );
}
