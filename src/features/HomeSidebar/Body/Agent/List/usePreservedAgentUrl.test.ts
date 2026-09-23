import { describe, expect, it } from 'vitest';

import { resolvePreservedAgentUrl } from './usePreservedAgentUrl';

describe('resolvePreservedAgentUrl', () => {
  it('keeps an agent-scoped subview when switching agents', () => {
    expect(resolvePreservedAgentUrl('/agent/agt_a/topics', 'agt_b')).toBe('/agent/agt_b/topics');
    expect(resolvePreservedAgentUrl('/agent/agt_a/profile', 'agt_b')).toBe('/agent/agt_b/profile');
  });

  it('drops topic and task ids that belong to the previous agent', () => {
    expect(resolvePreservedAgentUrl('/agent/agt_a/topic/tpc_1', 'agt_b')).toBe(
      '/agent/agt_b/profile',
    );
  });

  it('opens the selected agent profile when there is no preserved subview', () => {
    expect(resolvePreservedAgentUrl('/', 'agt_b')).toBe('/agent/agt_b/profile');
    expect(resolvePreservedAgentUrl('/agent/agt_a', 'agt_b')).toBe('/agent/agt_b/profile');
  });
});
