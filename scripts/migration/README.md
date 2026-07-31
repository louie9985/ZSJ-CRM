# Migration Scripts

Versioned SQL migration validation and execution, resumable data backfills, drift checks, and recovery tooling. This runner is the single production migration history: it preserves all pre-Prisma SQL and executes future Prisma-Schema-derived SQL only after it receives the project global version number and review metadata. Destructive or irreversible operations require explicit approval, compatibility analysis, a tested recovery or forward-fix path, and an observable stopping condition.

Migrations run separately from application startup with dedicated DDL credentials and global mutual exclusion. Shared environments never use automatic schema synchronization, `prisma db push`, or a parallel `prisma migrate deploy` history.

See [ADR-0028](../../docs/08-架构决策/ADR-0028-Prisma数据持久化基线与Drizzle迁移.md), the retained governance in [ADR-0011](../../docs/08-架构决策/ADR-0011-PostgreSQL与Drizzle数据持久化基线.md), and the [database migration baseline](../../docs/04-工程手册/数据库与迁移基线.md).
