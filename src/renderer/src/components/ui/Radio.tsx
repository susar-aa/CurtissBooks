import React from 'react';
import { cn } from '../../lib/utils';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export interface RadioProps {
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (val: string) => void;
  className?: string;
  disabled?: boolean;
}

export const Radio: React.FC<RadioProps> = ({
  name,
  options,
  value,
  onChange,
  className,
  disabled = false,
}) => {
  return (
    <div className={cn('space-y-2', className)}>
      {options.map((opt) => {
        const isChecked = value === opt.value;
        return (
          <label
            key={opt.value}
            className={cn(
              'flex items-start space-x-2.5 cursor-pointer select-none',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={isChecked}
                onChange={() => !disabled && onChange(opt.value)}
                disabled={disabled}
                className="peer sr-only"
              />
              <div className="h-4 w-4 rounded-full border border-zinc-300 bg-white transition-colors peer-checked:border-zinc-900 flex items-center justify-center dark:border-zinc-700 dark:bg-zinc-900 dark:peer-checked:border-zinc-100">
                {isChecked && <div className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-100" />}
              </div>
            </div>
            <div className="text-xs">
              <div className="font-medium text-zinc-900 dark:text-zinc-200">{opt.label}</div>
              {opt.description && (
                <div className="text-zinc-500 dark:text-zinc-400 text-[11px]">{opt.description}</div>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
};

