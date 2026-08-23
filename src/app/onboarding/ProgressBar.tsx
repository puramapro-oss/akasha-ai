'use client'

// =============================================================================
// AKASHA AI — ProgressBar onboarding
// =============================================================================

import { Check } from 'lucide-react';

interface ProgressBarProps {
  step: number;
}

export default function ProgressBar({ step }: ProgressBarProps) {
  return (
    <div className="w-full max-w-lg mb-10" data-testid="onboarding-progress">
      <div className="flex items-center justify-between mb-3">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                step > s
                  ? 'bg-[var(--cyan)] text-black'
                  : step === s
                    ? 'bg-[var(--cyan)]/20 text-[var(--cyan)] border border-[var(--cyan)]'
                    : 'bg-white/5 text-[var(--text-muted)] border border-[var(--border)]'
              }`}
            >
              {step > s ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 4 && (
              <div className={`h-0.5 w-16 sm:w-24 mx-1 transition-all duration-500 ${step > s ? 'bg-[var(--cyan)]' : 'bg-[var(--border)]'}`} />
            )}
          </div>
        ))}
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] rounded-full transition-all duration-500"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>
    </div>
  );
}
