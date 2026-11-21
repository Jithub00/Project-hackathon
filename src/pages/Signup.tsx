import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Camera, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { NeighborhoodCheckboxes, NeighborhoodSelect, ANY_NEIGHBORHOOD } from '@/components/marketplace/NeighborhoodSelect';
import { WordCountField } from '@/components/marketplace/WordCountField';
import { ErrorAlert, Eyebrow, FieldError, PageHeader } from '@/components/site/ui-bits';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { nextPath } from './Login';
import { CUSTOMER_INTEREST_OPTIONS, STYLE_OPTIONS } from '../../shared/constants';
import { customerSignupSchema, creatorSignupSchema } from '../../shared/schemas';
import type { SessionUser } from '../../shared/types';

function useServerErrors<T extends Record<string, unknown>>(setError: (name: keyof T & string, error: { message: string }) => void) {
  return (err: unknown, fallback: (message: string) => void) => {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
      Object.entries(err.fieldErrors).forEach(([field, message]) => {
        setError(field as keyof T & string, { message });
      });
      return;
    }
    fallback(errorMessage(err));
  };
}

export function SignupChooser() {
  const [params] = useSearchParams();
  const next = params.get('next');
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
      <PageHeader eyebrow="Create an account" title="Who are you here as?" description="Choose the account that fits. You can always add the other side later with a separate account." />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <Link to={`/signup/customer${query}`} data-testid="choose-customer" className="group flex flex-col gap-6 rounded-lg border border-border bg-card p-8 transition-colors hover:border-primary md:p-10">
          <Users className="size-8 text-brand-red-text" aria-hidden />
          <h2 className="text-3xl font-black uppercase leading-none tracking-tight">I want to hire a team</h2>
          <p className="text-muted-foreground">Individuals and businesses in Los Angeles who need photography or video. Build a brief, compare creators, and book securely.</p>
          <span className="mt-auto inline-flex items-center gap-2 font-semibold">Customer account <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
        </Link>
        <Link to={`/signup/creator${query}`} data-testid="choose-creator" className="group flex flex-col gap-6 rounded-lg border border-border bg-card p-8 transition-colors hover:border-primary md:p-10">
          <Camera className="size-8 text-brand-red-text" aria-hidden />
          <h2 className="text-3xl font-black uppercase leading-none tracking-tight">I photograph or film in Los Angeles</h2>
          <p className="text-muted-foreground">Photographers and videographers based in or working across the City of Los Angeles. Publish packages, show your work and find projects.</p>
          <span className="mt-auto inline-flex items-center gap-2 font-semibold">Creator account <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
        </Link>
      </div>
      <p className="mt-10 text-sm">Already have an account? <Link to="/login" className="font-semibold underline underline-offset-4">Log in</Link></p>
    </div>
  );
}

type CustomerValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  customerType: 'individual' | 'business';
  businessName: string;
  neighborhood: string;
  interests: string[];
  bio: string;
  acceptTerms: boolean;
};

export function SignupCustomer() {
  const { setUser } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CustomerValues>({
    resolver: zodResolver(customerSignupSchema) as unknown as Resolver<CustomerValues>,
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      customerType: 'individual',
      businessName: '',
      neighborhood: '',
      interests: [],
      bio: '',
      acceptTerms: false,
    },
  });
  const { register, handleSubmit, control, watch, formState, setError, getValues } = form;
  const customerType = watch('customerType');
  const mapErrors = useServerErrors<CustomerValues>(setError);

  const onValid = async (values: CustomerValues) => {
    setFormError(null);
    try {
      const data = await api.post<{ user: SessionUser }>('/api/auth/signup/customer', {
        ...values,
        neighborhood: values.neighborhood === ANY_NEIGHBORHOOD ? '' : values.neighborhood,
      });
      setUser(data.user);
      navigate(nextPath(params, '/dashboard'));
    } catch (error) {
      mapErrors(error, setFormError);
    }
  };
  // Cross-field rules are only evaluated once each field passes, so report them on submit too.
  const onInvalid = () => {
    const v = getValues();
    if (v.password !== v.confirmPassword) setError('confirmPassword', { message: 'Passwords do not match.' });
    if (v.customerType === 'business' && !v.businessName) setError('businessName', { message: 'Enter your business name.' });
  };
  const submit = handleSubmit(onValid, onInvalid);

  const err = formState.errors;
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-14 md:px-8 md:py-20">
      <Eyebrow>Customer account</Eyebrow>
      <h1 className="mt-5 text-5xl font-black uppercase leading-[0.92] tracking-tight md:text-6xl">Hire a Los Angeles team</h1>
      <p className="mt-5 max-w-2xl text-muted-foreground">Tell us who you are. You can build briefs and invite creators straight away.</p>

      <form onSubmit={submit} noValidate className="mt-12 flex flex-col gap-9" aria-label="Customer sign up" data-testid="signup-customer-form">
        {formError ? <ErrorAlert message={formError} /> : null}

        <fieldset className="grid gap-6 md:grid-cols-2">
          <legend className="sr-only">Account details</legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-name">Full name</Label>
            <Input id="c-name" autoComplete="name" aria-invalid={Boolean(err.name)} {...register('name')} className="bg-card" />
            <FieldError message={err.name?.message} id="c-name-error" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" autoComplete="email" aria-invalid={Boolean(err.email)} {...register('email')} className="bg-card" />
            <FieldError message={err.email?.message} id="c-email-error" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-password">Password</Label>
            <Input id="c-password" type="password" autoComplete="new-password" aria-invalid={Boolean(err.password)} {...register('password')} className="bg-card" />
            <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
            <FieldError message={err.password?.message} id="c-password-error" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-confirm">Confirm password</Label>
            <Input id="c-confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(err.confirmPassword)} {...register('confirmPassword')} className="bg-card" />
            <FieldError message={err.confirmPassword?.message} id="c-confirm-error" />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-semibold">Are you hiring as an individual or a business?</legend>
          <Controller
            control={control}
            name="customerType"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 md:grid-cols-2">
                {[
                  { value: 'individual', label: 'Individual' },
                  { value: 'business', label: 'Business or studio' },
                ].map((o) => (
                  <Label key={o.value} htmlFor={`ct-${o.value}`} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-4 has-[[data-state=checked]]:border-primary">
                    <RadioGroupItem value={o.value} id={`ct-${o.value}`} data-testid={`customer-type-${o.value}`} /> {o.label}
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
        </fieldset>

        {customerType === 'business' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-business">Business name</Label>
            <Input id="c-business" aria-invalid={Boolean(err.businessName)} {...register('businessName')} className="max-w-xl bg-card" />
            <FieldError message={err.businessName?.message} id="c-business-error" />
          </div>
        ) : null}

        <Controller
          control={control}
          name="neighborhood"
          render={({ field }) => (
            <NeighborhoodSelect id="c-neighborhood" label="Usual shoot neighbourhood (optional)" value={field.value} onValueChange={field.onChange} error={err.neighborhood?.message} placeholder="Choose a neighbourhood later" />
          )}
        />

        <Controller
          control={control}
          name="interests"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-semibold">What content do you make? (optional)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {CUSTOMER_INTEREST_OPTIONS.map((interest) => (
                  <label key={interest} className="flex cursor-pointer items-center gap-3 text-sm">
                    <Checkbox
                      checked={field.value.includes(interest)}
                      onCheckedChange={(checked) => field.onChange(checked === true ? [...field.value, interest] : field.value.filter((i) => i !== interest))}
                      aria-label={interest}
                    />
                    {interest}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        />

        <Controller
          control={control}
          name="bio"
          render={({ field }) => (
            <WordCountField
              id="c-bio"
              label="About you or your business (optional, up to 350 words)"
              value={field.value}
              onChange={field.onChange}
              error={err.bio?.message}
              hint="Describe yourself or your business, the content you make, and the projects you want to create."
              placeholder="We are a…"
            />
          )}
        />

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox id="c-terms" checked={watch('acceptTerms') === true} onCheckedChange={(c) => form.setValue('acceptTerms', c === true, { shouldValidate: true })} data-testid="accept-terms" />
          <span>I agree to the <Link to="/terms" className="underline underline-offset-4">Terms and Conditions</Link>, the <Link to="/policies/refund-and-cancellation" className="underline underline-offset-4">Refund and Cancellation Policy</Link>, and the Los Angeles service area.</span>
        </label>
        <FieldError message={err.acceptTerms?.message} id="c-terms-error" />

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={formState.isSubmitting} data-testid="create-customer">{formState.isSubmitting ? 'Creating account…' : 'Create customer account'}</Button>
          <Link to="/login" className="text-sm underline underline-offset-4">I already have an account</Link>
        </div>
      </form>
    </div>
  );
}

type CreatorValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  services: 'photography' | 'videography' | 'both';
  specialties: string[];
  styles: string[];
  neighborhoods: string[];
  citywide: boolean;
  packageService: 'photography' | 'videography';
  packageName: string;
  packageHours: number;
  packagePriceCents: number;
  bio: string;
  seekingClients: boolean;
  acceptTerms: boolean;
};

export function SignupCreator() {
  const { setUser } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [specialtiesText, setSpecialtiesText] = useState('');
  const form = useForm<CreatorValues>({
    resolver: zodResolver(creatorSignupSchema) as unknown as Resolver<CreatorValues>,
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      services: 'photography',
      specialties: [],
      styles: [],
      neighborhoods: [],
      citywide: false,
      packageService: 'photography',
      packageName: '',
      packageHours: 4,
      packagePriceCents: 80000,
      bio: '',
      seekingClients: true,
      acceptTerms: false,
    },
  });
  const { register, handleSubmit, control, watch, formState, setError, setValue, getValues } = form;
  const services = watch('services');
  const mapErrors = useServerErrors<CreatorValues>(setError);
  const err = formState.errors;

  const onValid = async (values: CreatorValues) => {
    setFormError(null);
    try {
      const data = await api.post<{ user: SessionUser }>('/api/auth/signup/creator', values);
      setUser(data.user);
      navigate(nextPath(params, '/dashboard'));
    } catch (error) {
      mapErrors(error, setFormError);
    }
  };
  const onInvalid = () => {
    const v = getValues();
    if (v.password !== v.confirmPassword) setError('confirmPassword', { message: 'Passwords do not match.' });
    if (!v.citywide && v.neighborhoods.length === 0) {
      setError('neighborhoods', { message: 'Choose at least one neighbourhood, or All of Los Angeles.' });
    }
    if (v.services !== 'both' && v.packageService !== v.services) {
      setError('packageService', { message: 'Your first package must match the service you offer.' });
    }
  };
  const submit = handleSubmit(onValid, onInvalid);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-14 md:px-8 md:py-20">
      <Eyebrow>Creator account</Eyebrow>
      <h1 className="mt-5 text-5xl font-black uppercase leading-[0.92] tracking-tight md:text-6xl">Find clients in Los Angeles</h1>
      <p className="mt-5 max-w-2xl text-muted-foreground">Set up your profile with one package. Add portfolio work, availability and more after you sign up.</p>

      <form onSubmit={submit} noValidate className="mt-12 flex flex-col gap-9" aria-label="Creator sign up" data-testid="signup-creator-form">
        {formError ? <ErrorAlert message={formError} /> : null}

        <fieldset className="grid gap-6 md:grid-cols-2">
          <legend className="sr-only">Account details</legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-name">Full name or studio name</Label>
            <Input id="cr-name" autoComplete="name" aria-invalid={Boolean(err.name)} {...register('name')} className="bg-card" />
            <FieldError message={err.name?.message} id="cr-name-error" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-email">Email</Label>
            <Input id="cr-email" type="email" autoComplete="email" aria-invalid={Boolean(err.email)} {...register('email')} className="bg-card" />
            <FieldError message={err.email?.message} id="cr-email-error" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-password">Password</Label>
            <Input id="cr-password" type="password" autoComplete="new-password" aria-invalid={Boolean(err.password)} {...register('password')} className="bg-card" />
            <FieldError message={err.password?.message} id="cr-password-error" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-confirm">Confirm password</Label>
            <Input id="cr-confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(err.confirmPassword)} {...register('confirmPassword')} className="bg-card" />
            <FieldError message={err.confirmPassword?.message} id="cr-confirm-error" />
          </div>
        </fieldset>

        <Controller
          control={control}
          name="services"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-2 text-sm font-semibold">What do you offer?</legend>
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 md:grid-cols-3">
                {[
                  { value: 'photography', label: 'Photography' },
                  { value: 'videography', label: 'Videography' },
                  { value: 'both', label: 'Both' },
                ].map((o) => (
                  <Label key={o.value} htmlFor={`sv-${o.value}`} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-4 has-[[data-state=checked]]:border-primary">
                    <RadioGroupItem value={o.value} id={`sv-${o.value}`} data-testid={`service-${o.value}`} /> {o.label}
                  </Label>
                ))}
              </RadioGroup>
              <FieldError message={err.services?.message} id="cr-services-error" />
            </fieldset>
          )}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="cr-specialties">Specialties (comma separated)</Label>
          <Input
            id="cr-specialties"
            value={specialtiesText}
            placeholder="Product & e-commerce, Editorial, Architecture"
            onChange={(e) => setSpecialtiesText(e.target.value)}
            onBlur={() => setValue('specialties', specialtiesText.split(',').map((s) => s.trim()).filter(Boolean), { shouldValidate: true })}
            aria-invalid={Boolean(err.specialties)}
            className="bg-card"
            data-testid="specialties-input"
          />
          <FieldError message={err.specialties?.message as string | undefined} id="cr-specialties-error" />
        </div>

        <Controller
          control={control}
          name="styles"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-semibold">Visual styles (1 to 4)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {STYLE_OPTIONS.map((style) => (
                  <label key={style} className="flex cursor-pointer items-center gap-3 text-sm">
                    <Checkbox
                      checked={field.value.includes(style)}
                      onCheckedChange={(checked) => {
                        const next = checked === true ? [...field.value, style] : field.value.filter((s) => s !== style);
                        if (next.length <= 4) field.onChange(next);
                      }}
                      aria-label={style}
                    />
                    {style}
                  </label>
                ))}
              </div>
              <FieldError message={err.styles?.message} id="cr-styles-error" />
            </fieldset>
          )}
        />

        <Controller
          control={control}
          name="neighborhoods"
          render={({ field }) => (
            <Controller
              control={control}
              name="citywide"
              render={({ field: citywideField }) => (
                <NeighborhoodCheckboxes
                  selected={field.value}
                  onSelectedChange={field.onChange}
                  citywide={citywideField.value}
                  onCitywideChange={citywideField.onChange}
                  error={err.neighborhoods?.message ?? null}
                  idPrefix="cr-coverage"
                />
              )}
            />
          )}
        />

        <fieldset className="grid gap-6 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Your first package</legend>
          <Controller
            control={control}
            name="packageService"
            render={({ field }) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="cr-pkg-service">Service</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="cr-pkg-service" className="w-full bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(services === 'videography' ? ['videography'] : services === 'photography' ? ['photography'] : ['photography', 'videography']).map((s) => (
                      <SelectItem key={s} value={s}>{s === 'photography' ? 'Photography' : 'Videography'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={err.packageService?.message} id="cr-pkg-service-error" />
              </div>
            )}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-pkg-name">Package name</Label>
            <Input id="cr-pkg-name" placeholder="Half-day shoot" aria-invalid={Boolean(err.packageName)} {...register('packageName')} className="bg-card" />
            <FieldError message={err.packageName?.message} id="cr-pkg-name-error" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-pkg-hours">Hours on location</Label>
            <Input id="cr-pkg-hours" type="number" min={0.5} max={24} step={0.5} aria-invalid={Boolean(err.packageHours)} {...register('packageHours', { valueAsNumber: true })} className="bg-card" />
            <FieldError message={err.packageHours?.message} id="cr-pkg-hours-error" />
          </div>
          <Controller
            control={control}
            name="packagePriceCents"
            render={({ field }) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="cr-pkg-price">Package price (USD)</Label>
                <Input
                  id="cr-pkg-price"
                  type="number"
                  min={50}
                  step={10}
                  value={Math.round(field.value / 100)}
                  onChange={(e) => field.onChange(Math.round(Number(e.target.value || 0) * 100))}
                  aria-invalid={Boolean(err.packagePriceCents)}
                  className="bg-card"
                />
                <FieldError message={err.packagePriceCents?.message} id="cr-pkg-price-error" />
              </div>
            )}
          />
        </fieldset>

        <Controller
          control={control}
          name="bio"
          render={({ field }) => (
            <WordCountField
              id="cr-bio"
              label="Biography (optional, up to 350 words)"
              value={field.value}
              onChange={field.onChange}
              error={err.bio?.message}
              hint="Describe your experience, specialties, creative approach and working style."
              placeholder="I photograph…"
            />
          )}
        />

        <Controller
          control={control}
          name="seekingClients"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center justify-between gap-6 rounded-md border border-border bg-card p-5">
              <span>
                <span className="block font-semibold">I am seeking new clients</span>
                <span className="text-sm text-muted-foreground">Turn off to hide yourself from matching while you are booked.</span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Seeking new clients" />
            </label>
          )}
        />

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox checked={watch('acceptTerms') === true} onCheckedChange={(c) => form.setValue('acceptTerms', c === true, { shouldValidate: true })} data-testid="accept-terms" />
          <span>I agree to the <Link to="/terms" className="underline underline-offset-4">Terms and Conditions</Link>, the <Link to="/policies/refund-and-cancellation" className="underline underline-offset-4">Refund and Cancellation Policy</Link>, and to working in the Los Angeles service area. These platform guarantees apply to every booking, even if a profile or project term says otherwise.</span>
        </label>
        <FieldError message={err.acceptTerms?.message} id="cr-terms-error" />

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={formState.isSubmitting} data-testid="create-creator">{formState.isSubmitting ? 'Creating account…' : 'Create creator account'}</Button>
          <Link to="/login" className="text-sm underline underline-offset-4">I already have an account</Link>
        </div>
      </form>
    </div>
  );
}
