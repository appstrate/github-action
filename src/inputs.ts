// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import * as core from "@actions/core";
import type { OutputMode, MappingConfig } from "./report.js";

/** Parsed and validated action inputs from workflow YAML. */
export interface ActionInputs {
  appstrateUrl: string;
  apiKey: string;
  agent: string;
  agentVersion?: string;
  input?: Record<string, unknown>;
  config?: Record<string, unknown>;
  timeout: number;
  outputMode: OutputMode;
  failOn: "fail" | "warning" | "never";
  mapping: MappingConfig;
  maxDiffSize: number;
  githubToken: string;
}

/** Parsed agent identifier split into scope and name. */
export interface ParsedAgent {
  scope: string;
  name: string;
}

/** Read and validate all action inputs from the workflow environment. */
export function getInputs(): ActionInputs {
  const appstrateUrl = core.getInput("appstrate-url", { required: true }).replace(/\/+$/, "");

  const apiKey = core.getInput("appstrate-api-key", { required: true });
  if (!apiKey.startsWith("ask_")) {
    throw new Error("appstrate-api-key must start with 'ask_'");
  }

  const agent = core.getInput("agent", { required: true });
  parseAgent(agent); // validate format early

  const agentVersion = core.getInput("agent-version") || undefined;

  const inputRaw = core.getInput("input");
  const input = inputRaw ? parseJson<Record<string, unknown>>(inputRaw, "input") : undefined;

  const configRaw = core.getInput("config");
  const config = configRaw ? parseJson<Record<string, unknown>>(configRaw, "config") : undefined;

  const timeout = parseInt(core.getInput("timeout") || "300", 10);
  if (isNaN(timeout) || timeout < 1) {
    throw new Error("timeout must be a positive integer");
  }

  const outputMode = (core.getInput("output-mode") || "full") as OutputMode;
  const validModes: OutputMode[] = ["check", "comment", "annotations", "full", "none"];
  if (!validModes.includes(outputMode)) {
    throw new Error(`output-mode must be one of: ${validModes.join(", ")}`);
  }

  const failOnRaw = core.getInput("fail-on") || "fail";
  const failOnAliases: Record<string, "fail" | "warning" | "never"> = {
    fail: "fail",
    error: "fail",
    errors: "fail",
    warning: "warning",
    warnings: "warning",
    never: "never",
    none: "never",
  };
  const failOn = failOnAliases[failOnRaw];
  if (!failOn) {
    throw new Error(`fail-on must be one of: fail, warning, never (got "${failOnRaw}")`);
  }

  const mapping: MappingConfig = {
    verdictPath: core.getInput("verdict-path") || undefined,
    summaryPath: core.getInput("summary-path") || undefined,
    annotationsPath: core.getInput("annotations-path") || undefined,
  };

  const maxDiffSize = parseInt(core.getInput("max-diff-size") || "200000", 10);

  const githubToken = core.getInput("github-token", { required: true });

  return {
    appstrateUrl,
    apiKey,
    agent,
    agentVersion,
    input,
    config,
    timeout,
    outputMode,
    failOn,
    mapping,
    maxDiffSize,
    githubToken,
  };
}

/** Parse an agent string like "@scope/name" into its components. */
export function parseAgent(agent: string): ParsedAgent {
  const match = agent.match(/^(@[a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/);
  if (!match) {
    throw new Error(
      `Invalid agent format: "${agent}". Expected @scope/name (e.g. @myorg/anti-leak)`
    );
  }
  return { scope: match[1], name: match[2] };
}

function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `${label} must be valid JSON (got ${raw.length} chars, starts with: ${raw.slice(0, 20)}...)`
    );
  }
}
