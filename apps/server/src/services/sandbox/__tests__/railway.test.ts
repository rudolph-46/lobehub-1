import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sandboxEnv } from '@/envs/sandbox';

import type { SandboxServiceOptions } from '../types';

const mocks = vi.hoisted(() => {
  const exec = vi.fn();
  const create = vi.fn();
  const connect = vi.fn();
  const findByScope = vi.fn();
  const upsert = vi.fn();
  const makeHandle = (
    result: Partial<{
      exitCode: number | null;
      stderr: string;
      stdout: string;
    }>,
  ) => {
    const settled = {
      exitCode: result.exitCode ?? 0,
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
      timedOut: false,
      truncated: false,
    } as any;
    const handle = {
      detach: vi.fn(async () => 'session-x'),
      kill: vi.fn(async () => undefined),
      sessionName: Promise.resolve('session-x'),
      // eslint-disable-next-line unicorn/no-thenable
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(settled).then(onFulfilled, onRejected),
    };
    return handle;
  };

  return { connect, create, exec, findByScope, makeHandle, upsert };
});

const makeSandbox = (overrides: Partial<Record<string, any>> = {}) => {
  const files = {
    list: vi.fn(async () => [
      { isDir: false, modTime: '2026-09-21T00:00:00.000Z', name: 'a.txt', size: 5 },
    ]),
    read: vi.fn(async () => 'one\ntwo\nthree\n'),
    write: vi.fn(async () => undefined),
  };

  return {
    destroy: vi.fn(async () => undefined),
    exec: mocks.exec,
    files,
    id: 'sbx-123',
    region: 'us-west2',
    status: 'RUNNING',
    ...overrides,
  } as any;
};

vi.mock('railway', () => ({
  Sandbox: {
    connect: mocks.connect,
    create: mocks.create,
  },
}));

vi.mock('@/envs/sandbox', () => ({
  sandboxEnv: {
    RAILWAY_API_TOKEN: 'token' as string | undefined,
    RAILWAY_ENVIRONMENT_ID: 'env-1' as string | undefined,
  },
}));

vi.mock('@/database/models/sandboxSession', () => ({
  SandboxSessionModel: class {
    findByScope = mocks.findByScope;
    upsert = mocks.upsert;
  },
}));

const baseOptions = (overrides: Partial<SandboxServiceOptions> = {}): SandboxServiceOptions =>
  ({
    marketService: {} as any,
    serverDB: {} as any,
    topicId: 'topic-1',
    userId: 'user-1',
    ...overrides,
  }) as SandboxServiceOptions;

const importProvider = async () => {
  const { RailwaySandboxProvider } = await import('../providers/railway');
  return new RailwaySandboxProvider(baseOptions());
};

describe('RailwaySandboxProvider', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.RAILWAY_TOKEN;
    mocks.findByScope.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue(undefined);
    Object.assign(sandboxEnv, {
      RAILWAY_API_TOKEN: 'token',
      RAILWAY_ENVIRONMENT_ID: 'env-1',
    });
  });

  it('reports the expected capabilities and kind', async () => {
    const provider = await importProvider();

    expect(provider.kind).toBe('railway');
    expect(provider.capabilities).toMatchObject({
      backgroundCommands: true,
      exportFile: true,
      files: true,
      persistentSession: true,
      shell: true,
      skillScripts: true,
    });
  });

  it('rejects tool calls when the Railway credentials are missing', async () => {
    Object.assign(sandboxEnv, { RAILWAY_API_TOKEN: undefined });
    delete process.env.RAILWAY_TOKEN;

    const provider = await importProvider();
    const result = await provider.callTool('runCommand', { command: 'ls' });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('RAILWAY_API_TOKEN');
  });

  it('creates a sandbox once and reuses the handle across calls', async () => {
    const sandbox = makeSandbox();
    mocks.create.mockResolvedValue(sandbox);
    mocks.exec.mockImplementation(() => mocks.makeHandle({ stdout: 'hello\n' }));

    const provider = await importProvider();
    const first = await provider.callTool('runCommand', { command: 'echo hello' });
    const second = await provider.callTool('runCommand', { command: 'echo hello' });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.exec).toHaveBeenCalledTimes(2);
    expect(first.result).toMatchObject({ exit_code: 0, stdout: 'hello\n' });
    expect(second.success).toBe(true);
  });

  it('returns a background commandId and detaches the handle', async () => {
    const sandbox = makeSandbox();
    mocks.create.mockResolvedValue(sandbox);

    const provider = await importProvider();
    const result = await provider.callTool('runCommand', {
      background: true,
      command: 'npm run dev',
    });

    expect(result.result).toMatchObject({ commandId: 'session-x', shell_id: 'session-x' });
    expect(mocks.exec).toHaveBeenCalledWith('npm run dev');
  });

  it('round-trips writeFile through the files API', async () => {
    const sandbox = makeSandbox();
    mocks.create.mockResolvedValue(sandbox);

    const provider = await importProvider();
    const result = await provider.callTool('writeFile', { content: 'abc', path: '/tmp/x.txt' });

    expect(sandbox.files.write).toHaveBeenCalledWith('/tmp/x.txt', 'abc');
    expect(result.result).toMatchObject({ bytesWritten: 3, success: true });
  });

  it('exports a file by reading bytes and uploading them to the presigned URL', async () => {
    const sandbox = makeSandbox({
      files: {
        list: vi.fn(),
        read: vi.fn(async () => new Uint8Array([1, 2, 3])),
        write: vi.fn(),
      },
    });
    mocks.create.mockResolvedValue(sandbox);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const provider = await importProvider();
    const result = await provider.exportFileToUploadUrl({
      filename: 'out.png',
      path: '/tmp/out.png',
      uploadHeaders: { 'x-amz-acl': 'public-read' },
      uploadUrl: 'https://upload.example.com/out.png',
    });

    expect(result.success).toBe(true);
    expect(result.size).toBe(3);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://upload.example.com/out.png',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('forwards the stored token to the SDK through RAILWAY_TOKEN (project-token auth)', async () => {
    const sandbox = makeSandbox();
    mocks.create.mockResolvedValue(sandbox);
    mocks.exec.mockImplementation(() => mocks.makeHandle({ stdout: '' }));

    const provider = await importProvider();
    await provider.callTool('runCommand', { command: 'ls' });

    expect(process.env.RAILWAY_TOKEN).toBe('token');
    // The SDK must not receive an explicit token: that would switch it to
    // bearer auth, which the sandboxes API rejects.
    expect(mocks.create).not.toHaveBeenCalledWith(expect.objectContaining({ token: 'token' }));
  });

  it('re-creates the sandbox when the mapped handle is destroyed', async () => {
    // The mapping points at a dead sandbox; connect throws, create runs, and
    // the new handle replaces the row.
    mocks.findByScope.mockResolvedValue({ sandboxId: 'sbx-stale' });
    mocks.connect.mockRejectedValueOnce(new Error('SandboxNotFoundError'));
    const sandbox = makeSandbox();
    mocks.create.mockResolvedValue(sandbox);
    mocks.exec.mockImplementation(() => mocks.makeHandle({ stdout: '' }));

    const provider = await importProvider();
    const result = await provider.callTool('runCommand', { command: 'ls' });

    expect(mocks.connect).toHaveBeenCalledWith('sbx-stale');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'sbx-123', topicId: 'topic-1', userId: 'user-1' }),
    );
    expect(result.success).toBe(true);
  });
});
