import type Database from 'better-sqlite3';

export const migration021 = {
  id: 21,
  name: '021_cheque_bounce_fee',
  up: (db: Database.Database): void => {
    // 1. Add bounce_fee_cents column to cheques table if not exists
    const cols = db.prepare('PRAGMA table_info(cheques)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'bounce_fee_cents')) {
      db.exec('ALTER TABLE cheques ADD COLUMN bounce_fee_cents INTEGER NOT NULL DEFAULT 0;');
    }

    // 2. Automatically populate bounce_fee_cents for existing bounced cheques where bounce_reason is numeric (e.g. '500')
    const bouncedCheques = db.prepare(`
      SELECT id, cheque_number, bounce_reason, issuing_bank_account_id, deposit_bank_account_id, bounce_date, cheque_type
      FROM cheques
      WHERE status = 'bounced' AND bounce_reason IS NOT NULL
    `).all() as any[];

    for (const c of bouncedCheques) {
      const val = parseFloat(c.bounce_reason.trim());
      if (!isNaN(val) && val > 0) {
        const feeCents = Math.round(val * 100);
        db.prepare('UPDATE cheques SET bounce_fee_cents = ? WHERE id = ?').run(feeCents, c.id);

        const targetBankId = c.issuing_bank_account_id || c.deposit_bank_account_id;
        if (targetBankId && c.bounce_date) {
          // Check if bank_charge transaction already exists for this cheque
          const exists = db.prepare(`
            SELECT id FROM bank_transactions
            WHERE cheque_number = ? AND transaction_type = 'bank_charge'
          `).get(c.cheque_number);

          if (!exists) {
            db.prepare(`
              INSERT INTO bank_transactions (
                bank_account_id, transaction_date, transaction_type, amount_cents,
                reference_no, cheque_number, description, is_reconciled
              ) VALUES (?, ?, 'bank_charge', ?, ?, ?, ?, 0)
            `).run(
              targetBankId,
              c.bounce_date,
              -feeCents,
              `FEE-CHQ-${c.cheque_number}`,
              c.cheque_number,
              `Cheque return fee / චෙක් අගරු ගාස්තු: #${c.cheque_number}`
            );

            db.prepare(`
              UPDATE bank_accounts
              SET current_balance_cents = current_balance_cents - ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(feeCents, targetBankId);
          }
        }
      }
    }
  },
};
