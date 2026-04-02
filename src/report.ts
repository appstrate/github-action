// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import * as github from "@actions/github";
import * as core from "@actions/core";
import type { RunResult } from "./client.js";

/** Controls which GitHub reporting mechanisms to use. */
export type OutputMode = "check" | "comment" | "annotations" | "full" | "none";

/** Dot-paths into the agent output for structured reporting. */
export interface MappingConfig {
  verdictPath?: string;
  summaryPath?: string;
  annotationsPath?: string;
}

/** A GitHub Check Run annotation mapped to a file location. */
export interface Annotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  title?: string;
  message: string;
  raw_details?: string;
}

/** Report agent results to GitHub via Check Runs, annotations, and/or PR comments. */
export async function report(
  token: string,
  run: RunResult,
  agentName: string,
  outputMode: OutputMode,
  mapping: MappingConfig
): Promise<void> {
  if (outputMode === "none") return;

  const { context } = github;
  if (context.eventName !== "pull_request" && context.eventName !== "pull_request_target") {
    core.info("Not a PR context, skipping GitHub reporting");
    return;
  }

  const octokit = github.getOctokit(token);
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const sha = context.payload.pull_request?.head?.sha ?? context.sha;
  const prNumber = context.payload.pull_request?.number;

  // Extract structured data from agent result
  const verdict = extractVerdict(run, mapping.verdictPath);
  const summary = extractSummary(run, mapping.summaryPath, agentName);
  const annotations = extractAnnotations(run, mapping.annotationsPath);

  // Check Run (check, annotations, full)
  if (outputMode === "check" || outputMode === "annotations" || outputMode === "full") {
    await createCheckRun(
      octokit,
      owner,
      repo,
      sha,
      agentName,
      verdict,
      summary,
      annotations,
      outputMode
    );
  }

  // PR Comment (comment, full)
  if (prNumber && (outputMode === "comment" || outputMode === "full")) {
    await createOrUpdateComment(octokit, owner, repo, prNumber, agentName, summary);
  }
}

function extractVerdict(run: RunResult, path?: string): "success" | "failure" | "neutral" {
  if (path && run.result) {
    const value = getNestedValue(run.result, path);
    if (typeof value === "string") {
      const map: Record<string, "success" | "failure" | "neutral"> = {
        pass: "success",
        success: "success",
        fail: "failure",
        failed: "failure",
        failure: "failure",
        warning: "neutral",
        neutral: "neutral",
      };
      if (map[value]) return map[value];
    }
  }

  // Default: map from run status
  if (run.status === "success") return "success";
  if (run.status === "failed" || run.status === "timeout") return "failure";
  return "neutral";
}

function extractSummary(run: RunResult, path?: string, agentName?: string): string {
  if (path && run.result) {
    const value = getNestedValue(run.result, path);
    if (typeof value === "string") return value;
  }

  // Default: format the full result as markdown
  if (run.result) {
    const resultStr =
      typeof run.result === "string" ? run.result : JSON.stringify(run.result, null, 2);
    return `### ${agentName ?? "Agent"} Result\n\n\`\`\`json\n${resultStr}\n\`\`\``;
  }

  if (run.error) {
    return `### ${agentName ?? "Agent"} Error\n\n${run.error}`;
  }

  return `Run completed with status: ${run.status}`;
}

function extractAnnotations(run: RunResult, path?: string): Annotation[] {
  if (!path || !run.result) return [];

  const value = getNestedValue(run.result, path);
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => item && typeof item === "object")
    .map((item) => ({
      path: String(item.path ?? item.file ?? ""),
      start_line: Number(item.startLine ?? item.start_line ?? item.line ?? 1),
      end_line: Number(item.endLine ?? item.end_line ?? item.startLine ?? item.line ?? 1),
      annotation_level: mapLevel(String(item.level ?? item.severity ?? "warning")),
      title: item.title ? String(item.title) : undefined,
      message: String(item.message ?? item.description ?? ""),
    }))
    .filter((a) => a.path && a.message);
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

async function createCheckRun(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  sha: string,
  agentName: string,
  conclusion: "success" | "failure" | "neutral",
  summary: string,
  annotations: Annotation[],
  outputMode: OutputMode
): Promise<void> {
  const includeAnnotations = outputMode === "annotations" || outputMode === "full";

  // GitHub limits annotations to 50 per request
  const annotationBatches: Annotation[][] = [];
  if (includeAnnotations && annotations.length > 0) {
    for (let i = 0; i < annotations.length; i += 50) {
      annotationBatches.push(annotations.slice(i, i + 50));
    }
  }

  // Create check run with first batch
  const { data: checkRun } = await octokit.rest.checks.create({
    owner,
    repo,
    name: `Appstrate: ${agentName}`,
    head_sha: sha,
    status: "completed",
    conclusion,
    output: {
      title: `${agentName} — ${conclusion}`,
      summary: truncate(summary, 65535),
      annotations: annotationBatches[0] ?? [],
    },
  });

  core.info(`Check run created: ${checkRun.html_url}`);

  // Send remaining annotation batches via update
  for (let i = 1; i < annotationBatches.length; i++) {
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRun.id,
      output: {
        title: `${agentName} — ${conclusion}`,
        summary: truncate(summary, 65535),
        annotations: annotationBatches[i],
      },
    });
  }

  if (annotations.length > 0) {
    core.info(`Posted ${annotations.length} annotations`);
  }
}

const COMMENT_MARKER = "<!-- appstrate-agent:";

async function createOrUpdateComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  agentName: string,
  summary: string
): Promise<void> {
  const marker = `${COMMENT_MARKER}${agentName} -->`;
  const body = `${marker}\n${summary}`;

  // Look for existing comment to update
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => c.body?.startsWith(marker));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    core.info(`Updated existing PR comment #${existing.id}`);
  } else {
    const { data: created } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    core.info(`Created PR comment #${created.id}`);
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}
