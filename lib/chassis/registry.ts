// Adapted from @ai8future/registry v6.0.8 — file-based service registration at /tmp/chassis/
//
// Provides heartbeat, command polling, status/error logging via JSONL files,
// and custom command registration. All state is module-level.

import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { basename, join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CmdInfo {
  name: string;
  description: string;
  fn: () => void;
}

export interface PortInfo {
  port: number;
  role: string;
  proto: string;
  label: string;
}

export interface PortOpts {
  proto?: string;
}

export interface CommandInfo {
  name: string;
  description: string;
  builtin?: boolean;
}

export interface Registration {
  name: string;
  pid: number;
  hostname: string;
  started_at: string;
  version: string;
  language: string;
  chassis_version: string;
  args: string[];
  base_port: number;
  ports: PortInfo[];
  commands: CommandInfo[];
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let active = false;
let registration: Registration | undefined;
let serviceDir = '';
let pidFile = '';
let logFile = '';

let abortController: AbortController | undefined;

const handlers = new Map<string, CmdInfo>();
const declaredPorts: PortInfo[] = [];

let _restartFlag = false;

let basePath = '/tmp/chassis';
let heartbeatMs = 30_000;
let cmdPollMs = 3_000;

const MAX_SERVICE_NAME_LEN = 64;
const MAX_LOG_SIZE = 10_485_760; // 10MB

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ROLE_NAMES: Record<number, string> = { 0: 'http', 1: 'grpc', 2: 'metrics' };
const DEFAULT_PROTO: Record<string, string> = { http: 'http', grpc: 'h2c', metrics: 'http' };

export function handle(name: string, description: string, fn: () => void): void {
  handlers.set(name, { name, description, fn });
}

export function port(role: number, portNum: number, label: string, opts?: PortOpts): void {
  const roleName = ROLE_NAMES[role] ?? `custom_${role}`;
  const proto = opts?.proto ?? DEFAULT_PROTO[roleName] ?? 'http';
  declaredPorts.push({ port: portNum, role: roleName, proto, label });
}

export function status(msg: string): void {
  if (!active) return;
  appendEvent('status', msg);
}

export function error(msg: string, err?: unknown): void {
  if (!active) return;
  const detail = err instanceof Error ? err.message : err !== undefined ? String(err) : undefined;
  appendEvent('error', msg, detail);
}

export function restartRequested(): boolean {
  if (_restartFlag) return true;
  if (!serviceDir) return false;
  const cmdFile = join(serviceDir, `${process.pid}.cmd.json`);
  try {
    const raw = readFileSync(cmdFile, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return false;
    const cmd = parsed as Record<string, unknown>;
    return cmd.command === 'restart';
  } catch {
    return false;
  }
}

export function init(abort: AbortController, chassisVersion: string): void {
  abortController = abort;

  const rawService = process.env.CHASSIS_SERVICE_NAME ?? basename(process.cwd());
  const service = sanitizeServiceName(rawService);
  let version = 'unknown';
  try {
    version = readFileSync(join(process.cwd(), 'VERSION'), 'utf-8').trim();
  } catch {
    // VERSION file not found
  }

  serviceDir = join(basePath, service);
  mkdirSync(serviceDir, { recursive: true });
  try {
    chmodSync(basePath, 0o700);
    chmodSync(serviceDir, 0o700);
  } catch {
    // Best-effort
  }

  pidFile = join(serviceDir, `${process.pid}.json`);
  logFile = join(serviceDir, 'log.jsonl');

  const commands: CommandInfo[] = [
    { name: 'stop', description: 'Graceful shutdown', builtin: true },
    { name: 'restart', description: 'Restart with same arguments', builtin: true },
  ];
  for (const [, handler] of handlers) {
    commands.push({ name: handler.name, description: handler.description });
  }

  registration = {
    name: service,
    pid: process.pid,
    hostname: hostname(),
    started_at: new Date().toISOString(),
    version,
    language: 'typescript',
    chassis_version: chassisVersion,
    args: [...process.argv],
    base_port: djb2Port(service),
    ports: [...declaredPorts],
    commands,
  };

  const tmpFile = `${pidFile}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(registration, null, 2));
  renameSync(tmpFile, pidFile);

  active = true;
  appendEvent('startup', `${service} v${version} started (chassis v${chassisVersion})`);

  cleanStale();
}

export function startHeartbeat(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }

    const interval = setInterval(() => {
      if (!active || !registration) return;
      try {
        const tmpFile = `${pidFile}.tmp`;
        writeFileSync(tmpFile, JSON.stringify(registration, null, 2));
        renameSync(tmpFile, pidFile);
      } catch {
        // Ignore write errors in heartbeat
      }
    }, heartbeatMs);

    signal.addEventListener('abort', () => { clearInterval(interval); resolve(); }, { once: true });
  });
}

export function startCommandPoll(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }

    const interval = setInterval(() => { pollOnce(); }, cmdPollMs);

    signal.addEventListener('abort', () => { clearInterval(interval); resolve(); }, { once: true });
  });
}

export function shutdown(reason: string): void {
  if (!active) return;
  appendEvent('shutdown', reason);
  try { unlinkSync(pidFile); } catch { /* PID file may already be gone */ }
  active = false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function appendEvent(type: string, message: string, detail?: string): void {
  const event: Record<string, unknown> = {
    type,
    message,
    timestamp: new Date().toISOString(),
    pid: process.pid,
  };
  if (detail !== undefined) event.detail = detail;
  try {
    const stats = statSync(logFile);
    if (stats.size > MAX_LOG_SIZE) {
      try { unlinkSync(`${logFile}.old`); } catch { /* ignore */ }
      renameSync(logFile, `${logFile}.old`);
    }
  } catch {
    // File may not exist yet
  }
  appendFileSync(logFile, `${JSON.stringify(event)}\n`);
}

function pollOnce(): void {
  if (!active) return;
  const cmdFile = join(serviceDir, `${process.pid}.cmd.json`);
  const processingFile = join(serviceDir, `${process.pid}.cmd.processing`);
  let raw: string;
  try {
    renameSync(cmdFile, processingFile);
    raw = readFileSync(processingFile, 'utf-8');
    unlinkSync(processingFile);
  } catch {
    return;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const cmd = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    if (typeof cmd.command === 'string' && cmd.command) {
      if (cmd.command === 'stop') {
        appendEvent('command', 'stop requested');
        abortController?.abort();
        return;
      }
      if (cmd.command === 'restart') {
        _restartFlag = true;
        appendEvent('command', 'restart requested');
        abortController?.abort();
        return;
      }
      const handler = handlers.get(cmd.command);
      if (handler) {
        handler.fn();
        appendEvent('command', `executed command: ${cmd.command}`);
      } else {
        appendEvent('command', `unknown command: ${cmd.command}`);
      }
    }
  } catch {
    appendEvent('error', 'failed to parse command file');
  }
}

function cleanStale(): void {
  try {
    const entries = readdirSync(serviceDir);
    for (const entry of entries) {
      if (entry.endsWith('.processing')) {
        try { unlinkSync(join(serviceDir, entry)); } catch { /* ignore */ }
        continue;
      }
      if (!entry.endsWith('.json') || entry.endsWith('.cmd.json')) continue;
      if (entry === `${process.pid}.json`) continue;

      const match = entry.match(/^(\d+)\.json$/);
      if (!match?.[1]) continue;

      const pid = Number.parseInt(match[1], 10);
      if (!isProcessAlive(pid)) {
        try { unlinkSync(join(serviceDir, entry)); } catch { /* ignore */ }
      }
    }
  } catch {
    // Ignore errors during stale cleanup
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function djb2Port(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = (h * 33 + name.charCodeAt(i)) >>> 0;
  }
  return 5000 + (h % 43001);
}

function sanitizeServiceName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!sanitized || sanitized.includes('..') || sanitized.startsWith('.')) {
    return 'unknown_service';
  }
  if (sanitized.length > MAX_SERVICE_NAME_LEN) {
    sanitized = sanitized.slice(0, MAX_SERVICE_NAME_LEN);
  }
  return sanitized;
}
