import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps, varchar255 } from './_helpers';
import { users } from './user';

/**
 * Opaque sandbox id per (user, topic) scope, written by the sandbox provider
 * that allocates sandboxes with provider-generated ids (e.g. the Railway
 * provider). Vercel invocations are stateless, so the mapping must live in the
 * database — the next call reattaches to the same sandbox instead of spawning
 * a second one. Providers that derive session ids by naming convention (e.g.
 * Onlyboxes) don't need this table.
 */
export const sandboxSessions = pgTable(
  'sandbox_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    topicId: text('topic_id').notNull(),

    /** Provider-allocated sandbox handle, opaque outside the provider. */
    sandboxId: text('sandbox_id').notNull(),
    /** Provider-reported placement, informational. */
    region: varchar255('region'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('sandbox_sessions_user_topic_idx').on(t.userId, t.topicId),
    index('sandbox_sessions_sandbox_id_idx').on(t.sandboxId),
    check('sandbox_sessions_topic_not_empty', sql`length(btrim(${t.topicId})) > 0`),
    check('sandbox_sessions_sandbox_not_empty', sql`length(btrim(${t.sandboxId})) > 0`),
  ],
);

export type NewSandboxSession = typeof sandboxSessions.$inferInsert;
export type SandboxSessionItem = typeof sandboxSessions.$inferSelect;
