// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import { describe, it, expect } from "bun:test";

interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEText(raw: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  let currentEvent = "message";
  let currentData = "";

  for (const line of raw.split("\n")) {
    if (line === "") {
      if (currentData) {
        events.push({ event: currentEvent, data: currentData });
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
  }

  if (currentData) {
    events.push({ event: currentEvent, data: currentData });
  }

  return events;
}

describe("SSE parser", () => {
  it("parses a single event", () => {
    const events = parseSSEText('event: run_update\ndata: {"status":"running"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("run_update");
    expect(events[0].data).toBe('{"status":"running"}');
  });

  it("parses multiple events", () => {
    const events = parseSSEText(
      'event: ping\ndata:\n\nevent: run_log\ndata: {"message":"hello"}\n\n'
    );
    expect(events).toHaveLength(1); // ping has empty data, skipped
    expect(events[0].event).toBe("run_log");
  });

  it("handles multi-line data", () => {
    const events = parseSSEText("event: run_log\ndata: line1\ndata: line2\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("line1\nline2");
  });

  it("defaults event to message", () => {
    const events = parseSSEText("data: hello\n\n");
    expect(events[0].event).toBe("message");
  });

  it("handles trailing event without newline", () => {
    const events = parseSSEText('event: run_update\ndata: {"status":"success"}');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("run_update");
  });

  it("ignores comment lines", () => {
    const events = parseSSEText(": this is a comment\nevent: ping\ndata: ok\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("ping");
  });
});
