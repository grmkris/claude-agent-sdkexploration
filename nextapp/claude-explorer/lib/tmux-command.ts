export type TmuxLayout =
  | "even-horizontal"
  | "even-vertical"
  | "tiled"
  | "main-vertical";

export interface TmuxLaunchConfig {
  sessionName: string;
  projectPath: string;
  panelCount: number;
  layout: TmuxLayout;
  resumeSessionIds?: (string | null)[];
  printMode?: boolean;
  skipPermissions?: boolean;
  model?: string;
  maxBudgetUsd?: number;
  sshTarget?: string;
  prompts?: (string | null)[];
  noTmux?: boolean;
  ccMode?: boolean;
}

export function generateTmuxCommand(config: TmuxLaunchConfig): string {
  const {
    projectPath,
    panelCount,
    layout,
    resumeSessionIds,
    printMode,
    skipPermissions,
    model,
    maxBudgetUsd,
    sshTarget,
    prompts,
    noTmux,
    ccMode,
  } = config;
  const safeName = config.sessionName.replace(/[.:]/g, "-");
  const safePath = projectPath.includes(" ") ? `"${projectPath}"` : projectPath;

  const claudeCmd = (index: number): string => {
    const parts = ["claude"];
    const sid = resumeSessionIds?.[index];
    if (sid) parts.push(`--resume ${sid}`);
    if (skipPermissions) parts.push("--dangerously-skip-permissions");
    if (model) parts.push(`--model ${model}`);
    if (maxBudgetUsd != null && maxBudgetUsd > 0)
      parts.push(`--max-budget-usd ${maxBudgetUsd}`);
    if (printMode) {
      parts.push("-p");
      const prompt = prompts?.[index];
      if (prompt) parts.push(`"${prompt.replace(/"/g, '\\"')}"`);
    }
    return parts.join(" ");
  };

  // No-tmux mode: bare commands
  if (noTmux) {
    const lines: string[] = [];
    for (let i = 0; i < panelCount; i++) {
      const cmd = `cd ${safePath} && ${claudeCmd(i)}`;
      lines.push(panelCount > 1 && i < panelCount - 1 ? `${cmd} &` : cmd);
    }
    const bare = lines.join("\n");
    if (sshTarget) {
      return `ssh -t ${sshTarget} '${bare.replace(/'/g, "'\\''")}'`;
    }
    return bare;
  }

  const tmuxBin = ccMode ? "tmux -CC" : "tmux";
  let tmuxCmd: string;

  if (panelCount === 1) {
    tmuxCmd = `${tmuxBin} new-session -s ${safeName} -c ${safePath} '${claudeCmd(0)}'`;
  } else {
    const tmuxParts: string[] = [
      `${tmuxBin} new-session -d -s ${safeName} -c ${safePath} '${claudeCmd(0)}'`,
    ];

    for (let i = 1; i < panelCount; i++) {
      const dir =
        layout === "even-vertical" || layout === "main-vertical" ? "-v" : "-h";
      tmuxParts.push(`split-window ${dir} -c ${safePath} '${claudeCmd(i)}'`);
    }

    tmuxParts.push(`select-layout ${layout}`);
    tmuxParts.push("attach");

    tmuxCmd = tmuxParts.join(" \\; \\\n  ");
  }

  if (sshTarget) {
    return `ssh -t ${sshTarget} '${tmuxCmd.replace(/'/g, "'\\''")}'`;
  }

  return tmuxCmd;
}
