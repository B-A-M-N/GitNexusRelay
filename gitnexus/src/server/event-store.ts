/**
 * Event Store
 *
 * Lightweight append-only event log for agent activity tracking.
 * Uses JSONL files under ~/.gitnexus/runs/ so both the MCP server
 * (stdio or HTTP) and the web UI server can share state without
 * a separate database process.
 *
 * Each run gets its own .jsonl file. Runs are listed via the
 * directory listing. No locking needed — append-only writes are
 * atomic on all modern filesystems for single-line payloads.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RunEvent {
  /** Monotonic event ID within the run (assigned by append) */
  id: number;
  /** Run this event belongs to */
  run_id: string;
  /** Who emitted: "mcp" for MCP tool calls, "system" for server events */
  source: 'mcp' | 'system';
  /** Which client: "claude-code", "cursor", "codex", etc. */
  client?: string;
  /** Event type: tool.start, tool.complete, tool.error, run.start, run.end */
  event: string;
  /** Human-readable message */
  message?: string;
  /** Structured payload — tool name, params, node IDs, etc. */
  payload?: Record<string, unknown>;
  /** ISO-8601 timestamp */
  timestamp: string;
}

export interface RunSummary {
  run_id: string;
  client?: string;
  started_at: string;
  updated_at: string;
  event_count: number;
  status: 'running' | 'completed' | 'error';
}

// ── Paths ──────────────────────────────────────────────────────────────────

const GITNEXUS_DIR = path.join(os.homedir(), '.gitnexus');
const RUNS_DIR = path.join(GITNEXUS_DIR, 'runs');

const ensureDirs = (): void => {
  if (!fs.existsSync(GITNEXUS_DIR)) {
    fs.mkdirSync(GITNEXUS_DIR, { recursive: true });
  }
  if (!fs.existsSync(RUNS_DIR)) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
  }
};

const runFilePath = (runId: string): string => path.join(RUNS_DIR, `${runId}.jsonl`);

// ── Run lifecycle ──────────────────────────────────────────────────────────

/** Create a new run and return its ID. */
export function createRun(client?: string): string {
  ensureDirs();
  const runId = `gnx_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const event: RunEvent = {
    id: 1,
    run_id: runId,
    source: 'system',
    client,
    event: 'run.start',
    message: 'Run started',
    timestamp: now,
  };
  fs.writeFileSync(runFilePath(runId), JSON.stringify(event) + '\n', 'utf-8');
  return runId;
}

/** Mark a run as completed. */
export function completeRun(runId: string): void {
  appendEvent(runId, {
    source: 'system',
    event: 'run.end',
    message: 'Run completed',
  });
}

/** Mark a run as failed. */
export function failRun(runId: string, error: string): void {
  appendEvent(runId, {
    source: 'system',
    event: 'run.error',
    message: 'Run failed',
    payload: { error },
  });
}

// ── Event append ───────────────────────────────────────────────────────────

/**
 * Append an event to a run's JSONL file.
 * Auto-assigns the next sequential event ID.
 */
export function appendEvent(
  runId: string,
  event: Omit<RunEvent, 'id' | 'run_id' | 'timestamp'>,
): void {
  ensureDirs();
  const filePath = runFilePath(runId);

  // Count existing lines to determine next ID
  let nextId = 1;
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    nextId = lines.length + 1;
  }

  const record: RunEvent = {
    ...event,
    id: nextId,
    run_id: runId,
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
}

// ── Event read ─────────────────────────────────────────────────────────────

/**
 * Read all events for a run, optionally only those after a given event ID.
 * Used by the SSE endpoint for streaming + reconnection.
 */
export function getEvents(runId: string, afterId?: number): RunEvent[] {
  const filePath = runFilePath(runId);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const events: RunEvent[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as RunEvent;
      if (afterId === undefined || event.id > afterId) {
        events.push(event);
      }
    } catch {
      // skip malformed lines
    }
  }

  return events;
}

// ── Run listing ────────────────────────────────────────────────────────────

/** List all runs, most recently updated first. */
export function listRuns(limit = 50): RunSummary[] {
  ensureDirs();
  if (!fs.existsSync(RUNS_DIR)) return [];

  const files = fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith('.jsonl'));
  const summaries: RunSummary[] = [];

  for (const file of files) {
    const runId = file.replace(/\.jsonl$/, '');
    const filePath = path.join(RUNS_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      if (lines.length === 0) continue;

      const first = JSON.parse(lines[0]) as RunEvent;
      const last = JSON.parse(lines[lines.length - 1]) as RunEvent;

      let status: RunSummary['status'] = 'running';
      if (last.event === 'run.end') status = 'completed';
      else if (last.event === 'run.error') status = 'error';

      summaries.push({
        run_id: runId,
        client: first.client,
        started_at: first.timestamp,
        updated_at: last.timestamp,
        event_count: lines.length,
        status,
      });
    } catch {
      // skip corrupt files
    }
  }

  summaries.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return summaries.slice(0, limit);
}

/** Get a single run summary. */
export function getRun(runId: string): RunSummary | null {
  const events = getEvents(runId);
  if (events.length === 0) return null;

  const first = events[0];
  const last = events[events.length - 1];

  let status: RunSummary['status'] = 'running';
  if (last.event === 'run.end') status = 'completed';
  else if (last.event === 'run.error') status = 'error';

  return {
    run_id: runId,
    client: first.client,
    started_at: first.timestamp,
    updated_at: last.timestamp,
    event_count: events.length,
    status,
  };
}
