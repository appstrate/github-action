// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

/** Result of a completed Appstrate agent run. */
export interface RunResult {
  id: string;
  status: "pending" | "running" | "success" | "failed" | "timeout" | "cancelled";
  result: Record<string, unknown> | null;
  error: string | null;
  duration: number;
  tokensUsed: number | null;
  cost: number | null;
}

interface TriggerResponse {
  runId: string;
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
      config?: Record<string, unknown>;
    }
  ): Promise<string> {
    const url = new URL(
      `/api/agents/${encodeURIComponent(scope)}/${encodeURIComponent(name)}/run`,
      this.baseUrl
    );
    if (options?.version) {
      url.searchParams.set("version", options.version);
    }

    const body: Record<string, unknown> = {};
    if (options?.input) body.input = options.input;
    if (options?.config) body.config = options.config;

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
    return data.runId;
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
