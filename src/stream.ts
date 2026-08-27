// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import * as core from "@actions/core";

interface SSEEvent {
  event: string;
  data: string;
}

/**
 * `run_update` frame. The full frame also carries `operation`, `id`,
 * `packageId`, `userId`, `endUserId`, `orgId`, `spaceId`, `scheduleId`,
 * `error`, `startedAt`, `completedAt` and `duration` — none of which this
 * action reads. Notably it never carries `result`: the structured output is
 * only available from `GET /runs/{id}`, which is why this stream is a progress
 * feed and not a source of the run's outcome.
 */
interface RunUpdatePayload {
  status: string;
}

/** `run_log` frame — the members this action renders into the CI log. */
interface RunLogPayload {
  message?: string;
  level?: string;
}

/**
 * Stream run progress via SSE, returning once the run reports a terminal
 * status or the stream gives up (connection refused, timeout, parse failure).
 *
 * It reports no outcome on purpose: `run_update` frames carry a status and
 * nothing else, and the stream has no replay — a backed-up subscriber is
 * dropped and loses frames silently. The caller must therefore confirm the
 * terminal state with `GET /runs/{id}` either way, which it does
 * unconditionally.
 */
export async function streamUntilDone(
  baseUrl: string,
  apiKey: string,
  runId: string,
  timeoutMs: number,
  onLog?: (message: string) => void,
  onStatusChange?: (status: string) => void
): Promise<void> {
  const url = new URL(`/api/realtime/runs/${encodeURIComponent(runId)}`, baseUrl);
  // Token in query param: required by the Appstrate SSE API (EventSource cannot send headers).
  // The API key is masked via core.setSecret() so it won't appear in CI logs.
  url.searchParams.set("token", apiKey);
  url.searchParams.set("verbose", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      core.info(`SSE connection failed (${res.status}), falling back to polling`);
      return;
    }

    core.info("Connected to live stream");

    for await (const event of parseSSE(res.body)) {
      if (event.event === "ping") continue;

      if (event.event === "run_update") {
        const payload = tryParse<RunUpdatePayload>(event.data);
        if (!payload) continue;

        if (onStatusChange) onStatusChange(payload.status);

        const terminal = ["success", "failed", "timeout", "cancelled"];
        if (terminal.includes(payload.status)) break;
      }

      if (event.event === "run_log") {
        const payload = tryParse<RunLogPayload>(event.data);
        if (!payload) continue;

        if (payload.message && onLog) {
          const prefix = payload.level === "error" ? "[ERROR] " : "";
          onLog(`${prefix}${payload.message}`);
        }
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      core.info("SSE stream timed out");
      return;
    }
    core.info(
      `SSE stream error: ${err instanceof Error ? err.message : err}, falling back to polling`
    );
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";
  let currentData = "";

  const reader = body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line === "") {
          // Empty line = end of event
          if (currentData) {
            yield { event: currentEvent, data: currentData };
          }
          currentEvent = "message";
          currentData = "";
          continue;
        }

        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          currentData = currentData ? `${currentData}\n${data}` : data;
        }
        // Ignore comments (lines starting with ':') and unknown fields
      }
    }

    // Flush remaining event
    if (currentData) {
      yield { event: currentEvent, data: currentData };
    }
  } finally {
    reader.releaseLock();
  }
}

function tryParse<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
