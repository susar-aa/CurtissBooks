# CurtissBooks – Complete System Optimization, Security Audit & Financial Integrity Testing

Perform a comprehensive quality improvement and security audit of the entire CurtissBooks desktop application.

This is a critical stabilization stage before production use.

The application includes:
- Authentication and user management.
- Roles and permissions.
- School profile and student management.
- Financial year management.
- Hierarchical annual budget categories and allocations.
- Income and fund management.
- General expense management.
- Petty cash management.
- Cash management.
- Multiple bank accounts.
- Unified Cash Book.
- Fund transfers between cash, bank and petty cash.
- Financial reports and audit logs.

**Primary objective:** Make the entire application secure, reliable, accurate, fast, smooth and production-ready without breaking existing functionality or losing financial data.

Do not introduce a Chart of Accounts or double-entry accounting system.

---

## 1. Full Application Audit

Before editing anything:

- Inspect the complete project architecture.
- Review all database tables, relationships, migrations and indexes.
- Review every service, IPC handler, preload API and renderer component.
- Identify duplicated logic, unnecessary queries and inconsistent implementations.
- Review every financial transaction workflow.
- Identify security vulnerabilities, validation gaps and data-integrity risks.
- Review existing automated tests and identify missing coverage.

Create a prioritized audit report:
- Critical issues.
- High-priority issues.
- Medium-priority issues.
- UI/UX improvements.
- Performance improvements.

Fix issues systematically without removing working functionality.

## 2. Financial Transaction Integrity – Highest Priority

Thoroughly audit and test every financial transaction.

### A. Cash Transactions
Test:
- Cash received.
- Cash payments.
- Cash opening balance.
- Cash balance calculations.
- Cash transaction history.

### B. Bank Transactions
Test:
- Bank deposits.
- Bank withdrawals.
- Bank receipts.
- Bank payments.
- Multiple bank accounts.
- Account-specific balances.
- Bank reconciliation.
- Opening and closing balances.
- Reconciliation carry-forward to the next period.

### C. Petty Cash
Test:
- Petty cash allocation.
- Petty cash expenses.
- Petty cash balance.
- Replenishment.
- Multiple petty cash transactions.
- Expense cancellation and reversal.

### D. Fund Transfers

Test every supported transfer combination:

- Cash → Bank.
- Bank → Cash.
- Cash → Petty Cash.
- Petty Cash → Cash.
- Bank → Petty Cash.
- Petty Cash → Bank.
- Bank Account A → Bank Account B.

For every transfer, verify:
- Source balance decreases correctly.
- Destination balance increases correctly.
- Total money across all accounts remains unchanged.
- Both transaction records reference the same transfer.
- Failed transfers do not partially update balances.
- Duplicate submissions do not create duplicate transfers.
- Transfers never appear as income or expenses.
- Reversals correctly restore the original balances.

### E. General Expenses

Test:
- Expense recording.
- Approved budget category validation.
- Available budget validation.
- Cash payment.
- Bank payment.
- Expense editing, cancellation and reversal.
- Correct payment-source deduction.
- Correct budget deduction.

### F. Income and Fund Management

Test:
- Income recording.
- Government funds.
- Donations.
- Fund categorization.
- Fund receipts.
- Fund usage.
- Fund balances.
- Fund-to-expense relationships.
- No duplicate income or expense counting.

### G. Annual Budget

Test:
- Financial year creation.
- Draft editing.
- Category creation and reuse.
- Main and subcategory numbering.
- Budget allocation.
- Parent category totals.
- Approval workflow.
- Approved budget locking.
- Remaining budget calculations.
- Expense deductions against the correct subcategory.

### Critical financial rules

1. Every transaction must update all related records atomically using database transactions.
2. Never allow a source balance to update without the corresponding destination or transaction record.
3. Use precise monetary storage. Avoid floating-point REAL calculations.
4. Prevent duplicate transaction submissions.
5. Never directly delete completed financial transactions.
6. Use controlled cancellation and reversal workflows.
7. Preserve transaction history and audit information.
8. Calculate balances consistently from reliable transaction records or validated balance mechanisms.
9. Do not allow negative balances unless an explicitly authorized business rule permits them.
10. Do not allow expenses against unapproved budget categories.
11. Ensure cancelled and reversed transactions are excluded from active balance calculations.
12. Ensure transfers are excluded from income and expense totals.

Create automated tests for all these rules.

## 3. Database Security and Integrity

Inspect the SQLite database thoroughly.

Check:
- Foreign key constraints.
- Unique constraints.
- Required fields.
- Appropriate indexes.
- Cascading deletion risks.
- Orphaned records.
- Duplicate records.
- Incorrect relationships.
- Migration consistency.
- Transaction rollback behavior.
- WAL and database locking behavior.
- Backup and recovery mechanisms.

Requirements:
- Enable and verify foreign key enforcement on every database connection.
- Never silently ignore failed database operations.
- Use prepared statements.
- Avoid unsafe SQL construction.
- Use safe migrations only.
- Never reset or recreate production databases during testing.
- Preserve all existing data.
- Test migration failure and recovery.

Verify database integrity using SQLite integrity checks and foreign-key checks.

## 4. Electron Security Audit

Review the complete Electron security architecture.

Check:
- contextIsolation.
- nodeIntegration.
- sandbox configuration.
- preload exposure.
- IPC authorization.
- IPC input validation.
- Renderer-to-main communication.
- Content Security Policy.
- External URL handling.
- File-system access.
- Attachment handling.
- Local database access.
- Sensitive information exposure.

Requirements:
- Renderer must never access SQLite directly.
- Expose only required APIs through preload.
- Validate every IPC request.
- Enforce user permissions inside backend services.
- Prevent unauthorized users from calling protected operations directly.
- Prevent arbitrary file access.
- Prevent unsafe external navigation.
- Do not expose passwords, session secrets or sensitive database information.
- Review password hashing and login lockout implementation.
- Verify session handling after application restart.
- Ensure audit logs cannot be modified by ordinary users.

Do not weaken security settings simply to fix an application issue.

## 5. Authentication, Roles and Permissions

Test every role and permission.

Verify:
- Unauthorized users cannot access restricted pages.
- Backend operations enforce the same permissions as the UI.
- Users cannot bypass restrictions through IPC.
- Financial approval permissions are correct.
- Approved financial years cannot be edited.
- Reversal permissions are restricted.
- Last active administrator protection works.
- Login lockout works correctly.
- Session expiration and locking work correctly.
- Logout clears the active session.

Check for privilege escalation and insecure default permissions.

## 6. Validation and Error Handling

Review every form and transaction.

Implement consistent validation for:
- Required fields.
- Invalid dates.
- Future and past date restrictions where applicable.
- Invalid monetary amounts.
- Zero and negative amounts.
- Amounts exceeding available balances.
- Duplicate references.
- Duplicate categories.
- Invalid account selections.
- Inactive accounts.
- Closed or unapproved financial years.
- Unauthorized actions.
- Invalid attachments.
- Missing relationships.

Provide clear, user-friendly error messages in English and Sinhala.

Do not use browser alerts or generic error messages.

Prevent accidental double-click submissions and duplicate requests.

Show loading, success, empty and error states consistently.

## 7. Performance Optimization

Inspect and improve:
- Slow SQLite queries.
- Missing indexes.
- Repeated database calls.
- Unnecessary React re-renders.
- Large lists and tables.
- Dashboard loading.
- Search and filtering.
- Report generation.
- Excel import/export.
- Startup time.
- Memory usage.
- Background processes.

Use pagination or efficient loading for large datasets.

Avoid unnecessary database queries and duplicated calculations.

Do not sacrifice data accuracy for performance.

## 8. Complete UI/UX Refinement

Review every screen, not just the dashboard.

Improve:
- Sidebar consistency.
- Page layouts.
- Navigation.
- Typography.
- Spacing.
- Tables.
- Forms.
- Dialogs.
- Dropdowns.
- Search fields.
- Buttons.
- Status indicators.
- Loading states.
- Empty states.
- Error states.
- Confirmation dialogs.

Design requirements:
- Premium modern desktop application.
- Clean black-and-white visual language.
- Consistent spacing and typography.
- Lucide icons only; no emoji icons.
- Compact layouts without unnecessary whitespace.
- Clear information hierarchy.
- Smooth navigation and interactions.
- Consistent component behavior.
- Keyboard-friendly forms and dialogs.
- Proper focus states.
- Responsive layouts for different desktop window sizes.
- Consistent English and Sinhala appearance.

Use subtle animations only where they improve usability. Avoid excessive animation and visual effects.

Do not change financial business logic during UI redesign.

## 9. Reports and Data Accuracy

Verify all reports against the underlying transaction records.

Test:
- Cash balances.
- Individual bank balances.
- Petty cash balances.
- Combined Cash Book.
- Income reports.
- Expense reports.
- Fund balances.
- Budget allocations.
- Budget utilization.
- Remaining budgets.
- Annual summaries.
- Date-range reports.

Ensure:
- No duplicate transactions.
- No missing transactions.
- Correct opening and closing balances.
- Correct date filtering.
- Correct cancelled/reversed transaction handling.
- Correct transfer treatment.
- Totals reconcile with source transaction records.

Exported PDF and Excel reports must match on-screen results.

## 10. Automated and Manual Testing

Build a comprehensive test suite.

Include:
- Unit tests.
- Service-layer tests.
- IPC permission tests.
- Database integration tests.
- Financial calculation tests.
- Transaction rollback tests.
- Regression tests.
- UI workflow tests.
- Application restart and persistence tests.

Create realistic test scenarios with multiple financial years, categories, cash accounts, bank accounts, petty cash and funds.

Test normal operations, invalid operations, concurrent submissions, duplicate submissions, database failures and application restarts.

Use an isolated test database. Never perform destructive tests on the user's actual application database.

For financial calculations, independently calculate expected results and compare them with application results.

Run all existing Stage 01 onward regression suites.

## 11. Real Desktop Application Verification

Test using the actual Electron desktop application.

Do not use browser-only testing as a replacement for desktop verification.

Check:
- Application startup.
- Login and logout.
- Window resizing.
- Navigation.
- Forms and dialogs.
- Keyboard interactions.
- Long transaction lists.
- Sinhala language switching.
- Database persistence.
- Application restart.
- Error recovery.

Do not leave background Electron processes running after testing.

## 12. Backup and Recovery

Implement or verify a safe backup and restore mechanism.

- Backup the SQLite database safely.
- Handle WAL files correctly.
- Verify backup integrity.
- Test restoration using a separate test copy.
- Never overwrite the production database during restore testing.
- Provide clear backup success/failure messages.

## 13. Final Acceptance Criteria

Do not declare the application production-ready merely because the build succeeds.

Require:
- All critical security issues resolved.
- All critical financial integrity tests passed.
- All previous regression tests passed.
- No unresolved database integrity violations.
- No duplicate financial transactions.
- No unexplained balance differences.
- No unauthorized financial operations.
- No data loss during migrations.
- No critical UI errors.
- Successful real desktop application testing.

If a test fails, investigate and fix the root cause rather than skipping or weakening the test.

Do not hide failed tests or report a false 100% pass rate.

## 14. Final Report

Provide a detailed final walkthrough containing:

1. Issues discovered.
2. Issues fixed.
3. Files and modules changed.
4. Database changes and migrations.
5. Security improvements.
6. Performance improvements.
7. UI/UX improvements.
8. Financial transaction test results.
9. Regression test results.
10. Failed tests and unresolved issues.
11. Backup and recovery test results.
12. Real desktop verification results.
13. Remaining production risks.

Classify remaining issues as Critical, High, Medium or Low.

**IMPORTANT DEVELOPMENT RULES:**
- Preserve all existing data.
- Do not remove existing functionality.
- Do not redesign the application by replacing working modules.
- Do not change business rules without identifying the reason and explaining the impact.
- Do not implement a Chart of Accounts.
- Do not use production data for destructive testing.
- Use safe, reversible migrations.
- Do not stop at the audit report; implement and verify the approved fixes.
- Work systematically, module by module.

Complete this stabilization stage and provide the final report. Do not begin unrelated new features.