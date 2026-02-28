"use client";

import { useCallback, useState } from "react";

import { client } from "@/lib/orpc-client";

export type CommitFile = {
  path: string;
  additions: number;
  deletions: number;
};

interface UseCommitExpandOptions {
  slug: string;
}

interface UseCommitExpandReturn {
  expandedCommit: string | null;
  toggleCommit: (hash: string) => void;
  commitFiles: Record<string, CommitFile[]>;
  loadingCommitFiles: string | null;
  expandedCommitFile: string | null;
  toggleCommitFile: (hash: string, path: string) => void;
  commitFileDiffs: Record<string, string>;
  loadingCommitFileDiff: string | null;
}

export function useCommitExpand({
  slug,
}: UseCommitExpandOptions): UseCommitExpandReturn {
  // Level 1: which commit is expanded
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFile[]>>(
    {}
  );
  const [loadingCommitFiles, setLoadingCommitFiles] = useState<string | null>(
    null
  );

  // Level 2: which file within the expanded commit is expanded
  const [expandedCommitFile, setExpandedCommitFile] = useState<string | null>(
    null
  );
  const [commitFileDiffs, setCommitFileDiffs] = useState<
    Record<string, string>
  >({});
  const [loadingCommitFileDiff, setLoadingCommitFileDiff] = useState<
    string | null
  >(null);

  const toggleCommit = useCallback(
    async (hash: string) => {
      // Toggle: if already expanded, collapse
      if (expandedCommit === hash) {
        setExpandedCommit(null);
        return;
      }
      // Expand this commit, collapse any open file
      setExpandedCommit(hash);
      setExpandedCommitFile(null);

      // Skip fetch if already cached
      if (commitFiles[hash] !== undefined) return;

      // Lazy-load file list
      setLoadingCommitFiles(hash);
      try {
        const result = await client.projects.gitCommitFiles({
          slug,
          hash,
        });
        setCommitFiles((prev) => ({ ...prev, [hash]: result.files }));
      } catch {
        setCommitFiles((prev) => ({ ...prev, [hash]: [] }));
      } finally {
        setLoadingCommitFiles(null);
      }
    },
    [expandedCommit, commitFiles, slug]
  );

  const toggleCommitFile = useCallback(
    async (hash: string, filePath: string) => {
      const key = `${hash}:${filePath}`;
      // Toggle: if already expanded, collapse
      if (expandedCommitFile === key) {
        setExpandedCommitFile(null);
        return;
      }
      // Expand this file
      setExpandedCommitFile(key);

      // Skip fetch if already cached
      if (commitFileDiffs[key] !== undefined) return;

      // Lazy-load diff
      setLoadingCommitFileDiff(key);
      try {
        const result = await client.projects.gitCommitDiff({
          slug,
          hash,
          path: filePath,
        });
        setCommitFileDiffs((prev) => ({ ...prev, [key]: result.diff }));
      } catch {
        setCommitFileDiffs((prev) => ({
          ...prev,
          [key]: "(failed to load diff)",
        }));
      } finally {
        setLoadingCommitFileDiff(null);
      }
    },
    [expandedCommitFile, commitFileDiffs, slug]
  );

  return {
    expandedCommit,
    toggleCommit,
    commitFiles,
    loadingCommitFiles,
    expandedCommitFile,
    toggleCommitFile,
    commitFileDiffs,
    loadingCommitFileDiff,
  };
}
