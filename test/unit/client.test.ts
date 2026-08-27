// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import { describe, it, expect } from "bun:test";
import { formatTokenUsage } from "../../src/client.js";

describe("formatTokenUsage", () => {
  it("renders every bucket the platform reported", () => {
    expect(
      formatTokenUsage({
        input_tokens: 1200,
        output_tokens: 340,
        cache_read_input_tokens: 8000,
        cache_creation_input_tokens: 512,
      })
    ).toBe("1200 in, 340 out, 8000 cache read, 512 cache write");
  });

  it("renders only the buckets present", () => {
    expect(formatTokenUsage({ input_tokens: 10, output_tokens: 20 })).toBe("10 in, 20 out");
  });

  it("keeps a zero bucket rather than dropping it", () => {
    expect(formatTokenUsage({ input_tokens: 0, output_tokens: 5 })).toBe("0 in, 5 out");
  });

  it("returns null when the run reported no usage", () => {
    expect(formatTokenUsage(null)).toBeNull();
    expect(formatTokenUsage(undefined)).toBeNull();
  });

  it("returns null for an object carrying only unknown pass-through keys", () => {
    // `token_usage` is `additionalProperties: true` — a runner may emit
    // provider-specific extras alongside (or instead of) the four documented
    // buckets. Nothing to render is not the same as "0 tokens".
    expect(formatTokenUsage({ reasoning_tokens: 42 } as Record<string, number>)).toBeNull();
  });
});
