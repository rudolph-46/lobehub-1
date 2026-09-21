import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentService } from '@/services/agent';
import { catalogService } from '@/services/catalog';
import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';

import { installMarketplaceAgents } from './installMarketplaceAgents';

const catalogDetail = (identifier: string) => ({
  avatar: 'avatar',
  backgroundColor: '#fff',
  category: 'engineering',
  config: {
    openingMessage: 'hello',
    params: { temperature: 0.4 },
    plugins: ['lobe-web-browsing'],
    systemRole: 'do things',
  },
  description: `desc-${identifier}`,
  identifier,
  title: `Title-${identifier}`,
});

describe('installMarketplaceAgents', () => {
  const createAgent = vi.fn();
  const refreshAgentList = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    createAgent.mockReset();
    refreshAgentList.mockReset();
    refreshAgentList.mockResolvedValue(undefined);

    vi.spyOn(useAgentStore, 'getState').mockReturnValue({
      createAgent,
    } as unknown as ReturnType<typeof useAgentStore.getState>);
    vi.spyOn(useHomeStore, 'getState').mockReturnValue({
      refreshAgentList,
    } as unknown as ReturnType<typeof useHomeStore.getState>);
    vi.spyOn(agentService, 'getAgentByCatalogIdentifier').mockResolvedValue(null);
    vi.spyOn(catalogService, 'getTemplateDetail').mockImplementation(async (identifier) =>
      catalogDetail(identifier),
    );
  });

  it('clones each selected template straight from the catalog — no market fork', async () => {
    const sourceIds = ['src-a', 'src-b', 'src-c'];

    createAgent.mockImplementation(async ({ config }: any) => ({
      agentId: `agent-${config.params.catalogIdentifier}`,
    }));

    const result = await installMarketplaceAgents(sourceIds);

    expect(createAgent).toHaveBeenCalledTimes(3);
    const [first] = createAgent.mock.calls[0];
    expect(first.config.params.catalogIdentifier).toBe('src-a');
    expect(first.config.title).toBe('Title-src-a');
    expect(first.config.systemRole).toBe('do things');
    expect(first.config.plugins).toEqual(['lobe-web-browsing']);

    expect(result.installedAgentIds).toEqual(['agent-src-a', 'agent-src-b', 'agent-src-c']);
    expect(result.skippedAgentIds).toEqual([]);
    expect(result.summaries.map((s) => s.templateId)).toEqual(sourceIds);
    expect(refreshAgentList).toHaveBeenCalledTimes(1);
  });

  it('skips already-installed templates at the dedupe step', async () => {
    const sourceIds = ['src-a', 'src-b', 'src-c'];

    vi.spyOn(agentService, 'getAgentByCatalogIdentifier').mockImplementation(async (id) =>
      id === 'src-a' ? null : `existing-${id}`,
    );
    createAgent.mockImplementation(async ({ config }: any) => ({
      agentId: `agent-${config.params.catalogIdentifier}`,
    }));

    const result = await installMarketplaceAgents(sourceIds);

    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(result.skippedAgentIds).toEqual(['src-b', 'src-c']);
    expect(result.installedAgentIds).toEqual(['agent-src-a']);
    // Summaries keep the original selection order and mark skips.
    expect(result.summaries.find((s) => s.templateId === 'src-b')).toMatchObject({
      skipped: true,
    });
  });

  it('warns and skips a template the catalog does not know', async () => {
    vi.spyOn(catalogService, 'getTemplateDetail').mockRejectedValueOnce(
      new Error('Template introuvable'),
    );
    createAgent.mockImplementation(async ({ config }: any) => ({
      agentId: `agent-${config.params.catalogIdentifier}`,
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await installMarketplaceAgents(['ghost-a', 'known-b']);

    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(result.installedAgentIds).toEqual(['agent-known-b']);
    warnSpy.mockRestore();
  });
});
