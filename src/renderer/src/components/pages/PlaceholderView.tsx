import React from 'react';
import { useTranslation } from 'react-i18next';
import { Construction, Lock } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { NavItemKey } from '../layout/Sidebar';

interface PlaceholderViewProps {
  moduleKey: NavItemKey;
  stageName: string;
}

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  moduleKey,
  stageName,
}) => {
  const { t: tNav } = useTranslation('navigation');

  const title = tNav(`items.${moduleKey}`);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 select-none">
      <PageHeader
        title={title}
        subtitle="School Management & Financial Accounting Module"
        badge={
          <Badge variant="neutral" size="md">
            <Lock className="w-3 h-3 mr-1 inline" />
            {stageName}
          </Badge>
        }
      />

      <EmptyState
        icon={Construction}
        title={`${title} Scheduled for Implementation`}
        description={`This module is registered in the architecture and scheduled for implementation under ${stageName}. Stage 02 provides the foundational design tokens, reusable UI components, and the English/Sinhala translation system.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xs">Module Architectural Boundary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            All database tables, double-entry financial transactions, and UI workflows for this module will be introduced sequentially without disturbing existing schemas or settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
