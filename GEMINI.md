1. **DATABASE:** Test all changes on local XAMPP first. Never touch live DB. Always output SQL code for manual live deployment.
2. **BROWSER:** Do not open/run in browser. No automated browsing; I'll test manually.
3. **OUTPUT:** Be direct. No filler text or conversational fluff.
4. **CREDIT SAVING:** Focus only on relevant code snippets. Combine steps into single outputs to minimize back-and-forth token usage.
5. **SQL & DATABASE PERFORMANCE:**
   - **Prefer Explicit JOINs Over Subqueries:** Never write `WHERE id IN (SELECT ...)`. Always rewrite subqueries using `INNER JOIN` or `LEFT JOIN` to prevent unindexed full-table scans.
   - **Batch & Avoid N+1 Queries:** Do not execute SQL queries inside loops (`foreach`, `while`). Fetch relational data using single `JOIN` queries or batched operations.
   - **Index Query Columns:** Whenever writing `WHERE`, `JOIN`, `ORDER BY`, or `GROUP BY` conditions, verify and include required single or composite database index creations in the live SQL output.
   - **Explicit Column Selection:** Avoid `SELECT *`. Explicitly request only the required columns to minimize memory payload and leverage covering indexes.
   - **Always Paginate Results:** Use server-side `LIMIT` and `OFFSET` for lists, reports, or data tables to prevent loading entire datasets into memory.
   - **Avoid Leading Wildcard Filters:** Prefer `LIKE 'term%'` over `LIKE '%term%'` to ensure indexes are utilized properly.
6. **BUILD:** Always build the distribution (`npm run dist`) after every code change. Verify that both compilation and electron distribution packaging complete cleanly with zero errors before reporting task completion.
7. **CATEGORIES & DROPDOWNS QUICK-CREATE:** For all category selections and relational dropdowns, implement an inline quick-create system. Users must be able to search existing entries, and if not found, immediately quick-create a new entry (or open an inline quick-creation sub-modal) without navigating away, losing their filled form state, or interrupting their workflow. Automatically select and apply the newly created entry upon creation.
