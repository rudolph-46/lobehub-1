import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamps, varchar255 } from './_helpers';

/**
 * The installable part of a catalog agent: everything `createAgent` needs to
 * materialise a working agent from a template. Deliberately a partial agent
 * config — the instance default model applies when `model` is absent.
 */
export interface AgentCatalogConfig {
  chatConfig?: Record<string, unknown>;
  editorData?: unknown;
  model?: string;
  openingMessage?: string;
  openingQuestions?: string[];
  params?: Record<string, unknown>;
  plugins?: string[];
  systemRole?: string;
  tags?: string[];
}

/**
 * Instance-wide, admin-curated agent catalog backing the onboarding picker.
 *
 * A self-hosted deployment serves its own marketplace: the picker lists rows
 * from this table and installation clones `config` directly, so onboarding
 * never talks to `market.lobehub.com`. Anyone with database access can add or
 * retire templates without a redeploy (`enabled = false` hides a row).
 *
 * `category` stores a `MarketplaceCategory` slug
 * (`@lobechat/builtin-tool-web-onboarding/agentMarketplace`); the value set is
 * owned by that package and enforced at the router boundary, so the schema
 * stays a plain slug column.
 */
export const agentCatalog = pgTable(
  'agent_catalog',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    /** Stable slug the picker and installer address, e.g. `prospecteur-terrain`. */
    identifier: varchar255('identifier').notNull(),
    title: varchar255('title').notNull(),
    description: text('description'),
    /** Emoji or image URL shown on the picker card. */
    avatar: varchar255('avatar'),
    backgroundColor: varchar255('background_color'),
    /** Marketplace category slug, e.g. `sales-customer`. */
    category: varchar255('category').notNull(),

    /** Full agent config applied on install (systemRole, plugins, params, …). */
    config: jsonb('config').$type<AgentCatalogConfig>().default({}).notNull(),

    /** `false` retires a template without deleting it. */
    enabled: boolean('enabled').default(true).notNull(),
    /** Display order inside its category, lowest first. */
    sortOrder: integer('sort_order').default(0).notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('agent_catalog_identifier_idx').on(t.identifier),
    index('agent_catalog_category_order_idx').on(t.category, t.sortOrder),
    check('agent_catalog_identifier_not_empty', sql`length(btrim(${t.identifier})) > 0`),
    check('agent_catalog_title_not_empty', sql`length(btrim(${t.title})) > 0`),
    check('agent_catalog_config_object', sql`jsonb_typeof(${t.config}) = 'object'`),
  ],
);

export type NewAgentCatalogItem = typeof agentCatalog.$inferInsert;
export type AgentCatalogItem = typeof agentCatalog.$inferSelect;
