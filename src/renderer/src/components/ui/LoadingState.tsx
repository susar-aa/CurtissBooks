import React from 'react';
import { cn } from '../../lib/utils';

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  className,
}) => {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 space-y-3', className)}>
      <span className="w-6 h-6 border-2 border-zinc-900 border-t-transparent dark:border-zinc-100 dark:border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{message}</span>
    </div>
  );
};

