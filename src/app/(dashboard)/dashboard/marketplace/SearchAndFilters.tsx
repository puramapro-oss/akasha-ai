'use client'

// =============================================================================
// AKASHA AI — SearchAndFilters
// Barre de recherche et filtres marketplace
// =============================================================================

import { Search } from 'lucide-react';
import { FILTER_LABELS } from './marketplace-constants';
import type { FilterType } from './marketplace-types';

interface SearchAndFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: FilterType;
  onFilterChange: (value: FilterType) => void;
}

export default function SearchAndFilters({
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: SearchAndFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input aria-label="Rechercher un agent..."
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher un agent..."
          className="w-full rounded-xl border border-[var(--border)] bg-white/5 py-2.5 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--cyan)] focus:outline-none"
          data-testid="marketplace-search"
        />
      </div>
      <div className="flex gap-1 rounded-xl bg-white/5 p-1">
        {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            data-testid={`filter-${f}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === f
                ? 'bg-[var(--cyan)] text-black'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>
    </div>
  );
}
