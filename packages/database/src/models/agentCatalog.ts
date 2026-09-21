import { and, asc, eq } from 'drizzle-orm';

import type { AgentCatalogItem } from '../schemas';
import { agentCatalog } from '../schemas';
import type { LobeChatDatabase } from '../type';

/**
 * Instance-wide agent catalog backing the onboarding picker. There is no user
 * scope: rows are curated by whoever administers the instance and are visible
 * to every signed-in user, so the model takes no `userId`.
 */
export class AgentCatalogModel {
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase) {
    this.db = db;
  }

  /** Enabled templates, ordered for the picker: category, then display order. */
  listEnabled = async (): Promise<AgentCatalogItem[]> =>
    this.db
      .select()
      .from(agentCatalog)
      .where(eq(agentCatalog.enabled, true))
      .orderBy(asc(agentCatalog.category), asc(agentCatalog.sortOrder), asc(agentCatalog.title));

  /** Everything needed to install a template as a working agent. */
  findDetailByIdentifier = async (identifier: string): Promise<AgentCatalogItem | undefined> => {
    const [item] = await this.db
      .select()
      .from(agentCatalog)
      .where(and(eq(agentCatalog.identifier, identifier), eq(agentCatalog.enabled, true)))
      .limit(1);

    return item;
  };
}
