// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

/**
 * Appstrate API key format: `apst_` + 30 base62 random characters + a
 * 6-character base62 checksum (41 characters in total). Only the shape is
 * checked here: the platform validates the checksum before any lookup and
 * answers a mistyped key with a 401.
 */
const API_KEY_RE = /^apst_[0-9A-Za-z]{36}$/;
const RETIRED_PREFIX = "ask_";

/**
 * Refuse a key the platform would refuse, before any request is made: the
 * retired `ask_` format (the server answers `401 api_key_format_retired`), and
 * a key that does not have the `apst_` shape.
 */
export function assertApiKey(apiKey: string): void {
  if (apiKey.startsWith(RETIRED_PREFIX)) {
    throw new Error(
      "API key format retired: create a new key (apst_…) in Appstrate and update the secret"
    );
  }
  if (!API_KEY_RE.test(apiKey)) {
    throw new Error(
      "appstrate-api-key is not an Appstrate API key: expected apst_ followed by 36 letters or digits"
    );
  }
}
