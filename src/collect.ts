// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import * as github from "@actions/github";
import * as core from "@actions/core";

/** Structured PR context passed as agent input. */
export interface PullRequestContext {
  pullRequest: {
    number: number;
    title: string;
    body: string;
    author: string;
    base: string;
    head: string;
    headSha: string;
    url: string;
    draft: boolean;
  };
  files: FileChange[];
  repo: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  };
}

/** A single changed file in the pull request (metadata only, no patch content). */
export interface FileChange {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  previousPath?: string;
}

/**
 * Collect PR metadata and changed file list via the GitHub API.
 * Does NOT fetch patches/diffs — the agent should fetch those itself
 * via the GitHub provider to avoid env var size limits.
 * Returns null if not in a PR context.
 */
export async function collectPRContext(token: string): Promise<PullRequestContext | null> {
  const { context } = github;

  if (context.eventName !== "pull_request" && context.eventName !== "pull_request_target") {
    core.info("Not a pull_request event, skipping PR context collection");
    return null;
  }

  const pr = context.payload.pull_request;
  if (!pr) {
    core.warning("pull_request event but no PR payload found");
    return null;
  }

  const octokit = github.getOctokit(token);
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  // Fetch changed files (metadata only, no patches)
  core.info(`Fetching changed files for PR #${pr.number}...`);
  const files = await fetchAllFiles(octokit, owner, repo, pr.number);

  // Get repo info
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });

  return {
    pullRequest: {
      number: pr.number,
      title: pr.title ?? "",
      body: pr.body ?? "",
      author: pr.user?.login ?? "",
      base: pr.base?.ref ?? "",
      head: pr.head?.ref ?? "",
      headSha: pr.head?.sha ?? context.sha,
      url: pr.html_url ?? "",
      draft: pr.draft ?? false,
    },
    files: files.map((f) => ({
      path: f.path,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      previousPath: f.previousPath,
    })),
    repo: {
      owner,
      name: repo,
      fullName: `${owner}/${repo}`,
      defaultBranch: repoData.default_branch,
    },
  };
}

interface RawFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  previousPath?: string;
}

async function fetchAllFiles(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number
): Promise<RawFile[]> {
  const files: RawFile[] = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
      page,
    });

    for (const f of data) {
      files.push({
        path: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        previousPath: f.status === "renamed" ? f.previous_filename : undefined,
      });
    }

    if (data.length < 100) break;
    page++;
  }

  core.info(`Collected ${files.length} changed files`);
  return files;
}
