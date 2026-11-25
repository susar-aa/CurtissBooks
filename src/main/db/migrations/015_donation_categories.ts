import Database from 'better-sqlite3';

export const migration015 = {
  id: 15,
  name: '015_donation_categories',
  up: (db: Database.Database): void => {
    // 1. Seed intuitive real-world donation categories
    db.exec(`
      INSERT OR IGNORE INTO fund_categories (category_code, name_en, name_si, description, is_active)
      VALUES
        ('FCAT-PRNT', 'Donations from Parents', 'දෙමව්පිය පරිත්‍යාග', 'Voluntary contributions and sponsorships from parents', 1),
        ('FCAT-GOV', 'Donations from Government', 'රජයේ ප්‍රතිපාදන', 'Ministry and Provincial Council grants and institutional allocations', 1),
        ('FCAT-ALUM', 'Past Pupils & Alumni', 'ආදි ශිෂ්‍ය පරිත්‍යාග', 'Donations from past pupils associations and alumni members', 1),
        ('FCAT-COMM', 'Community & Well-Wishers', 'ප්‍රජා සහ සුබපතන්නන්', 'Contributions from local community, philanthropists, and well-wishers', 1),
        ('FCAT-MISC', 'Other Inflows & Grants', 'වෙනත් ආධාර සහ ලැබීම්', 'Miscellaneous inward donations, sponsorships, and gifts', 1);
    `);

    // 2. Ensure index on fund_receipts(fund_category_id)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_cat ON fund_receipts(fund_category_id);
    `);
  },
  down: (db: Database.Database): void => {
    db.exec(`
      DELETE FROM fund_categories WHERE category_code IN ('FCAT-PRNT', 'FCAT-GOV', 'FCAT-ALUM', 'FCAT-COMM', 'FCAT-MISC');
    `);
  },
};
