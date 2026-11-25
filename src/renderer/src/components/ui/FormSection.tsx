import React from 'react';
import { cn } from '../../lib/utils';

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  children,
  className,
}) => {
  return (
    <div className={cn('space-y-4 py-4 border-b border-zinc-100 dark:border-zinc-900 last:border-b-0', className)}>
      <div>
        <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
          {title}
        </h4>
        {description && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
};

