/**
 * LiveActivityPanel
 *
 * Shows a real-time feed of MCP tool calls from AI agents.
 * Connects to the /api/runs/:runId/events SSE endpoint and:
 *   - Renders a timeline of tool calls with status indicators
 *   - Highlights queried nodes on the GraphCanvas
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';
import { getBackendUrl } from '../services/backend-client';

interface RunEvent {
  id: number;
  run_id: string;
  source: string;
  client?: string;
  event: string;
  message?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

interface ToolCall {
  runId: string;
  tool: string;
  status: 'running' | 'completed' | 'error';
  nodeIds: string[];
  message?: string;
  resultSummary?: string;
  timestamp: string;
}

const TOOL_ICONS: Record<string, string> = {
  context: '🔬',
  impact: '💥',
  query: '🔍',
  cypher: '🔗',
  detect_changes: '📝',
  rename: '✏️',
  list_repos: '📋',
  search: '🔍',
  explore: '🔬',
  overview: '🗺️',
  route_map: '🗺️',
  shape_check: '✅',
  tool_map: '🔧',
  api_impact: '💥',
};

const getToolIcon = (name: string): string => TOOL_ICONS[name] || '⚡';

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
};

const StatusDot = ({ status }: { status: ToolCall['status'] }) => {
  const colors = {
    running: 'bg-amber-400 animate-pulse',
    completed: 'bg-emerald-400',
    error: 'bg-rose-400',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
};

export const LiveActivityPanel = () => {
  const { triggerNodeAnimation, setHighlightedNodeIds, clearAIToolHighlights } = useAppState();

  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [liveDot, setLiveDot] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const callsRef = useRef<ToolCall[]>([]);

  // Keep ref in sync for SSE callback
  useEffect(() => {
    callsRef.current = toolCalls;
  }, [toolCalls]);

  const connectToRun = useCallback(
    (runId: string) => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      setActiveRunId(runId);
      setToolCalls([]);
      callsRef.current = [];

      const url = `${getBackendUrl()}/api/runs/${runId}/events`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
      };

      es.onmessage = (e) => {
        try {
          const event: RunEvent = JSON.parse(e.data);
          setLiveDot(true);
          setTimeout(() => setLiveDot(false), 500);

          if (event.event === 'tool.start' && event.payload) {
            const tc: ToolCall = {
              runId: event.run_id,
              tool: (event.payload.tool as string) || 'unknown',
              status: 'running',
              nodeIds: (event.payload.nodeIds as string[]) || [],
              message: event.message,
              timestamp: event.timestamp,
            };
            setToolCalls((prev) => [tc, ...prev]);

            // Highlight nodes on graph
            if (tc.nodeIds.length > 0) {
              setHighlightedNodeIds(new Set(tc.nodeIds));
              triggerNodeAnimation(tc.nodeIds, 'pulse');
            }
          } else if (event.event === 'tool.complete' && event.payload) {
            const tool = event.payload.tool as string;
            const resultSummary = event.payload.result_summary as string | undefined;
            setToolCalls((prev) =>
              prev.map((tc) =>
                tc.tool === tool && tc.status === 'running'
                  ? { ...tc, status: 'completed' as const, resultSummary }
                  : tc,
              ),
            );
          } else if (event.event === 'tool.error' && event.payload) {
            const tool = event.payload.tool as string;
            setToolCalls((prev) =>
              prev.map((tc) =>
                tc.tool === tool && tc.status === 'running'
                  ? { ...tc, status: 'error' as const, message: event.message }
                  : tc,
              ),
            );
          } else if (event.event === 'run.end' || event.event === 'run.error') {
            setTimeout(() => clearAIToolHighlights(), 3000);
          }
        } catch {
          // skip malformed events
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        eventSourceRef.current = null;
      };
    },
    [triggerNodeAnimation, setHighlightedNodeIds, clearAIToolHighlights],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-connect to the most recent run on mount
  useEffect(() => {
    const fetchRecentRun = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/runs?limit=1`);
        if (res.ok) {
          const data = await res.json();
          if (data.runs && data.runs.length > 0) {
            connectToRun(data.runs[0].run_id);
          }
        }
      } catch {
        // server might not be running yet
      }
    };
    fetchRecentRun();
  }, [connectToRun]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">Live Activity</span>
          <span
            className={`inline-block h-2 w-2 rounded-full transition-colors ${
              liveDot ? 'bg-emerald-400' : connected ? 'bg-emerald-400/40' : 'bg-text-muted/30'
            }`}
          />
        </div>
        <span className="text-[10px] text-text-muted">
          {connected ? 'connected' : 'disconnected'}
        </span>
      </div>

      {/* Tool call feed */}
      <div className="flex-1 overflow-y-auto">
        {toolCalls.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-text-muted">
            {connected ? 'Waiting for agent activity...' : 'Connect to a run to see live activity'}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {toolCalls.map((tc, i) => (
              <div
                key={`${tc.runId}-${tc.tool}-${i}`}
                className={`rounded-md border px-2.5 py-1.5 text-xs transition-all ${
                  tc.status === 'running'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : tc.status === 'error'
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : 'border-border-subtle bg-surface/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <StatusDot status={tc.status} />
                  <span className="text-sm">{getToolIcon(tc.tool)}</span>
                  <span className="flex-1 font-mono text-text-primary">{tc.tool}</span>
                  <span className="text-[10px] text-text-muted">{formatTime(tc.timestamp)}</span>
                </div>
                {tc.nodeIds.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tc.nodeIds.map((id) => (
                      <span
                        key={id}
                        className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                )}
                {tc.message && tc.status === 'error' && (
                  <div className="mt-1 text-[10px] text-rose-400">{tc.message}</div>
                )}
                {tc.resultSummary && tc.status === 'completed' && (
                  <div className="mt-1 text-[10px] font-medium text-emerald-400/80">
                    {tc.resultSummary}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveActivityPanel;
