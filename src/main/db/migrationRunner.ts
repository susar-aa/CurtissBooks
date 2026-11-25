import type Database from 'better-sqlite3';
import { migration001 } from './migrations/001_initial_settings';
import { migration002 } from './migrations/002_auth_and_rbac';
import { migration003 } from './migrations/003_school_and_students';
import { migration004 } from './migrations/004_db_corrections_and_finalization';
import { migration005 } from './migrations/005_financial_accounting_system';
import { migration006 } from './migrations/006_budget_workflow_refinement';
import { migration007 } from './migrations/007_single_active_fy_and_category_filtering';
import { migration008 } from './migrations/008_funding_system_upgrade';
import { migration009 } from './migrations/009_streamline_funding_inflows';
import { migration010 } from './migrations/010_financial_system_upgrades';
import { migration011 } from './migrations/011_fund_transfers';
import { migration012 } from './migrations/012_fund_category_receipt_selection';
import { migration013 } from './migrations/013_financial_year_optimization';
import { migration014 } from './migrations/014_budget_reallocations';
import { migration015 } from './migrations/015_donation_categories';
import { migration016 } from './migrations/016_cheque_management';
import { migration017 } from './migrations/017_bank_reconciliation_redesign';
import { migration018 } from './migrations/018_reconciliation_tick_support';
import { migration019 } from './migrations/019_petty_cash_report_indexes';
import { migration020 } from './migrations/020_periodic_financial_statement';

const MIGRATIONS = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
];

export function runMigrations(db: Database.Database): void {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const getApplied = db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC');
  const appliedRows = getApplied.all() as { id: number }[];
  const appliedIds = new Set(appliedRows.map((row) => row.id));

  const recordMigration = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');

  for (const migration of MIGRATIONS) {
    if (!appliedIds.has(migration.id)) {
      console.log(`[DB Migration] Applying migration ${migration.id}: ${migration.name}`);
      db.pragma('foreign_keys = OFF');
      const executeTransaction = db.transaction(() => {
        migration.up(db);
        recordMigration.run(migration.id, migration.name);
      });
      executeTransaction();
      db.pragma('foreign_keys = ON');
      console.log(`[DB Migration] Completed migration ${migration.id}: ${migration.name}`);
    }
  }
}
