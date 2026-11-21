import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldError } from '@/components/site/ui-bits';
import { CITYWIDE_LABEL, neighborhoodsByRegion, SERVICE_AREA_NAME } from '../../../shared/service-area';

export const ANY_NEIGHBORHOOD = 'any';

/** Single choice of a Los Angeles neighbourhood, grouped by region. Nothing outside LA can be picked. */
export function NeighborhoodSelect({
  id,
  label,
  value,
  onValueChange,
  includeAny = false,
  placeholder = 'Choose a Los Angeles neighbourhood',
  error,
  testId,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  includeAny?: boolean;
  placeholder?: string;
  error?: string | null;
  testId?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} aria-invalid={Boolean(error)} className="w-full bg-card" data-testid={testId ?? 'neighborhood-select'}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {includeAny ? <SelectItem value={ANY_NEIGHBORHOOD}>Any {SERVICE_AREA_NAME} neighbourhood</SelectItem> : null}
          {neighborhoodsByRegion().map((group) => (
            <SelectGroup key={group.region}>
              <SelectLabel>{group.region}</SelectLabel>
              {group.names.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError message={error} />
    </div>
  );
}

/** Multiple coverage areas for creators, with an "All of Los Angeles" option. */
export function NeighborhoodCheckboxes({
  selected,
  citywide,
  onSelectedChange,
  onCitywideChange,
  error,
  idPrefix = 'coverage',
}: {
  selected: string[];
  citywide: boolean;
  onSelectedChange: (next: string[]) => void;
  onCitywideChange: (next: boolean) => void;
  error?: string | null;
  idPrefix?: string;
}) {
  const toggle = (name: string, checked: boolean) => {
    const next = checked ? [...selected, name] : selected.filter((n) => n !== name);
    onSelectedChange(next.sort());
  };
  return (
    <fieldset className="flex flex-col gap-5" aria-describedby={`${idPrefix}-error`}>
      <legend className="text-sm font-semibold">Los Angeles neighbourhoods you cover</legend>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-4">
        <Checkbox
          id={`${idPrefix}-citywide`}
          checked={citywide}
          onCheckedChange={(checked) => onCitywideChange(checked === true)}
          data-testid="citywide-checkbox"
        />
        <span className="flex flex-col">
          <span className="font-semibold">{CITYWIDE_LABEL}</span>
          <span className="text-sm text-muted-foreground">Available for projects anywhere in the City of Los Angeles.</span>
        </span>
      </label>
      <div className={citywide ? 'pointer-events-none grid gap-6 opacity-50 md:grid-cols-2' : 'grid gap-6 md:grid-cols-2'}>
        {neighborhoodsByRegion().map((group) => (
          <div key={group.region} className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.region}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.names.map((name) => {
                const checkedNow = selected.includes(name);
                return (
                  <label key={name} className="flex cursor-pointer items-center gap-2.5 rounded-sm py-1 text-sm hover:text-foreground">
                    <Checkbox
                      checked={checkedNow}
                      disabled={citywide}
                      onCheckedChange={(checked) => toggle(name, checked === true)}
                      aria-label={name}
                      data-testid={`coverage-${name}`}
                    />
                    <span>{name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <FieldError message={error} id={`${idPrefix}-error`} />
    </fieldset>
  );
}
