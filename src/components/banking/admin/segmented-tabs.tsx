'use client';

// Small segmented tab bar (pill style) shared by admin views.
import { cn } from '@/lib/utils';

export function SegmentedTabs({ items, value, onChange, className }: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1 p-1 rounded-lg bg-muted/70 overflow-x-auto max-w-full', className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            'px-3 py-1.5 rounded-md text-[12.5px] font-medium whitespace-nowrap transition-colors',
            value === item.value ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
