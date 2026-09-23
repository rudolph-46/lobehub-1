// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { sandboxSessions, users } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { SandboxSessionModel } from '../sandboxSession';

const serverDB: LobeChatDatabase = await getTestDB();

const userId = 'sandbox-session-model-test-user';
const model = new SandboxSessionModel(serverDB);

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('SandboxSessionModel', () => {
  it('persists and re-reads the sandbox handle for a scope', async () => {
    await model.upsert({ sandboxId: 'sbx-1', topicId: 'topic-1', userId });

    const item = await model.findByScope(userId, 'topic-1');
    expect(item?.sandboxId).toBe('sbx-1');
  });

  it('replaces the handle when the sandbox is re-created', async () => {
    await model.upsert({ sandboxId: 'sbx-1', topicId: 'topic-1', userId });
    await model.upsert({ region: 'us-west2', sandboxId: 'sbx-2', topicId: 'topic-1', userId });

    const rows = await serverDB.select().from(sandboxSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].sandboxId).toBe('sbx-2');
    expect(rows[0].region).toBe('us-west2');
  });

  it('scopes handles per topic', async () => {
    await model.upsert({ sandboxId: 'sbx-a', topicId: 'topic-a', userId });
    await model.upsert({ sandboxId: 'sbx-b', topicId: 'topic-b', userId });

    expect((await model.findByScope(userId, 'topic-a'))?.sandboxId).toBe('sbx-a');
    expect((await model.findByScope(userId, 'topic-b'))?.sandboxId).toBe('sbx-b');
  });
});
