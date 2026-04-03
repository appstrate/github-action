// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import * as github from "@actions/github";
import * as core from "@actions/core";

/** A PR comment with author and body. */
export interface PRComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

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
  comments: PRComment[];
  repo: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  };
  /** The event that triggered this run (e.g. "pull_request", "issue_comment"). */
  triggerEvent: string;
  /** The comment that triggered this run (only for issue_comment events). */
  triggerComment?: PRComment;
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
 * Collect PR metadata, changed file list, and comments via the GitHub API.
 * Supports both `pull_request` and `issue_comment` events.
 * Does NOT fetch patches/diffs — the agent should fetch those itself
 * via the GitHub provider to avoid env var size limits.
 * Returns null if not in a PR context.
 */
export async function collectPRContext(token: string): Promise<PullRequestContext | null> {
  const { context } = github;

  const supportedEvents = ["pull_request", "pull_request_target", "issue_comment"];
  if (!supportedEvents.includes(context.eventName)) {
    core.info(`Event "${context.eventName}" is not PR-related, skipping PR context collection`);
    return null;
  }

  const octokit = github.getOctokit(token);
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  // Resolve PR data depending on event type
  let prNumber: number;
  let prData: {
    title: string;
    body: string;
    author: string;
    base: string;
    head: string;
    headSha: string;
    url: string;
    draft: boolean;
  };
  let triggerComment: PRComment | undefined;

  if (context.eventName === "issue_comment") {
    // issue_comment on a PR: payload has issue (not pull_request)
    const issue = context.payload.issue;
    if (!issue?.pull_request) {
      core.info("issue_comment on a non-PR issue, skipping");
      return null;
    }

    prNumber = issue.number;

    // Capture the comment that triggered this run
    const comment = context.payload.comment;
    if (comment) {
      triggerComment = {
        id: comment.id,
        author: comment.user?.login ?? "",
        body: comment.body ?? "",
        createdAt: comment.created_at ?? "",
      };
    }

    // Fetch full PR data (issue_comment payload doesn't include PR details)
    core.info(`Fetching PR #${prNumber} details (triggered by comment)...`);
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    prData = {
      title: pr.title ?? "",
      body: pr.body ?? "",
      author: pr.user?.login ?? "",
      base: pr.base?.ref ?? "",
      head: pr.head?.ref ?? "",
      headSha: pr.head?.sha ?? context.sha,
      url: pr.html_url ?? "",
      draft: pr.draft ?? false,
    };
  } else {
    // pull_request or pull_request_target
    const pr = context.payload.pull_request;
    if (!pr) {
      core.warning("pull_request event but no PR payload found");
      return null;
    }
    prNumber = pr.number;
    prData = {
      title: pr.title ?? "",
      body: pr.body ?? "",
      author: pr.user?.login ?? "",
      base: pr.base?.ref ?? "",
      head: pr.head?.ref ?? "",
      headSha: pr.head?.sha ?? context.sha,
      url: pr.html_url ?? "",
      draft: pr.draft ?? false,
    };
  }

  // Fetch changed files and comments in parallel
  core.info(`Fetching changed files and comments for PR #${prNumber}...`);
  const [files, comments, repoData] = await Promise.all([
    fetchAllFiles(octokit, owner, repo, prNumber),
    fetchComments(octokit, owner, repo, prNumber),
    octokit.rest.repos.get({ owner, repo }).then((r) => r.data),
  ]);

  return {
    pullRequest: { number: prNumber, ...prData },
    files: files.map((f) => ({
      path: f.path,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      previousPath: f.previousPath,
    })),
    comments,
    repo: {
      owner,
      name: repo,
      fullName: `${owner}/${repo}`,
      defaultBranch: repoData.default_branch,
    },
    triggerEvent: context.eventName,
    triggerComment,
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

async function fetchComments(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRComment[]> {
  const comments: PRComment[] = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
      page,
    });

    for (const c of data) {
      comments.push({
        id: c.id,
        author: c.user?.login ?? "",
        body: c.body ?? "",
        createdAt: c.created_at ?? "",
      });
    }

    if (data.length < 100) break;
    page++;
  }

  core.info(`Collected ${comments.length} PR comments`);
  return comments;
}
