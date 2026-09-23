import { ProspectingExecutionRuntime } from '@lobechat/builtin-tool-prospecting/executionRuntime';
import { ProspectingManifest } from '@lobechat/builtin-tool-prospecting/manifest';

import { toolsEnv } from '@/envs/tools';

import { type ServerRuntimeRegistration } from './types';

export const prospectingRuntime: ServerRuntimeRegistration = {
  factory: () =>
    new ProspectingExecutionRuntime({
      token: toolsEnv.APIFY_API_TOKEN,
    }),
  identifier: ProspectingManifest.identifier,
};
