import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AvailabilityCalendar } from '@/components/marketplace/AvailabilityCalendar';
import { BiographyEditor } from '@/components/marketplace/BiographyEditor';
import { NeighborhoodCheckboxes, NeighborhoodSelect, ANY_NEIGHBORHOOD } from '@/components/marketplace/NeighborhoodSelect';
import { PortfolioGrid } from '@/components/marketplace/PortfolioGrid';
import { ErrorAlert, FieldError, LoadingBlock, PageHeader } from '@/components/site/ui-bits';
import { api, errorMessage, uploadFile } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useApi } from '@/lib/use-api';
import { formatUsd } from '../../shared/money';
import { CUSTOMER_INTEREST_OPTIONS, MAX_PACKAGE_CENTS, MIN_PACKAGE_CENTS, STYLE_OPTIONS, WEEKDAY_OPTIONS, SERVICE_KIND_LABEL } from '../../shared/constants';
import { creatorProfileSchema, customerProfileSchema, packageSchema, portfolioItemSchema } from '../../shared/schemas';
import type { CreatorPackage, CreatorProfile, CustomerProfile, PortfolioItem, SessionUser } from '../../shared/types';
import { Link as RouterLink } from 'react-router';

interface ProfileResponse {
  user: SessionUser;
  profile: CreatorProfile | CustomerProfile | null;
  checklist: Array<{ label: string; done: boolean; href: string }>;
}

function Saved({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="status" className="text-sm font-semibold">{message}</p>;
}

/* ---------------------------- Services and coverage ---------------------------- */

function CoverageForm({ profile, onSaved }: { profile: CreatorProfile; onSaved: () => void }) {
  const [services, setServices] = useState(profile.services);
  const [specialtiesText, setSpecialtiesText] = useState(profile.specialties.join(', '));
  const [styles, setStyles] = useState<string[]>(profile.styles);
  const [neighborhoods, setNeighborhoods] = useState<string[]>(profile.neighborhoods);
  const [citywide, setCitywide] = useState(profile.citywide);
  const [seeking, setSeeking] = useState(profile.seekingClients);
  const [years, setYears] = useState(profile.yearsExperience);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const save = async () => {
    setSaved(null);
    setFormError(null);
    const payload = {
      services,
      specialties: specialtiesText.split(',').map((s) => s.trim()).filter(Boolean),
      styles,
      neighborhoods,
      citywide,
      seekingClients: seeking,
      yearsExperience: years,
      weekdays: profile.weekdays,
      typicalHours: profile.typicalHours,
    };
    const parsed = creatorProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { if (!map[String(i.path[0] ?? 'form')]) map[String(i.path[0] ?? 'form')] = i.message; });
      setErrors(map);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.put('/api/me/creator-profile', payload);
      setSaved('Saved. Your coverage and services are updated.');
      onSaved();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8" data-testid="coverage-form">
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-semibold">What do you offer?</Label>
        <RadioGroup value={services} onValueChange={(v) => setServices(v as CreatorProfile['services'])} className="grid gap-3 sm:grid-cols-3">
          {[
            { value: 'photography', label: 'Photography' },
            { value: 'videography', label: 'Videography' },
            { value: 'both', label: 'Both' },
          ].map((o) => (
            <Label key={o.value} htmlFor={`cov-svc-${o.value}`} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-4 has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value={o.value} id={`cov-svc-${o.value}`} data-testid={`profile-service-${o.value}`} /> {o.label}
            </Label>
          ))}
        </RadioGroup>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cov-specialties">Specialties (comma separated)</Label>
        <Input id="cov-specialties" value={specialtiesText} onChange={(e) => setSpecialtiesText(e.target.value)} className="bg-card" aria-invalid={Boolean(errors.specialties)} />
        <FieldError message={errors.specialties} />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Visual styles (1 to 4)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {STYLE_OPTIONS.map((style) => (
            <label key={style} className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox checked={styles.includes(style)} onCheckedChange={(c) => {
                const next = c === true ? [...styles, style] : styles.filter((s) => s !== style);
                if (next.length <= 4) setStyles(next);
              }} aria-label={style} />
              {style}
            </label>
          ))}
        </div>
        <FieldError message={errors.styles} />
      </fieldset>
      <NeighborhoodCheckboxes selected={neighborhoods} onSelectedChange={setNeighborhoods} citywide={citywide} onCitywideChange={setCitywide} error={errors.neighborhoods ?? null} idPrefix="profile-coverage" />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cov-years">Years of experience</Label>
          <Input id="cov-years" type="number" min={0} max={60} value={years} onChange={(e) => setYears(Number(e.target.value))} className="bg-card" />
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
          <span className="text-sm"><span className="block font-semibold">Seeking clients</span>Turn off to hide yourself from matching.</span>
          <input type="checkbox" className="size-5 accent-[#E12325]" checked={seeking} onChange={(e) => setSeeking(e.target.checked)} aria-label="Seeking clients" data-testid="profile-seeking" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={save} disabled={saving} data-testid="save-coverage">{saving ? 'Saving…' : 'Save services and coverage'}</Button>
        <Saved message={saved} />
      </div>
      {formError ? <ErrorAlert message={formError} /> : null}
    </div>
  );
}

/* ---------------------------- Packages and rates ---------------------------- */

interface PackageDraft {
  key: string;
  id?: string;
  service: 'photography' | 'videography';
  name: string;
  hours: number;
  priceDollars: number;
  deliverables: string;
}

function PackagesForm({ packages, onSaved }: { packages: CreatorPackage[]; onSaved: () => void }) {
  const toDraft = (p: CreatorPackage): PackageDraft => ({
    key: p.id,
    id: p.id,
    service: p.service,
    name: p.name,
    hours: p.hours,
    priceDollars: Math.round(p.priceCents / 100),
    deliverables: p.deliverables,
  });
  const [rows, setRows] = useState<PackageDraft[]>(packages.map(toDraft));
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<PackageDraft>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaved(null);
    setFormError(null);
    const nextErrors: Record<string, Record<string, string>> = {};
    const payload = rows.map((r) => {
      const candidate = { id: r.id, service: r.service, name: r.name, hours: Number(r.hours), priceCents: Math.round(Number(r.priceDollars) * 100), deliverables: r.deliverables };
      const parsed = packageSchema.safeParse(candidate);
      if (!parsed.success) {
        nextErrors[r.key] = {};
        parsed.error.issues.forEach((i) => { if (!nextErrors[r.key][String(i.path[0])]) nextErrors[r.key][String(i.path[0])] = i.message; });
      }
      return candidate;
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      await api.put('/api/me/packages', { packages: payload });
      setSaved('Saved. Your packages and prices are live.');
      onSaved();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-8" data-testid="packages-form">
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Packages are the prices clients see in matching. Each package states the hours on location and what the client receives. Prices start at {formatUsd(MIN_PACKAGE_CENTS)}.
      </p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No packages yet. Add one so clients can see your price.</p> : null}
      <ul className="flex flex-col gap-6">
        {rows.map((row, index) => (
          <li key={row.key} className="grid gap-5 rounded-lg border border-border bg-card p-6 md:grid-cols-2" data-testid="package-row">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pkg-service-${index}`}>Service</Label>
              <Select value={row.service} onValueChange={(v) => update(row.key, { service: v as PackageDraft['service'] })}>
                <SelectTrigger id={`pkg-service-${index}`} className="w-full bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="photography">Photography</SelectItem>
                  <SelectItem value="videography">Videography</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pkg-name-${index}`}>Package name</Label>
              <Input id={`pkg-name-${index}`} value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} className="bg-background" aria-invalid={Boolean(errors[row.key]?.name)} />
              <FieldError message={errors[row.key]?.name} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pkg-hours-${index}`}>Hours on location</Label>
              <Input id={`pkg-hours-${index}`} type="number" min={0.5} max={24} step={0.5} value={row.hours} onChange={(e) => update(row.key, { hours: Number(e.target.value) })} className="bg-background" aria-invalid={Boolean(errors[row.key]?.hours)} />
              <FieldError message={errors[row.key]?.hours} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pkg-price-${index}`}>Price (USD)</Label>
              <Input id={`pkg-price-${index}`} type="number" min={50} max={Math.round(MAX_PACKAGE_CENTS / 100)} step={10} value={row.priceDollars} onChange={(e) => update(row.key, { priceDollars: Number(e.target.value) })} className="bg-background" aria-invalid={Boolean(errors[row.key]?.priceCents)} />
              <FieldError message={errors[row.key]?.priceCents} />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor={`pkg-deliverables-${index}`}>What the client receives</Label>
              <Textarea id={`pkg-deliverables-${index}`} rows={2} value={row.deliverables} onChange={(e) => update(row.key, { deliverables: e.target.value })} className="bg-background" />
            </div>
            <div className="md:col-span-2 flex items-center justify-between gap-4">
              <Badge variant="outline" className="rounded-sm">{SERVICE_KIND_LABEL[row.service]}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))} aria-label={`Remove package ${row.name || index + 1}`}>
                <Trash2 aria-hidden /> Remove package
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="outline"
          disabled={rows.length >= 8}
          onClick={() => setRows((prev) => [...prev, { key: `new-${crypto.randomUUID()}`, service: 'photography', name: '', hours: 4, priceDollars: 800, deliverables: '' }])}
          data-testid="add-package"
        >
          <Plus aria-hidden /> Add package
        </Button>
        <Button onClick={save} disabled={saving} data-testid="save-packages">{saving ? 'Saving…' : 'Save packages'}</Button>
        <Saved message={saved} />
      </div>
      {formError ? <ErrorAlert message={formError} /> : null}
    </div>
  );
}

/* ---------------------------- Portfolio ---------------------------- */

function PortfolioManager({ items, onChanged }: { items: PortfolioItem[]; onChanged: () => void }) {
  const [kind, setKind] = useState<'photo' | 'video'>('photo');
  const [title, setTitle] = useState('');
  const [contribution, setContribution] = useState('');
  const [projectLabel, setProjectLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState(items);

  useEffect(() => setLocalItems(items), [items]);

  const submit = async () => {
    setMessage(null);
    setFormError(null);
    const next: Record<string, string> = {};
    if (!file) next.file = 'Choose a file to upload.';
    const parsed = portfolioItemSchema.safeParse({ kind, title, contribution, projectLabel, mediaUrl: '/uploads/pending' });
    if (!parsed.success) parsed.error.issues.forEach((i) => { if (!next[String(i.path[0])]) next[String(i.path[0])] = i.message; });
    if (file && kind === 'photo' && !file.type.startsWith('image/')) next.file = 'Photos must be JPG, PNG or WebP.';
    if (file && kind === 'video' && !file.type.startsWith('video/')) next.file = 'Videos must be MP4, WebM or MOV.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !file) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile(file);
      await api.post('/api/me/portfolio', { kind, title, contribution, projectLabel, mediaUrl: uploaded.url, posterUrl: null });
      setTitle('');
      setContribution('');
      setProjectLabel('');
      setFile(null);
      setMessage('Added to your portfolio.');
      onChanged();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: PortfolioItem) => {
    try {
      await api.delete(`/api/me/portfolio/${item.id}`);
      setLocalItems((prev) => prev.filter((i) => i.id !== item.id));
      onChanged();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const photos = localItems.filter((i) => i.kind === 'photo');
  const videos = localItems.filter((i) => i.kind === 'video');

  return (
    <div className="flex flex-col gap-12" data-testid="portfolio-manager">
      <form className="grid max-w-4xl gap-6 rounded-lg border border-border bg-card p-6 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate aria-labelledby="upload-title">
        <h2 id="upload-title" className="text-lg font-black uppercase tracking-tight md:col-span-2">Add work to your portfolio</h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pf-kind">Type of work</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as 'photo' | 'video')}>
            <SelectTrigger id="pf-kind" className="w-full bg-background" data-testid="pf-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="photo">Photography</SelectItem>
              <SelectItem value="video">Videography</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pf-file">File (JPG, PNG, WebP, MP4, WebM or MOV)</Label>
          <Input id="pf-file" type="file" accept={kind === 'photo' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm,video/quicktime'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="bg-background file:mr-3 file:rounded-sm file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" data-testid="pf-file" aria-invalid={Boolean(errors.file)} />
          <p className="text-xs text-muted-foreground">Photos up to 8 MB; videos up to 25 MB in this demonstration environment.</p>
          <FieldError message={errors.file} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pf-title">Title</Label>
          <Input id="pf-title" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background" aria-invalid={Boolean(errors.title)} data-testid="pf-title" />
          <FieldError message={errors.title} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pf-project">Project label (optional)</Label>
          <Input id="pf-project" value={projectLabel} onChange={(e) => setProjectLabel(e.target.value)} placeholder="Campaign · Arts District" className="bg-background" />
        </div>
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="pf-contribution">Your contribution</Label>
          <Textarea id="pf-contribution" rows={3} value={contribution} onChange={(e) => setContribution(e.target.value)} placeholder="What did you plan, shoot, edit or direct?" className="bg-background" />
          <FieldError message={errors.contribution} />
        </div>
        <div className="flex flex-wrap items-center gap-4 md:col-span-2">
          <Button type="submit" disabled={busy} data-testid="pf-submit"><Upload aria-hidden /> {busy ? 'Uploading…' : 'Add to portfolio'}</Button>
          {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
        </div>
        {formError ? <div className="md:col-span-2"><ErrorAlert message={formError} /></div> : null}
      </form>

      <section aria-labelledby="pf-photos" className="flex flex-col gap-6">
        <h2 id="pf-photos" className="text-xl font-black uppercase tracking-tight">Photography</h2>
        <PortfolioGrid items={photos} kind="photo" emptyTitle="No photography yet" emptyBody="Add photography so clients can see your eye and your process." onRemove={remove} />
      </section>
      <section aria-labelledby="pf-videos" className="flex flex-col gap-6">
        <h2 id="pf-videos" className="text-xl font-black uppercase tracking-tight">Videography</h2>
        <PortfolioGrid items={videos} kind="video" emptyTitle="No videography yet" emptyBody="Upload a showreel or a project film. Uploaded videos play on your profile." onRemove={remove} />
      </section>
    </div>
  );
}

/* ---------------------------- Availability ---------------------------- */

function AvailabilityForm({ profile, onSaved }: { profile: CreatorProfile; onSaved: () => void }) {
  const [weekdays, setWeekdays] = useState<number[]>(profile.weekdays);
  const [hours, setHours] = useState(profile.typicalHours);
  const [dates, setDates] = useState<string[]>(profile.availableDates);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaved(null);
    setFormError(null);
    setError(null);
    if (hours && !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(hours)) {
      setError('Use HH:MM-HH:MM for your usual hours, for example 09:00-17:00.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/me/creator-profile', {
        services: profile.services,
        specialties: profile.specialties,
        styles: profile.styles,
        neighborhoods: profile.neighborhoods,
        citywide: profile.citywide,
        seekingClients: profile.seekingClients,
        yearsExperience: profile.yearsExperience,
        weekdays,
        typicalHours: hours,
      });
      await api.put('/api/me/availability', { dates });
      setSaved('Saved. Your availability is live on your profile.');
      onSaved();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-10" data-testid="availability-form">
      <div className="grid gap-10 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-8">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">Usual working days</legend>
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_OPTIONS.map((d) => (
                <label key={d.value} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm has-[[data-state=checked]]:border-primary">
                  <Checkbox checked={weekdays.includes(d.value)} onCheckedChange={(c) => setWeekdays((prev) => (c === true ? [...prev, d.value].sort() : prev.filter((x) => x !== d.value)))} aria-label={d.label} data-testid={`weekday-${d.label}`} />
                  {d.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex max-w-xs flex-col gap-2">
            <Label htmlFor="av-hours">Usual hours</Label>
            <Input id="av-hours" value={hours} placeholder="09:00-17:00" onChange={(e) => setHours(e.target.value)} className="bg-card" data-testid="typical-hours" />
            <p className="text-xs text-muted-foreground">Format HH:MM-HH:MM, or leave blank.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={save} disabled={saving} data-testid="save-availability">{saving ? 'Saving…' : 'Save availability'}</Button>
            <Saved message={saved} />
          </div>
          <FieldError message={error} />
          {formError ? <ErrorAlert message={formError} /> : null}
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Specific dates you can take</p>
          <p className="max-w-sm text-xs text-muted-foreground">Select the dates you are free. Booked dates are struck through and cannot be changed here.</p>
          <AvailabilityCalendar available={dates} booked={profile.bookedDates} onChange={setDates} testId="owner-calendar" />
          <p className="text-xs text-muted-foreground" data-testid="available-count">{dates.length} specific date{dates.length === 1 ? '' : 's'} selected</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Customer business ---------------------------- */

function BusinessForm({ profile, onSaved }: { profile: CustomerProfile; onSaved: () => void }) {
  const [customerType, setCustomerType] = useState(profile.customerType);
  const [businessName, setBusinessName] = useState(profile.businessName);
  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [neighborhood, setNeighborhood] = useState(profile.neighborhood || ANY_NEIGHBORHOOD);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const save = async () => {
    setSaved(null);
    setFormError(null);
    const payload = {
      customerType,
      businessName,
      interests,
      neighborhood: neighborhood === ANY_NEIGHBORHOOD ? '' : neighborhood,
    };
    const parsed = customerProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { if (!map[String(i.path[0] ?? 'form')]) map[String(i.path[0] ?? 'form')] = i.message; });
      setErrors(map);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.put('/api/me/customer-profile', payload);
      setSaved('Saved. Your business details are updated.');
      onSaved();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8" data-testid="business-form">
      <RadioGroup value={customerType} onValueChange={(v) => setCustomerType(v as 'individual' | 'business')} className="grid gap-3 sm:grid-cols-2">
        {[{ value: 'individual', label: 'Individual' }, { value: 'business', label: 'Business or studio' }].map((o) => (
          <Label key={o.value} htmlFor={`bt-${o.value}`} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-4 has-[[data-state=checked]]:border-primary">
            <RadioGroupItem value={o.value} id={`bt-${o.value}`} /> {o.label}
          </Label>
        ))}
      </RadioGroup>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bf-business">Business name</Label>
        <Input id="bf-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="bg-card" aria-invalid={Boolean(errors.businessName)} />
        <FieldError message={errors.businessName} />
      </div>
      <NeighborhoodSelect id="bf-neighborhood" label="Usual shoot neighbourhood" value={neighborhood} includeAny onValueChange={setNeighborhood} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Content you make</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {CUSTOMER_INTEREST_OPTIONS.map((i) => (
            <label key={i} className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox checked={interests.includes(i)} onCheckedChange={(c) => setInterests((prev) => (c === true ? [...prev, i] : prev.filter((x) => x !== i)))} aria-label={i} />
              {i}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={save} disabled={saving} data-testid="save-business">{saving ? 'Saving…' : 'Save business details'}</Button>
        <Saved message={saved} />
      </div>
      {formError ? <ErrorAlert message={formError} /> : null}
      <p className="text-sm text-muted-foreground">Public profile: <RouterLink className="underline underline-offset-4" to={`/customers/${profile.user.id}`}>view as others see it</RouterLink>.</p>
    </div>
  );
}

/* ---------------------------- Page ---------------------------- */

export function ProfileEditor() {
  const { user } = useApp();
  const state = useApi(() => api.get<ProfileResponse>('/api/me/profile'), [user?.id]);

  if (!user) return null;
  // Show the loading state only before the first load. Reloading after a save keeps the form mounted,
  // so the success message and the active tab survive.
  if (!state.data && state.loading) return <LoadingBlock label="Loading your profile" />;
  if (!state.data) return <div className="mx-auto max-w-3xl px-5 py-20"><ErrorAlert message={state.error ?? 'Your profile could not load.'} onRetry={state.reload} /></div>;

  const isCreator = user.role === 'creator';
  const profile = state.data.profile;
  const creator = isCreator ? (profile as CreatorProfile) : null;
  const customer = !isCreator ? (profile as CustomerProfile) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader
        eyebrow={isCreator ? 'Creator profile' : 'Client profile'}
        title={isCreator ? 'Profile and portfolio' : 'Your profile'}
        description={isCreator ? 'Your biography, services and coverage, packages with clear prices, portfolio, and availability. Everything here appears on your public profile.' : 'Your biography, business details and the content you make. Creators read this when they review your brief.'}
        actions={
          <Button asChild variant="outline">
            <Link to={isCreator ? `/creators/${user.id}` : `/customers/${user.id}`}>View public profile</Link>
          </Button>
        }
      />

      <Tabs defaultValue="biography" className="mt-10 gap-10" data-testid="profile-editor">
        <TabsList className="flex group-data-horizontal/tabs:h-auto w-full flex-wrap justify-start gap-2 rounded-none border-b border-border bg-transparent p-0 pb-2">
          <TabsTrigger value="biography" className="h-auto rounded-sm border border-border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10">Biography</TabsTrigger>
          {isCreator ? (
            <>
              <TabsTrigger value="coverage" className="h-auto rounded-sm border border-border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10">Services and coverage</TabsTrigger>
              <TabsTrigger value="packages" className="h-auto rounded-sm border border-border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10">Packages and rates</TabsTrigger>
              <TabsTrigger value="portfolio" className="h-auto rounded-sm border border-border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10">Portfolio</TabsTrigger>
              <TabsTrigger value="availability" className="h-auto rounded-sm border border-border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10">Availability</TabsTrigger>
            </>
          ) : (
            <TabsTrigger value="business" className="h-auto rounded-sm border border-border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10">Business details</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="biography" className="max-w-3xl">
          <BiographyEditor user={user} />
        </TabsContent>
        {creator ? (
          <>
            <TabsContent value="coverage"><CoverageForm profile={creator} onSaved={state.reload} /></TabsContent>
            <TabsContent value="packages"><PackagesForm packages={creator.packages} onSaved={state.reload} /></TabsContent>
            <TabsContent value="portfolio"><PortfolioManager items={creator.portfolio} onChanged={state.reload} /></TabsContent>
            <TabsContent value="availability"><AvailabilityForm profile={creator} onSaved={state.reload} /></TabsContent>
          </>
        ) : null}
        {customer ? <TabsContent value="business"><BusinessForm profile={customer} onSaved={state.reload} /></TabsContent> : null}
      </Tabs>
    </div>
  );
}
