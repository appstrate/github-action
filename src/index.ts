// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import * as core from "@actions/core";
import { getInputs, parseAgent } from "./inputs.js";
import { AppstrateClient, type RunResult } from "./client.js";
import { collectPRContext } from "./collect.js";
import { report } from "./report.js";
import { streamUntilDone } from "./stream.js";

async function run(): Promise<void> {
  const inputs = getInputs();
  core.setSecret(inputs.apiKey);
  core.setSecret(inputs.githubToken);
  const { scope, name } = parseAgent(inputs.agent);

  // Collect PR context
  core.startGroup("Collecting PR context");
  const prContext = await collectPRContext(inputs.githubToken);
  if (prContext) {
    core.info(
      `PR #${prContext.pullRequest.number}: ${prContext.pullRequest.title} ` +
        `(${prContext.files.length} files)`
    );
  }
  core.endGroup();

  // Build agent input: flatten PR context to scalar values so the prompt builder
  // renders them correctly (nested objects would show as [object Object]).
  let agentInput: Record<string, unknown> | undefined;
  if (prContext) {
    const { pullRequest: pr, repo, files } = prContext;
    agentInput = {
      repoOwner: repo.owner,
      repoName: repo.name,
      repoFullName: repo.fullName,
      repoDefaultBranch: repo.defaultBranch,
      prNumber: pr.number,
      prTitle: pr.title,
      prBody: pr.body,
      prAuthor: pr.author,
      prBase: pr.base,
      prHead: pr.head,
      prHeadSha: pr.headSha,
      prUrl: pr.url,
      prDraft: pr.draft,
      changedFiles: files.map((f) => f.path).join("\n"),
      ...inputs.input,
    };
  } else {
    agentInput = inputs.input;
  }

  // Trigger the run
  core.startGroup("Triggering agent run");
  const client = new AppstrateClient(inputs.appstrateUrl, inputs.apiKey);

  core.info(`Agent: ${inputs.agent}`);
  if (inputs.agentVersion) core.info(`Version: ${inputs.agentVersion}`);

  const runId = await client.triggerRun(scope, name, {
    version: inputs.agentVersion,
    input: agentInput,
    config: inputs.config,
  });

  core.info(`Run ID: ${runId}`);
  core.setOutput("run-id", runId);
  core.endGroup();

  // Wait for completion
  core.startGroup("Waiting for agent completion");

  let result = await streamUntilDone(
    inputs.appstrateUrl,
    inputs.apiKey,
    runId,
    inputs.timeout * 1000,
    (message) => core.info(`  ${message}`),
    (status) => core.info(`Status: ${status}`)
  );

  // Always fetch final run for full result
  result = await client.getRun(runId);

  // If still in progress (SSE failed early), fallback to polling
  if (result.status === "pending" || result.status === "running") {
    core.info("Falling back to polling...");
    result = await client.pollUntilDone(runId, inputs.timeout * 1000, (snapshot: RunResult) => {
      core.info(`Status: ${snapshot.status}`);
    });
  }

  core.info(`Completed: ${result.status} (${result.duration}ms)`);
  if (result.tokensUsed) core.info(`Tokens: ${result.tokensUsed}`);
  if (result.cost) core.info(`Cost: $${result.cost.toFixed(4)}`);
  core.endGroup();

  // Set outputs
  core.setOutput("status", result.status);
  core.setOutput("duration", result.duration.toString());
  if (result.result) {
    core.setOutput("result", JSON.stringify(result.result));
  }

  // Report to GitHub
  if (inputs.outputMode !== "none") {
    core.startGroup("Reporting to GitHub");
    await report(inputs.githubToken, result, inputs.agent, inputs.outputMode, inputs.mapping);
    core.endGroup();
  }

  // Exit code based on fail-on setting
  const shouldFail = determineShouldFail(result, inputs.failOn, inputs.mapping.verdictPath);
  if (shouldFail) {
    core.setFailed(shouldFail);
  }
}

function determineShouldFail(
  result: RunResult,
  failOn: "fail" | "warning" | "never",
  verdictPath?: string
): string | null {
  if (failOn === "never") return null;

  // Hard failures always fail regardless of fail-on
  if (result.status === "timeout") return "Agent run timed out";
  if (result.status === "cancelled") return "Agent run was cancelled";

  // If agent has a verdict field, use it
  if (verdictPath && result.result) {
    const verdict = getNestedValue(result.result, verdictPath);
    if (typeof verdict === "string") {
      if (verdict === "fail" || verdict === "failed" || verdict === "failure") {
        return result.error || "Agent verdict: fail";
      }
      if (failOn === "warning" && verdict === "warning") {
        return "Agent verdict: warning";
      }
      return null;
    }
  }

  // Fallback: use run status
  if (result.status === "failed") {
    return result.error || "Agent run failed";
  }

  return null;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

run().catch((err: Error) => {
  core.setFailed(err.message);
});
