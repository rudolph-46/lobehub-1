import { and, eq } from 'drizzle-orm';

import type { SandboxSessionItem } from '../schemas';
import { sandboxSessions } from '../schemas';
import type { LobeChatDatabase } from '../type';

export interface UpsertSandboxSessionParams {
  region?: string | null;
  sandboxId: string;
  topicId: string;
  userId: string;
}

/**
 * Maps a (user, topic) execution scope to the provider-allocated sandbox id.
 * Only needed by providers whose sandbox handles are opaque ids (e.g.
 * Railway); naming-convention providers skip this model entirely.
 */
export class SandboxSessionModel {
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase) {
    this.db = db;
  }

  findByScope = async (
    userId: string,
    topicId: string,
  ): Promise<SandboxSessionItem | undefined> => {
    const [item] = await this.db
      .select()
      .from(sandboxSessions)
      .where(and(eq(sandboxSessions.userId, userId), eq(sandboxSessions.topicId, topicId)))
      .limit(1);

    return item;
  };

  /** One row per (user, topic): a re-created sandbox replaces the old handle. */
  upsert = async (params: UpsertSandboxSessionParams): Promise<void> => {
    const { region, sandboxId, topicId, userId } = params;

    await this.db
      .insert(sandboxSessions)
      .values({ region: region ?? undefined, sandboxId, topicId, userId })
      .onConflictDoUpdate({
        set: { region: region ?? null, sandboxId, updatedAt: new Date() },
        target: [sandboxSessions.userId, sandboxSessions.topicId],
      });
  };
}
