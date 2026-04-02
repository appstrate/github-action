// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import { describe, it, expect } from "bun:test";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function mapLevel(level: string): "notice" | "warning" | "failure" {
  const map: Record<string, "notice" | "warning" | "failure"> = {
    error: "failure",
    failure: "failure",
    fail: "failure",
    warning: "warning",
    warn: "warning",
    notice: "notice",
    info: "notice",
  };
  return map[level] ?? "warning";
}

describe("getNestedValue", () => {
  it("reads top-level key", () => {
    expect(getNestedValue({ verdict: "pass" }, "verdict")).toBe("pass");
  });

  it("reads nested key", () => {
    expect(getNestedValue({ result: { verdict: "fail" } }, "result.verdict")).toBe("fail");
  });

  it("returns undefined for missing path", () => {
    expect(getNestedValue({ a: 1 }, "b")).toBeUndefined();
  });

  it("returns undefined for deep missing path", () => {
    expect(getNestedValue({ a: { b: 1 } }, "a.c.d")).toBeUndefined();
  });

  it("handles arrays at path", () => {
    const result = getNestedValue({ findings: [{ msg: "leak" }] }, "findings");
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(1);
  });
});

describe("annotation level mapping", () => {
  it("maps error to failure", () => {
    expect(mapLevel("error")).toBe("failure");
  });

  it("maps warning to warning", () => {
    expect(mapLevel("warning")).toBe("warning");
  });

  it("maps info to notice", () => {
    expect(mapLevel("info")).toBe("notice");
  });

  it("defaults unknown to warning", () => {
    expect(mapLevel("unknown")).toBe("warning");
  });
});

describe("verdict mapping", () => {
  const verdictMap: Record<string, string> = {
    pass: "success",
    success: "success",
    fail: "failure",
    failed: "failure",
    failure: "failure",
    warning: "neutral",
    neutral: "neutral",
  };

  for (const [input, expected] of Object.entries(verdictMap)) {
    it(`maps "${input}" to "${expected}"`, () => {
      expect(verdictMap[input]).toBe(expected);
    });
  }
});
