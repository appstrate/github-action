// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

/**
 * Token consumption reported for a run. Every member is optional: the platform
 * stores the runner's payload verbatim in JSONB and declares none of the four
 * buckets required, so a runner may report a subset (and provider-specific
 * extras beyond them).
 */
export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * The subset of the run wire resource this action reads. Field names and
 * nullability follow the platform's OpenAPI `Run` schema — `duration` is
 * `integer | null` (null until the run reaches a terminal state), and token
 * counts arrive as the `token_usage` OBJECT, never as a scalar.
 */
export interface RunResult {
  id: string;
  status: "pending" | "running" | "success" | "failed" | "timeout" | "cancelled";
  /** `{ output: … }` — the agent's structured output is nested under `output`. */
  result: Record<string, unknown> | null;
  error: string | null;
  duration: number | null;
  token_usage: TokenUsage | null;
  cost: number | null;
}

/**
 * Render token usage as a one-line breakdown, or null when the platform
 * reported none. Deliberately NOT a single total: `cache_read_input_tokens`
 * and `input_tokens` are billed at different rates, so adding them would be a
 * pricing judgement this action has no basis to make.
 */
export function formatTokenUsage(usage: TokenUsage | null | undefined): string | null {
  if (!usage) return null;
  const parts: string[] = [];
  if (usage.input_tokens !== undefined) parts.push(`${usage.input_tokens} in`);
  if (usage.output_tokens !== undefined) parts.push(`${usage.output_tokens} out`);
  if (usage.cache_read_input_tokens !== undefined) {
    parts.push(`${usage.cache_read_input_tokens} cache read`);
  }
  if (usage.cache_creation_input_tokens !== undefined) {
    parts.push(`${usage.cache_creation_input_tokens} cache write`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * `POST /agents/{scope}/{name}/run` returns `201` + the bare created run
 * resource (same shape as `GET /runs/{id}`). We only read its `id` — the
 * legacy `runId` alias was removed (appstrate/appstrate#657).
 */
interface TriggerResponse {
  id: string;
}

/** HTTP client for the Appstrate API. Handles run triggering and polling. */
export class AppstrateClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  /** Trigger an agent run. Returns the run ID. */
  async triggerRun(
    scope: string,
    name: string,
    options?: {
      version?: string;
      input?: Record<string, unknown>;
    }
  ): Promise<string> {
    const url = new URL(`/api/agents/${scope}/${encodeURIComponent(name)}/run`, this.baseUrl);
    if (options?.version) {
      url.searchParams.set("version", options.version);
    }

    const body: Record<string, unknown> = {};
    if (options?.input) body.input = options.input;

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to trigger run (${res.status}): ${text}`);
    }

    const data = (await res.json()) as TriggerResponse;
    return data.id;
  }

  /** Fetch a run by ID. */
  async getRun(runId: string): Promise<RunResult> {
    const url = new URL(`/api/runs/${encodeURIComponent(runId)}`, this.baseUrl);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to get run (${res.status}): ${text}`);
    }

    return (await res.json()) as RunResult;
  }

  /** Poll a run until it reaches a terminal state, with exponential backoff. */
  async pollUntilDone(
    runId: string,
    timeoutMs: number,
    onProgress?: (run: RunResult) => void
  ): Promise<RunResult> {
    const deadline = Date.now() + timeoutMs;
    let interval = 2000;
    const maxInterval = 10000;

    while (Date.now() < deadline) {
      const run = await this.getRun(runId);

      if (onProgress) onProgress(run);

      if (run.status !== "pending" && run.status !== "running") {
        return run;
      }

      await sleep(Math.min(interval, deadline - Date.now()));
      interval = Math.min(interval * 1.5, maxInterval);
    }

    throw new Error(`Run ${runId} did not complete within ${timeoutMs / 1000}s`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}
