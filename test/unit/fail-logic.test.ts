// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import { describe, it, expect } from "bun:test";

interface RunResult {
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function determineShouldFail(
  result: RunResult,
  failOn: "fail" | "warning" | "never",
  verdictPath?: string
): string | null {
  if (failOn === "never") return null;
  if (result.status === "timeout") return "Agent run timed out";
  if (result.status === "cancelled") return "Agent run was cancelled";

  if (result.status === "failed") {
    return result.error || "Agent run failed";
  }

  if (verdictPath) {
    if (!result.result) {
      return "Agent produced no result (expected verdict at: " + verdictPath + ")";
    }

    const verdict = getNestedValue(result.result, verdictPath);

    if (verdict === undefined || verdict === null) {
      return "Agent result missing verdict field (expected at: " + verdictPath + ")";
    }

    if (typeof verdict === "string") {
      if (verdict === "fail" || verdict === "failed" || verdict === "failure") {
        return result.error || "Agent verdict: fail";
      }
      if (failOn === "warning" && verdict === "warning") {
        return "Agent verdict: warning";
      }
    }
  }

  return null;
}

describe("determineShouldFail", () => {
  it("returns null when failOn is never", () => {
    const run: RunResult = { status: "failed", result: null, error: "boom" };
    expect(determineShouldFail(run, "never")).toBeNull();
  });

  it("always fails on timeout", () => {
    const run: RunResult = { status: "timeout", result: null, error: null };
    expect(determineShouldFail(run, "never")).toBeNull();
    expect(determineShouldFail(run, "fail")).toContain("timed out");
  });

  it("always fails on cancelled", () => {
    const run: RunResult = { status: "cancelled", result: null, error: null };
    expect(determineShouldFail(run, "fail")).toContain("cancelled");
  });

  it("uses verdict from result when path provided", () => {
    const run: RunResult = {
      status: "success",
      result: { verdict: "fail", summary: "leak found" },
      error: null,
    };
    expect(determineShouldFail(run, "fail", "verdict")).toContain("verdict: fail");
  });

  it("passes when verdict is pass", () => {
    const run: RunResult = { status: "success", result: { verdict: "pass" }, error: null };
    expect(determineShouldFail(run, "fail", "verdict")).toBeNull();
  });

  it("fails on warning when failOn is warning", () => {
    const run: RunResult = { status: "success", result: { verdict: "warning" }, error: null };
    expect(determineShouldFail(run, "fail", "verdict")).toBeNull();
    expect(determineShouldFail(run, "warning", "verdict")).toContain("warning");
  });

  it("falls back to run status when no verdict path", () => {
    const run: RunResult = { status: "failed", result: null, error: "agent crashed" };
    expect(determineShouldFail(run, "fail")).toContain("agent crashed");
  });

  it("returns null on success without verdict path", () => {
    const run: RunResult = { status: "success", result: { data: "ok" }, error: null };
    expect(determineShouldFail(run, "fail")).toBeNull();
  });

  it("fails when verdict path is set but result is null", () => {
    const run: RunResult = { status: "success", result: null, error: null };
    expect(determineShouldFail(run, "fail", "output.verdict")).toContain("produced no result");
  });

  it("fails when verdict path is set but field is missing from result", () => {
    const run: RunResult = {
      status: "success",
      result: { output: { summary: "ok" } },
      error: null,
    };
    expect(determineShouldFail(run, "fail", "output.verdict")).toContain("missing verdict field");
  });

  it("fails when verdict path is set but field is null", () => {
    const run: RunResult = {
      status: "success",
      result: { output: { verdict: null } },
      error: null,
    };
    expect(determineShouldFail(run, "fail", "output.verdict")).toContain("missing verdict field");
  });

  it("uses nested output.verdict path correctly", () => {
    const run: RunResult = {
      status: "success",
      result: { output: { verdict: "fail", summary: "leak found" } },
      error: null,
    };
    expect(determineShouldFail(run, "fail", "output.verdict")).toContain("verdict: fail");
  });

  it("passes with nested output.verdict path when verdict is pass", () => {
    const run: RunResult = {
      status: "success",
      result: { output: { verdict: "pass" } },
      error: null,
    };
    expect(determineShouldFail(run, "fail", "output.verdict")).toBeNull();
  });
});
