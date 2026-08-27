// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import { describe, it, expect, afterEach } from "bun:test";
import { getInputs, parseAgent } from "../../src/inputs.js";

/**
 * `@actions/core.getInput("foo")` reads `process.env.INPUT_FOO` (name
 * upper-cased, spaces → underscores). Driving `getInputs()` through the
 * environment is therefore the real entry point, not a stand-in for it.
 */
function setInputs(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    process.env[`INPUT_${name.toUpperCase().replace(/ /g, "_")}`] = value;
  }
}

const REQUIRED = {
  "appstrate-url": "https://app.appstrate.dev",
  "appstrate-api-key": "ask_test",
  agent: "@myorg/anti-leak",
  "github-token": "ghp_test",
};

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("INPUT_")) delete process.env[key];
  }
});

describe("getInputs", () => {
  it("reads the required inputs and applies defaults", () => {
    setInputs(REQUIRED);
    const inputs = getInputs();

    expect(inputs.appstrateUrl).toBe("https://app.appstrate.dev");
    expect(inputs.apiKey).toBe("ask_test");
    expect(inputs.agent).toBe("@myorg/anti-leak");
    expect(inputs.githubToken).toBe("ghp_test");
    expect(inputs.timeout).toBe(300);
    expect(inputs.outputMode).toBe("full");
    expect(inputs.failOn).toBe("fail");
    expect(inputs.input).toBeUndefined();
    expect(inputs.agentVersion).toBeUndefined();
  });

  it("strips trailing slashes from the instance URL", () => {
    setInputs({ ...REQUIRED, "appstrate-url": "https://app.appstrate.dev///" });
    expect(getInputs().appstrateUrl).toBe("https://app.appstrate.dev");
  });

  it("rejects an API key without the ask_ prefix", () => {
    setInputs({ ...REQUIRED, "appstrate-api-key": "sk_live_nope" });
    expect(() => getInputs()).toThrow("appstrate-api-key must start with 'ask_'");
  });

  it("rejects a malformed agent identifier", () => {
    setInputs({ ...REQUIRED, agent: "myorg/anti-leak" });
    expect(() => getInputs()).toThrow("Invalid agent format");
  });

  it("parses the input JSON object", () => {
    setInputs({ ...REQUIRED, input: '{"days": 30}' });
    expect(getInputs().input).toEqual({ days: 30 });
  });

  it("rejects input that is not valid JSON", () => {
    setInputs({ ...REQUIRED, input: "days=30" });
    expect(() => getInputs()).toThrow("input must be valid JSON");
  });

  it("rejects a non-positive timeout", () => {
    setInputs({ ...REQUIRED, timeout: "0" });
    expect(() => getInputs()).toThrow("timeout must be a positive integer");
  });

  it("rejects an unknown output-mode", () => {
    setInputs({ ...REQUIRED, "output-mode": "verbose" });
    expect(() => getInputs()).toThrow("output-mode must be one of");
  });

  it("resolves fail-on aliases", () => {
    setInputs({ ...REQUIRED, "fail-on": "errors" });
    expect(getInputs().failOn).toBe("fail");
    setInputs({ ...REQUIRED, "fail-on": "none" });
    expect(getInputs().failOn).toBe("never");
  });

  it("rejects an unknown fail-on", () => {
    setInputs({ ...REQUIRED, "fail-on": "sometimes" });
    expect(() => getInputs()).toThrow("fail-on must be one of");
  });

  it("carries the mapping paths through", () => {
    setInputs({
      ...REQUIRED,
      "verdict-path": "output.verdict",
      "summary-path": "output.summary",
      "annotations-path": "output.findings",
    });
    expect(getInputs().mapping).toEqual({
      verdictPath: "output.verdict",
      summaryPath: "output.summary",
      annotationsPath: "output.findings",
    });
  });

  it("treats an empty mapping path as unset, disabling the verdict gate", () => {
    setInputs({ ...REQUIRED, "verdict-path": "" });
    expect(getInputs().mapping.verdictPath).toBeUndefined();
  });

  it("fails loudly on the retired config input", () => {
    setInputs({ ...REQUIRED, config: '{"days": 30}' });
    expect(() => getInputs()).toThrow("The `config` input was removed");
  });

  it("ignores an empty config input", () => {
    setInputs({ ...REQUIRED, config: "" });
    expect(() => getInputs()).not.toThrow();
  });
});

describe("parseAgent", () => {
  it("parses valid @scope/name", () => {
    expect(parseAgent("@myorg/anti-leak")).toEqual({ scope: "@myorg", name: "anti-leak" });
  });

  it("parses single-char scope and name", () => {
    expect(parseAgent("@a/b")).toEqual({ scope: "@a", name: "b" });
  });

  it("rejects missing @", () => {
    expect(() => parseAgent("myorg/anti-leak")).toThrow("Invalid agent format");
  });

  it("rejects missing scope", () => {
    expect(() => parseAgent("anti-leak")).toThrow("Invalid agent format");
  });

  it("rejects uppercase", () => {
    expect(() => parseAgent("@MyOrg/Anti-Leak")).toThrow("Invalid agent format");
  });

  it("rejects empty name", () => {
    expect(() => parseAgent("@myorg/")).toThrow("Invalid agent format");
  });

  it("rejects spaces", () => {
    expect(() => parseAgent("@my org/name")).toThrow("Invalid agent format");
  });
});
