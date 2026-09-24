// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import { describe, it, expect } from "bun:test";
import { assertApiKey } from "../../src/api-key.js";

/**
 * Minted with the platform's algorithm (`apps/api/src/services/api-keys.ts`:
 * `Bun.hash.crc32` over the 30 random characters, base62, 6 characters).
 */
const PLATFORM_KEYS = [
  "apst_0000000000000000000000000000002C8GjS",
  "apst_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz4IlJEz",
  "apst_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC12qUI4f",
];

describe("assertApiKey", () => {
  it("accepts keys the platform mints", () => {
    for (const key of PLATFORM_KEYS) expect(() => assertApiKey(key)).not.toThrow();
  });

  it("refuses the retired ask_ format with the migration message", () => {
    expect(() => assertApiKey("ask_abcd1234efgh5678")).toThrow(
      "API key format retired: create a new key (apst_…) in Appstrate and update the secret"
    );
  });

  it("refuses a truncated key", () => {
    expect(() => assertApiKey(PLATFORM_KEYS[2].slice(0, -1))).toThrow(
      "is not an Appstrate API key"
    );
  });

  it("refuses a key with a non-base62 character", () => {
    expect(() => assertApiKey("apst_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC-2qUI4f")).toThrow(
      "is not an Appstrate API key"
    );
  });

  it("refuses surrounding whitespace rather than trimming it", () => {
    expect(() => assertApiKey(` ${PLATFORM_KEYS[0]}`)).toThrow("is not an Appstrate API key");
  });
});
