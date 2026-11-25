import React from 'react';
import { cn } from '../../lib/utils';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, checked, onChange, id, disabled, ...props }, ref) => {
    return (
      <label htmlFor={id} className={cn('flex items-start space-x-2.5 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-50', className)}>
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            id={id}
            type="checkbox"
            ref={ref}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <div className="h-4 w-4 rounded border border-zinc-300 bg-white transition-colors peer-checked:bg-zinc-900 peer-checked:border-zinc-900 peer-focus-visible:ring-1 peer-focus-visible:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:peer-checked:bg-zinc-100 dark:peer-checked:border-zinc-100 flex items-center justify-center">
            {checked && <Check className="h-3 w-3 text-white dark:text-zinc-950 stroke-[3]" />}
          </div>
        </div>
        {(label || description) && (
          <div className="text-xs">
            {label && <div className="font-medium text-zinc-900 dark:text-zinc-200">{label}</div>}
            {description && <div className="text-zinc-500 dark:text-zinc-400 text-[11px]">{description}</div>}
          </div>
        )}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

