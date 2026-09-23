import type { SandboxCallToolResult } from '@lobechat/builtin-tool-cloud-sandbox';
import { isRecord } from '@lobechat/utils';
import debug from 'debug';
import { sha256 } from 'js-sha256';
import { Sandbox } from 'railway';

import { SandboxSessionModel } from '@/database/models/sandboxSession';
import { sandboxEnv } from '@/envs/sandbox';

import type {
  SandboxProvider,
  SandboxProviderCapabilities,
  SandboxProviderFileExportRequest,
  SandboxProviderFileExportResult,
  SandboxServiceOptions,
} from '../types';

const log = debug('lobe-server:sandbox:railway');

const DEFAULT_TIMEOUT_MS = 120_000;
/** How long getCommandOutput waits for an exit before reporting "still running". */
const COMMAND_POLL_MS = 750;
const SKILL_ARCHIVE_CACHE_DIR = '/tmp/lobe-skills';
const NODE_SCRIPTS_DIR = '/tmp/lobe-scripts';

interface RailwayExecResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
  truncated: boolean;
}

/** Shape the command tools return; mirrors the Onlyboxes tool outputs. */
interface TerminalExecOutcome {
  exit_code?: number;
  session_id?: string;
  stderr?: string;
  stdout?: string;
}

export class RailwaySandboxProvider implements SandboxProvider {
  readonly capabilities = {
    backgroundCommands: true,
    exportFile: true,
    files: true,
    languages: ['javascript', 'python', 'typescript'],
    persistentSession: true,
    shell: true,
    skillScripts: true,
  } as const satisfies SandboxProviderCapabilities;

  readonly kind = 'railway';

  private readonly idleTimeoutMinutes?: number;
  private readonly options: SandboxServiceOptions;
  private readonly region?: string;
  private readonly sessionModel?: SandboxSessionModel;
  private readonly token?: string;
  private readonly environmentId?: string;
  private cachedSandbox?: Promise<Sandbox>;

  constructor(options: SandboxServiceOptions) {
    this.options = options;
    this.token = sandboxEnv.RAILWAY_API_TOKEN;
    this.environmentId = sandboxEnv.RAILWAY_ENVIRONMENT_ID;
    this.idleTimeoutMinutes = sandboxEnv.RAILWAY_SANDBOX_IDLE_TIMEOUT_MINUTES;
    this.region = sandboxEnv.RAILWAY_SANDBOX_REGION;
    this.sessionModel = options.serverDB ? new SandboxSessionModel(options.serverDB) : undefined;

    // The Railway SDK picks the auth mode from the token's transport: an
    // explicit `token` config is treated as an Account API token (bearer), a
    // `RAILWAY_TOKEN` environment variable as a Project Token (the type the
    // dashboard issues per environment). LobeHub stores the token under
    // RAILWAY_API_TOKEN regardless of which kind it is, so forward it through
    // the project-token channel the SDK natively understands.
    if (this.token && !process.env.RAILWAY_TOKEN) {
      process.env.RAILWAY_TOKEN = this.token;
    }
  }

  async callTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<SandboxCallToolResult> {
    const configError = this.configError();
    if (configError) return this.errorResult(configError);

    try {
      switch (toolName) {
        case 'runCommand': {
          return await this.runCommand(params);
        }

        case 'getCommandOutput': {
          return await this.getCommandOutput(params);
        }

        case 'killCommand': {
          return await this.killCommand(params);
        }

        case 'executeCode': {
          return await this.executeCode(params);
        }

        case 'execScript': {
          return await this.execScript(params);
        }

        case 'listLocalFiles':
        case 'listFiles': {
          return await this.listFiles(params);
        }

        case 'readLocalFile':
        case 'readFile': {
          return await this.readFile(params);
        }

        case 'writeLocalFile':
        case 'writeFile': {
          return await this.writeFile(params);
        }

        case 'editLocalFile':
        case 'editFile': {
          return await this.runNodeScript(editFileScript, params);
        }

        case 'searchLocalFiles':
        case 'searchFiles': {
          return await this.runNodeScript(searchFilesScript, params);
        }

        case 'moveLocalFiles':
        case 'moveFiles': {
          return await this.runNodeScript(moveFilesScript, params);
        }

        case 'grepContent': {
          return await this.runNodeScript(grepContentScript, params);
        }

        case 'globLocalFiles':
        case 'globFiles': {
          return await this.runNodeScript(globFilesScript, params);
        }

        default: {
          return this.errorResult(`Unsupported Railway sandbox tool: ${toolName}`);
        }
      }
    } catch (error) {
      log('Railway tool %s failed: %O', toolName, error);
      return this.errorResult((error as Error).message, (error as Error).name);
    }
  }

  async exportFileToUploadUrl({
    path,
    uploadHeaders,
    uploadUrl,
  }: SandboxProviderFileExportRequest): Promise<SandboxProviderFileExportResult> {
    const configError = this.configError();
    if (configError) {
      return { error: { message: configError }, success: false };
    }

    try {
      const sandbox = await this.getSandbox();
      const bytes = await sandbox.files.read(path, { format: 'bytes' });

      // The presigned upload is an S3-style PUT; the sandbox file API reads the
      // bytes so no curl/unzip tooling is required inside the sandbox.
      const response = await fetch(uploadUrl, {
        body: bytes as BodyInit,
        headers: uploadHeaders,
        method: 'PUT',
      });

      if (!response.ok) {
        return {
          error: { message: `Railway sandbox file upload failed with HTTP ${response.status}` },
          success: false,
        };
      }

      return {
        result: { success: true, uploadedBytes: bytes.byteLength },
        size: bytes.byteLength,
        success: true,
      };
    } catch (error) {
      log('Railway export failed: %O', error);
      return {
        error: { message: (error as Error).message },
        success: false,
      };
    }
  }

  // ----------------------------- session -----------------------------

  private configError(): string | undefined {
    if (!this.token || !this.environmentId) {
      return 'RAILWAY_API_TOKEN (a Railway Project Token) and RAILWAY_ENVIRONMENT_ID are required';
    }
    if (!this.sessionModel) {
      return 'serverDB is required for the Railway sandbox provider (session mapping)';
    }
    return undefined;
  }

  private get sandboxConfig() {
    // No `token` here: the SDK must resolve RAILWAY_TOKEN (project-token auth
    // mode). Passing an explicit token would switch it to bearer auth, which
    // the sandboxes API rejects.
    return {
      environmentId: this.environmentId,
      idleTimeoutMinutes: this.idleTimeoutMinutes,
      region: this.region,
    };
  }

  /**
   * Reuse the sandbox mapped to this (user, topic), or allocate a new one. The
   * handle is memoised for the process lifetime; the DB mapping survives
   * serverless restarts. A sandbox destroyed by Railway's idle timeout is
   * transparently re-created — its filesystem starts empty, and the tool
   * layer's init marker files are gone, so topic state re-syncs on next use.
   */
  private getSandbox(): Promise<Sandbox> {
    if (!this.cachedSandbox) {
      this.cachedSandbox = this.#acquireSandbox();
      // Never keep a rejected acquisition cached: the next call retries.
      this.cachedSandbox.catch(() => {
        this.cachedSandbox = undefined;
      });
    }
    return this.cachedSandbox;
  }

  async #acquireSandbox(): Promise<Sandbox> {
    const { topicId, userId } = this.options;
    const model = this.sessionModel!;

    const row = await model.findByScope(userId, topicId).catch((error) => {
      log('Failed to read sandbox session mapping: %O', error);
      return undefined;
    });

    if (row) {
      const existing = await this.#tryConnect(row.sandboxId);
      if (existing) return existing;
      log('Railway sandbox %s is gone; re-creating for %s/%s', row.sandboxId, userId, topicId);
    }

    const sandbox = await Sandbox.create(this.sandboxConfig);
    await model
      .upsert({ region: sandbox.region, sandboxId: sandbox.id, topicId, userId })
      .catch((error) => {
        log('Failed to persist sandbox session mapping: %O', error);
      });

    return sandbox;
  }

  async #tryConnect(sandboxId: string): Promise<Sandbox | undefined> {
    try {
      const sandbox = await Sandbox.connect(sandboxId);
      if (sandbox.status && sandbox.status !== 'RUNNING') return undefined;
      return sandbox;
    } catch (error) {
      log('Railway sandbox %s unavailable: %O', sandboxId, error);
      return undefined;
    }
  }

  // ----------------------------- commands -----------------------------

  private async runCommand(params: Record<string, unknown>): Promise<SandboxCallToolResult> {
    const command = String(params.command || '');

    if (!command.trim()) {
      return this.errorResult('command is required');
    }

    if (params.background === true) {
      const sandbox = await this.getSandbox();
      const handle = sandbox.exec(command);
      const sessionName = await handle.sessionName;
      await handle.detach();

      return {
        result: {
          commandId: sessionName,
          shell_id: sessionName,
        },
        success: true,
      };
    }

    const result = await this.execForeground(command, this.timeout(params));

    return {
      result,
      success: true,
    };
  }

  private async getCommandOutput(params: Record<string, unknown>): Promise<SandboxCallToolResult> {
    const commandId = String(params.commandId || '');
    if (!commandId) return this.errorResult('commandId is required');

    const sandbox = await this.getSandbox();

    let output = '';
    let stderr = '';
    const handle = sandbox.exec(
      { sessionName: commandId },
      {
        onStderr: (chunk) => {
          stderr += chunk;
        },
        onStdout: (chunk) => {
          output += chunk;
        },
      },
    );

    const settled = (await Promise.race([
      handle,
      new Promise((resolve) => setTimeout(() => resolve(undefined), COMMAND_POLL_MS)),
    ])) as RailwayExecResult | undefined;

    if (settled) {
      return {
        result: {
          exitCode: settled.exitCode,
          newOutput: settled.stdout,
          output: settled.stdout,
          running: false,
          stderr: settled.stderr,
          success: true,
        },
        success: true,
      };
    }

    await handle.detach().catch(() => {});

    return {
      result: {
        newOutput: output,
        output,
        running: true,
        stderr,
        success: true,
      },
      success: true,
    };
  }

  private async killCommand(params: Record<string, unknown>): Promise<SandboxCallToolResult> {
    const commandId = String(params.commandId || '');
    if (!commandId) return this.errorResult('commandId is required');

    const sandbox = await this.getSandbox();
    const handle = sandbox.exec({ sessionName: commandId }, {});
    await handle.kill();

    return {
      result: { success: true },
      success: true,
    };
  }

  private toCommandResult(result: RailwayExecResult): TerminalExecOutcome {
    return {
      exit_code: result.exitCode ?? -1,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  }

  // ----------------------------- code / skills -----------------------------

  private async executeCode(params: Record<string, unknown>): Promise<SandboxCallToolResult> {
    const code = String(params.code || '');
    const language = String(params.language || 'python');

    const runners: Record<string, string> = {
      javascript: 'node',
      python: 'python3',
      typescript: 'npx --yes tsx',
    };
    const extensions: Record<string, string> = {
      javascript: 'js',
      python: 'py',
      typescript: 'ts',
    };
    const runner = runners[language];

    if (!runner) {
      return this.errorResult(`Unsupported code language for Railway sandbox: ${language}`);
    }

    const filePath = `/tmp/lobe-code-${Date.now()}.${extensions[language]}`;
    const writeResult = await this.writeFile({
      content: code,
      path: filePath,
      timeoutMs: this.timeout(params),
    });

    if (!writeResult.success) {
      return writeResult;
    }

    const result = await this.execForeground(
      `${runner} ${this.shellQuote(filePath)}`,
      this.timeout(params),
    );

    return {
      result: {
        error: result.exit_code === 0 ? undefined : result.stderr,
        exitCode: result.exit_code,
        output: result.stdout,
        stderr: result.stderr,
      },
      success: true,
    };
  }

  private async execScript(params: Record<string, unknown>): Promise<SandboxCallToolResult> {
    const command = String(params.command || '');

    if (!command.trim()) {
      return this.errorResult('command is required');
    }

    const skillZipUrls = this.resolveExecScriptZipUrls(params);
    const timeoutMs = this.timeout(params);

    if (Object.keys(skillZipUrls).length === 0) {
      return this.runCommand({ command, timeout: timeoutMs });
    }

    const defaultSkillName = this.resolveExecScriptSkillName(params, skillZipUrls);
    const workspaceDir = this.skillWorkspaceDir(skillZipUrls);
    const setupCommand = this.buildSkillSetupCommand({ skillZipUrls, workspaceDir });
    const setup = await this.execForeground(setupCommand, timeoutMs);

    if (setup.exit_code !== 0) {
      return {
        error: { message: setup.stderr || setup.stdout || 'Failed to prepare skill resources' },
        result: {
          exitCode: setup.exit_code,
          output: setup.stdout,
          stderr: setup.stderr,
        },
        success: false,
      };
    }

    const runDir = defaultSkillName
      ? `${workspaceDir}/${this.safeSkillDirName(defaultSkillName)}`
      : workspaceDir;
    const result = await this.execForeground(
      `cd ${this.shellQuote(runDir)} && ${command}`,
      timeoutMs,
    );

    return {
      result: {
        commandId: result.session_id,
        exitCode: result.exit_code,
        output: result.stdout,
        stderr: result.stderr,
        stdout: result.stdout,
        success: result.exit_code === 0,
      },
      success: true,
    };
  }

  private async execForeground(command: string, timeoutMs: number): Promise<TerminalExecOutcome> {
    const sandbox = await this.getSandbox();
    const handle = sandbox.exec(command, {
      timeoutSec: Math.max(1, Math.ceil(timeoutMs / 1000)),
    });

    let sessionId: string | undefined;
    try {
      sessionId = await handle.sessionName;
    } catch {
      // The session name is informational only.
    }

    const result = await handle;

    return {
      exit_code: result.exitCode ?? -1,
      session_id: sessionId,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  }

  private resolveExecScriptZipUrls(params: Record<string, unknown>) {
    const zipUrl = typeof params.zipUrl === 'string' ? params.zipUrl : undefined;
    if (zipUrl) return { [this.resolveLegacyExecScriptSkillName(params)]: zipUrl };

    if (!isRecord(params.skillZipUrls)) return {};

    const result: Record<string, string> = {};

    for (const [name, value] of Object.entries(params.skillZipUrls)) {
      if (typeof value === 'string' && value) {
        result[name] = value;
      }
    }

    return result;
  }

  private resolveLegacyExecScriptSkillName(params: Record<string, unknown>) {
    const configName = isRecord(params.config) ? params.config.name : undefined;
    if (typeof configName === 'string' && configName) return configName;

    if (Array.isArray(params.activatedSkills)) {
      for (const skill of [...params.activatedSkills].reverse()) {
        if (!isRecord(skill)) continue;

        const name = typeof skill.name === 'string' ? skill.name : undefined;
        if (name) return name;
      }
    }

    return 'default';
  }

  private resolveExecScriptSkillName(
    params: Record<string, unknown>,
    skillZipUrls: Record<string, string>,
  ) {
    const configName = isRecord(params.config) ? params.config.name : undefined;
    if (typeof configName === 'string' && skillZipUrls[configName]) return configName;

    if (Array.isArray(params.activatedSkills)) {
      for (const skill of [...params.activatedSkills].reverse()) {
        if (!isRecord(skill)) continue;

        const name = typeof skill.name === 'string' ? skill.name : undefined;
        if (name && skillZipUrls[name]) return name;
      }
    }

    const [firstName] = Object.keys(skillZipUrls);
    return firstName;
  }

  private skillWorkspaceDir(skillZipUrls: Record<string, string>) {
    const entries = Object.entries(skillZipUrls).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const cacheKey = sha256(JSON.stringify(entries)).slice(0, 32);
    return `${SKILL_ARCHIVE_CACHE_DIR}/${cacheKey || 'default'}`;
  }

  private buildSkillSetupCommand({
    skillZipUrls,
    workspaceDir,
  }: {
    skillZipUrls: Record<string, string>;
    workspaceDir: string;
  }) {
    const quotedWorkspaceDir = this.shellQuote(workspaceDir);
    const setupCommands = Object.entries(skillZipUrls).map(([name, zipUrl]) => {
      const skillDir = `${workspaceDir}/${this.safeSkillDirName(name)}`;
      const markerPath = `${skillDir}/.prepared`;
      const archivePath = `${skillDir}/skill.zip`;
      const quotedArchivePath = this.shellQuote(archivePath);
      const quotedDir = this.shellQuote(skillDir);
      const quotedMarkerPath = this.shellQuote(markerPath);
      const quotedUrl = this.shellQuote(zipUrl);

      return `if [ ! -f ${quotedMarkerPath} ]; then rm -rf ${quotedDir} && mkdir -p ${quotedDir} && curl -fsSL ${quotedUrl} -o ${quotedArchivePath} && unzip -q ${quotedArchivePath} -d ${quotedDir} && printf prepared > ${quotedMarkerPath}; fi`;
    });

    return [
      `mkdir -p ${this.shellQuote(SKILL_ARCHIVE_CACHE_DIR)}`,
      `mkdir -p ${quotedWorkspaceDir}`,
      ...setupCommands,
    ].join(' && ');
  }

  private safeSkillDirName(name: string) {
    return name.replaceAll(/[^\w.-]/g, '-');
  }

  private shellQuote(value: string) {
    return `'${value.replaceAll("'", "'\\''")}'`;
  }

  // ----------------------------- files -----------------------------

  private async listFiles(params: Record<string, unknown>): Promise<SandboxCallToolResult> {
    const sandbox = await this.getSandbox();
    const directory = String(params.directoryPath || '.');
    const entries = await sandbox.files.list(directory);

    const files = entries.map((entry) => ({
      isDirectory: entry.isDir,
      mtime: Math.floor(new Date(entry.modTime).getTime() / 1000),
      name: entry.name,
      path: directory === '.' ? entry.name : `${directory.replace(/\/+$/, '')}/${entry.name}`,
      size: entry.size,
    }));

    return {
      result: { files, totalCount: files.length },
      success: true,
    };
  }

  private async readFile(params: Record<string, unknown>): Promise<SandboxCallToolResult> {
    const sandbox = await this.getSandbox();
    const path = String(params.path || '');
    const start = params.startLine as number | undefined;
    const end = params.endLine as number | undefined;

    try {
      const text = await sandbox.files.read(path);

      let content = text;
      if (start !== undefined || end !== undefined) {
        const lines = text.split('\n');
        const startIdx = Math.max((start ?? 1) - 1, 0);
        const endIdx = end ?? lines.length;
        content = lines.slice(startIdx, endIdx).join('\n');
      }

      return {
        result: {
          charCount: content.length,
          content,
          filename: path.split('/').at(-1) ?? path,
          totalCharCount: text.length,
          totalLineCount: text.split('\n').length,
        },
        success: true,
      };
    } catch (error) {
      return this.errorResult((error as Error).message);
    }
  }

  private async writeFile(params: Record<string, unknown>): Promise<SandboxCallToolResult> {
    const path = String(params.path || '');

    if (!path) {
      return this.errorResult('path is required');
    }

    const sandbox = await this.getSandbox();
    const content = String(params.content || '');
    // The files API creates missing parent directories itself.
    await sandbox.files.write(path, content);

    return {
      result: {
        bytesWritten: Buffer.byteLength(content),
        success: true,
      },
      success: true,
    };
  }

  /**
   * File helpers that need real filesystem semantics (edit, search, grep,
   * glob, move) run as small Node scripts inside the sandbox — the same
   * base64-encoded-JSON pattern the Onlyboxes provider uses with python3.
   */
  private async runNodeScript(
    script: string,
    params: Record<string, unknown>,
    timeoutMs = this.timeout(params),
  ): Promise<SandboxCallToolResult> {
    const sandbox = await this.getSandbox();
    const scriptPath = `${NODE_SCRIPTS_DIR}/${sha256(script).slice(0, 32)}.js`;

    await sandbox.files.write(scriptPath, script);

    const encoded = Buffer.from(JSON.stringify(params)).toString('base64');
    const result = await sandbox.exec(
      `node ${this.shellQuote(scriptPath)} ${this.shellQuote(encoded)}`,
      { timeoutSec: Math.max(1, Math.ceil(timeoutMs / 1000)) },
    );

    if (result.exitCode !== 0) {
      return {
        error: { message: result.stderr || result.stdout || 'Railway sandbox script failed' },
        result: null,
        success: false,
      };
    }

    try {
      const parsed = JSON.parse(result.stdout || '{}') as Record<string, unknown>;

      if (parsed.success === false) {
        return {
          error: { message: String(parsed.error || 'Railway sandbox script failed') },
          result: parsed,
          success: false,
        };
      }

      return {
        result: parsed,
        success: true,
      };
    } catch (error) {
      return {
        error: {
          message: `Failed to parse Railway sandbox script output: ${(error as Error).message}`,
        },
        result: { output: result.stdout, stderr: result.stderr },
        success: false,
      };
    }
  }

  // ----------------------------- misc -----------------------------

  private timeout(params: Record<string, unknown>) {
    const value = params.timeout ?? params.timeout_ms;
    return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_TIMEOUT_MS;
  }

  private errorResult(message: string, name?: string): SandboxCallToolResult {
    return {
      error: { message, name },
      result: null,
      success: false,
    };
  }
}

// ----------------------------- sandbox scripts -----------------------------
// Ported from the Onlyboxes provider's python helpers so both providers return
// identical shapes. Each script receives base64-encoded JSON via argv and
// prints a single JSON object.

const scriptPrelude = `
import fs from 'node:fs';

const args = JSON.parse(Buffer.from(process.argv[2] || '', 'base64').toString('utf8'));

function emit(value) {
  process.stdout.write(JSON.stringify(value));
}

function walk(root) {
  const results = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const filePath = current === '.' || current === '' ? entry.name : current + '/' + entry.name;
      if (entry.isDirectory()) {
        stack.push(filePath);
      } else if (entry.isFile()) {
        let stat;
        try {
          stat = fs.statSync(filePath);
        } catch {
          continue;
        }
        results.push({ mtime: Math.floor(stat.mtimeMs / 1000), path: filePath, size: stat.size });
      }
    }
  }
  return results;
}

function parseTime(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time / 1000;
}

function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '[^/]';
    } else if ('.+^{}()|[]$\\\\'.includes(char)) {
      out += '\\\\' + char;
    } else {
      out += char;
    }
  }
  return new RegExp('^' + out + '$');
}
`;

const searchFilesScript = `${scriptPrelude}
function main() {
  const directory = args.directory || '.';
  const rawKeywords = args.keywords || args.keyword || '';
  const keywords = String(rawKeywords).split(/\\s+/).filter(Boolean);
  const rawFileTypes = args.fileTypes || args.fileType || [];
  const fileTypeList = Array.isArray(rawFileTypes) ? rawFileTypes : [rawFileTypes];
  const fileTypes = fileTypeList
    .filter((item) => String(item).trim())
    .map((item) => (String(item).startsWith('.') ? String(item) : '.' + item));
  const modifiedAfter = parseTime(args.modifiedAfter);
  const modifiedBefore = parseTime(args.modifiedBefore);
  const contentContains = args.contentContains;
  let results = walk(directory);

  if (keywords.length > 0) {
    results = results.filter((item) => {
      const name = item.path.split('/').at(-1) || '';
      return keywords.every((keyword) => name.includes(keyword));
    });
  }
  if (fileTypes.length > 0) {
    results = results.filter((item) => fileTypes.some((type) => item.path.endsWith(type)));
  }
  if (modifiedAfter !== null) {
    results = results.filter((item) => item.mtime >= modifiedAfter);
  }
  if (modifiedBefore !== null) {
    results = results.filter((item) => item.mtime <= modifiedBefore);
  }
  if (contentContains) {
    results = results.filter((item) => {
      try {
        return fs.readFileSync(item.path, 'utf8').includes(contentContains);
      } catch {
        return false;
      }
    });
  }

  const named = results.map((item) => ({ ...item, name: item.path.split('/').at(-1) }));

  const sortBy = args.sortBy;
  const reverse = args.sortDirection === 'desc';
  if (sortBy === 'size') {
    named.sort((a, b) => ((a.size || 0) - (b.size || 0)) * (reverse ? -1 : 1));
  } else if (sortBy === 'date') {
    named.sort((a, b) => (a.mtime - b.mtime) * (reverse ? -1 : 1));
  } else {
    named.sort((a, b) => (a.name || '').localeCompare(b.name || '') * (reverse ? -1 : 1));
  }

  const total = named.length;
  const limited = typeof args.limit === 'number' && args.limit > 0 ? named.slice(0, args.limit) : named;
  emit({ results: limited, totalCount: total });
}

main();
`;

const moveFilesScript = `${scriptPrelude}
function main() {
  const results = [];
  for (const op of args.operations || []) {
    try {
      fs.mkdirSync(op.destination.split('/').slice(0, -1).join('/'), { recursive: true });
      fs.renameSync(op.source, op.destination);
      results.push({ destination: op.destination, source: op.source, success: true });
    } catch (error) {
      results.push({ destination: op.destination, error: String(error), source: op.source, success: false });
    }
  }
  emit({ results, successCount: results.filter((r) => r.success).length });
}

main();
`;

const grepContentScript = `${scriptPrelude}
function main() {
  const directory = args.directory || '.';
  const pattern = args.pattern || '';
  const filePattern = args.filePattern || '*';
  const recursive = args.recursive !== false;
  const regex = new RegExp(pattern);
  const matcher = globToRegExp(filePattern);
  const matches = [];

  const candidates = [];
  if (recursive) {
    for (const item of walk(directory)) candidates.push(item.path);
  } else {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile()) {
        candidates.push(directory === '.' || directory === '' ? entry.name : directory + '/' + entry.name);
      }
    }
  }

  for (const filePath of candidates) {
    const name = filePath.split('/').at(-1) || '';
    if (!matcher.test(name)) continue;
    let lines;
    try {
      lines = fs.readFileSync(filePath, 'utf8').split('\\n');
    } catch {
      continue;
    }
    for (let index = 0; index < lines.length; index++) {
      if (regex.test(lines[index])) {
        matches.push({ line: lines[index], lineNumber: index + 1, path: filePath });
      }
    }
  }

  emit({ matches, totalMatches: matches.length });
}

main();
`;

const globFilesScript = `${scriptPrelude}
function main() {
  const directory = args.directory || '.';
  const pattern = args.pattern || '*';
  const regex = globToRegExp(pattern);
  const files = walk(directory)
    .map((item) => item.path)
    .filter((filePath) => regex.test(filePath));
  emit({ files, totalCount: files.length });
}

main();
`;

const editFileScript = `${scriptPrelude}
function main() {
  const filePath = args.path;
  const search = args.search || '';
  const replace = args.replace || '';
  const text = fs.readFileSync(filePath, 'utf8');
  const count = search ? text.split(search).length - 1 : 0;
  if (count === 0) {
    emit({ error: 'search text not found', replacements: 0, success: false });
    return;
  }
  const new_text = args.all ? text.split(search).join(replace) : text.replace(search, replace);
  fs.writeFileSync(filePath, new_text);
  emit({
    linesAdded: replace.split('\\n').length - 1,
    linesDeleted: search.split('\\n').length - 1,
    replacements: args.all ? count : 1,
    success: true,
  });
}

main();
`;
