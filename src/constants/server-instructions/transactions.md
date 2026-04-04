# Transactions

Core: `begin()`, `status()`, `commit()`, `rollback()`, `savepoint()`, `rollbackTo()`, `release()`, `execute()`

**Transaction Lifecycle:**

- `pg_transaction_begin`: Start new transaction. Supports optional `isolationLevel` and `read_only` parameters. Returns `{transactionId, isolationLevel, read_only, message}`. Use `transactionId` for subsequent operations
- `pg_transaction_status`: Check transaction state without modifying it. Returns `{status, transactionId, active, message}`. `status` is `"active"` (ready), `"aborted"` (needs rollback), or `"not_found"` (already ended). Read-only — does not alter transaction state. `transactionId`/`tx`/`txId` aliases
- `pg_transaction_commit`: Commit transaction, making all changes permanent. `transactionId`/`tx`/`txId` aliases
- `pg_transaction_rollback`: Rollback transaction, discarding all changes. `transactionId`/`tx`/`txId` aliases

**Savepoints:**

- `pg_transaction_savepoint`: Create savepoint within transaction. `name`/`savepoint` + `transactionId`/`tx`/`txId`
- `pg_transaction_rollback_to`: Rollback to savepoint, restoring database state to when the savepoint was created. ⚠️ Undoes ALL work (data changes AND savepoints) created after the target savepoint
- `pg_transaction_release`: Release savepoint, keeping all changes since it was created. `name`/`savepoint` aliases

**Atomic Execution:**

- `pg_transaction_execute`: Execute multiple statements atomically. Two modes:
  - **Auto-commit**: Without `transactionId`—auto-commits on success, auto-rollbacks on any error
  - **Join existing**: With `transactionId`/`tx`/`txId`—no auto-commit, caller controls via commit/rollback
- `statements`: Array of `{sql: "...", params?: [...]}` objects. ⚠️ Each object MUST have `sql` key
- `isolationLevel`: Optional isolation level for new transactions ('READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE')
- `read_only`: Optional boolean. If true, protects against mutating writes natively using Postgres boundary constraints
- Supports SELECT statements inside `statements`—results include `rows` in the response for mixed read/write workflows

**Aborted Transaction State:**

- ⚠️ If any statement in a transaction fails, PostgreSQL puts the transaction into an **aborted state**
- In aborted state, only `ROLLBACK` or `ROLLBACK TO SAVEPOINT` commands are accepted—all other commands will error
- Use `pg_transaction_rollback` to end the transaction, or `pg_transaction_rollback_to` to recover to a savepoint
- `pg_transaction_commit` on an aborted transaction will detect the state and report it (not silently rollback)

**Response Structures:**

- `begin`: `{transactionId, isolationLevel: 'READ COMMITTED', read_only, message}`
- `status`: `{status: 'active'|'aborted'|'not_found', transactionId, active, message}`
- `commit/rollback`: `{success, transactionId, message}`
- `savepoint/release/rollbackTo`: `{success, transactionId, savepoint, message}`
- `execute`: `{success, statementsExecuted, results: [{sql, rowsAffected, rowCount, rows?}], transactionId?}`

**Discovery**: `pg.transactions.help()` returns `{methods, methodAliases, examples}`
