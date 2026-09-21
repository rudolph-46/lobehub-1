import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchOnboardingAgentTemplates } from './agentMarketplace';

const mocks = vi.hoisted(() => ({
  getOnboardingFull: vi.fn(),
}));

vi.mock('@/services/catalog', () => ({
  catalogService: {
    getOnboardingFull: mocks.getOnboardingFull,
  },
}));

describe('fetchOnboardingAgentTemplates', () => {
  beforeEach(() => {
    mocks.getOnboardingFull.mockReset();
  });

  it('loads the instance catalog and normalizes each template', async () => {
    const signal = new AbortController().signal;
    mocks.getOnboardingFull.mockResolvedValue({
      engineering: [
        {
          description: 'Helps with code',
          identifier: 'agent-template-engineer',
          name: 'Engineer',
        },
      ],
    });

    const result = await fetchOnboardingAgentTemplates({ signal });

    expect(mocks.getOnboardingFull).toHaveBeenCalledWith({ signal });
    expect(result).toEqual([
      {
        category: 'engineering',
        description: 'Helps with code',
        id: 'agent-template-engineer',
        title: 'Engineer',
      },
    ]);
  });

  it('returns an empty list when the catalog is empty', async () => {
    mocks.getOnboardingFull.mockResolvedValue({});

    expect(await fetchOnboardingAgentTemplates()).toEqual([]);
  });
});
