import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NeighborhoodSelect } from '@/components/marketplace/NeighborhoodSelect';
import {
  BUDGET_FILTER_OPTIONS,
  DEFAULT_BOARD_FILTERS,
  isDefaultBoardFilters,
  ROLE_FILTER_OPTIONS,
  type BoardFilters,
  type BudgetFilter,
  type RoleFilter,
} from '../../../shared/project-board';

/** Location, role and budget filters. They apply to the demonstration projects and to the live open calls. */
export function BoardFilterBar({ value, onChange }: { value: BoardFilters; onChange: (next: BoardFilters) => void }) {
  return (
    <section aria-label="Filter projects" className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6 md:flex-row md:flex-wrap md:items-end md:gap-6">
      <p className="w-full text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Filter projects. These filters apply to both sections.</p>

      <div className="flex flex-col gap-2 md:min-w-[220px] md:flex-1">
        <Label htmlFor="board-role" className="text-sm font-semibold">Role needed</Label>
        <Select value={value.role} onValueChange={(role) => onChange({ ...value, role: role as RoleFilter })}>
          <SelectTrigger id="board-role" className="w-full bg-background" data-testid="board-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="md:min-w-[260px] md:flex-1">
        <NeighborhoodSelect
          id="board-neighborhood"
          label="Neighbourhood"
          value={value.neighborhood}
          includeAny
          testId="board-neighborhood"
          onValueChange={(neighborhood) => onChange({ ...value, neighborhood })}
        />
      </div>

      <div className="flex flex-col gap-2 md:min-w-[220px] md:flex-1">
        <Label htmlFor="board-budget" className="text-sm font-semibold">Total budget</Label>
        <Select value={value.budget} onValueChange={(budget) => onChange({ ...value, budget: budget as BudgetFilter })}>
          <SelectTrigger id="board-budget" className="w-full bg-background" data-testid="board-budget">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUDGET_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isDefaultBoardFilters(value) ? null : (
        <Button variant="outline" onClick={() => onChange(DEFAULT_BOARD_FILTERS)} data-testid="reset-filters">
          Reset filters
        </Button>
      )}
    </section>
  );
}
