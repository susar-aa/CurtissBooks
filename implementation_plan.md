# Next Stage – Financial Year Setup & Annual Budget Management

Implement the new financial year and budgeting workflow. Do not implement a Chart of Accounts or traditional double-entry accounting system.

## 1. Financial Year Setup – Single Window

Create a complete financial year setup process in one window.

Include:
- Financial year name.
- Start date and end date.
- Category selection and budget allocation.
- Automatically calculated total budget.
- Draft saving and editing.
- Final approval.

Keep the entire workflow in one clean, organized interface. Do not split category selection and budget allocation into separate pages.

## 2. Reusable Budget Categories

Create a central category database.

Allow users to:
- Search and select existing categories.
- Reuse categories from previous financial years.
- Create new categories.
- Activate/deactivate categories where appropriate.

### Quick Create

When searching for a category:
- Show matching existing categories.
- If there is no exact match, display an option such as "Create [searched category]".
- Pressing Enter or selecting that option should create the category immediately.
- Automatically add the newly created category to the current financial year setup.
- Save it permanently in the central category database so it can be reused in future years.
- Prevent duplicate categories, including case-insensitive duplicates.
- Apply appropriate permissions and audit logging.

## 3. Budget Allocation

Display selected categories in a compact editable table.

Fields:
- Category name.
- Allocated budget.
- Optional description/notes.

Calculate and display the total allocated budget automatically.

Prevent duplicate category entries within the same financial year. Validate amounts and dates.

## 4. Draft and Approval Workflow

Financial year statuses:
- Draft
- Approved

Draft:
- Save without approval.
- Reopen and edit.
- Add/remove categories.
- Change allocated amounts.
- Continue editing later.

Approval:
- Require appropriate approval permission.
- Show a confirmation with the financial year and total allocated budget.
- On approval, permanently lock the financial year configuration.
- Prevent editing, adding/removing categories, or changing allocations through both UI and backend services.
- Record approver, approval date/time and audit information.

Do not allow ordinary users to bypass approval restrictions through IPC or direct service calls.

## 5. Annual Budget Page

After approval, display the approved financial year's budget.

Show:
- Financial year.
- Approval status and approval details.
- All approved categories.
- Allocated amount per category.
- Total approved budget.

This page must be read-only. Do not show Add, Edit, Delete or allocation editing controls.

## 6. Expense Integration Preparation

Design the approved budget data so expense recording can use it in the next stage.

Each expense must eventually reference:
- Financial year.
- Approved budget category.
- Amount.
- Payment source.
- Transaction date.

Only categories included in the approved financial year can be selected for expenses.

Plan the data relationships so each expense can reduce the correct category's remaining budget and the correct cash, petty cash or bank balance.

Do not implement expense recording in this stage unless required for basic integration testing.

## 7. Database and Integrity

Create appropriate tables/migrations for:
- Reusable budget categories.
- Financial years.
- Financial-year budget category allocations.
- Approval information.

Use safe SQLite migrations. Preserve existing student and school data.

Do not store independently editable totals or remaining balances when they can be derived from transaction records.

Use precise monetary storage; do not use floating-point REAL for financial amounts.

Ensure approved financial-year allocations cannot be modified through backend services.

## 8. UI and Localization

Follow the existing CurtissBooks UI design and component system.

- Compact, professional desktop interface.
- English and Sinhala translations.
- Lucide icons only.
- Clear draft/approved indicators.
- Good keyboard navigation, particularly for category search and quick creation.

## 9. Testing

Test:
- Creating and reusing categories.
- Quick-create with Enter.
- Duplicate prevention.
- Category selection and budget allocation.
- Automatic total calculation.
- Draft saving and reopening.
- Editing drafts.
- Approval workflow and permissions.
- Attempted editing of approved financial years through UI and backend.
- Database persistence and migration safety.
- English/Sinhala translation coverage.

Run all previous regression suites.

Do not modify unrelated student, authentication or school modules. Do not implement a Chart of Accounts.

Stop after completing this stage. Provide a walkthrough of the implementation, database changes and test results. Wait for my approval before proceeding to the expense-management stage.