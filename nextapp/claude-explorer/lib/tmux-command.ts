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
  customCommands?: (string | null)[];
  detached?: boolean;
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
    customCommands,
    detached,
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

  const panelCmd = (index: number): string =>
    customCommands?.[index] || claudeCmd(index);

  // No-tmux mode: bare commands
  if (noTmux) {
    const lines: string[] = [];
    for (let i = 0; i < panelCount; i++) {
      const cmd = `cd ${safePath} && ${panelCmd(i)}`;
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
    const sessionFlag = detached ? "-d -s" : "-s";
    tmuxCmd = `${tmuxBin} new-session ${sessionFlag} ${safeName} -c ${safePath} '${panelCmd(0)}'`;
  } else {
    const tmuxParts: string[] = [
      `${tmuxBin} new-session -d -s ${safeName} -c ${safePath} '${panelCmd(0)}'`,
    ];

    for (let i = 1; i < panelCount; i++) {
      const dir =
        layout === "even-vertical" || layout === "main-vertical" ? "-v" : "-h";
      tmuxParts.push(`split-window ${dir} -c ${safePath} '${panelCmd(i)}'`);
    }

    tmuxParts.push(`select-layout ${layout}`);
    if (!detached) tmuxParts.push("attach");

    tmuxCmd = tmuxParts.join(" \\; \\\n  ");
  }

  if (sshTarget) {
    return `ssh -t ${sshTarget} '${tmuxCmd.replace(/'/g, "'\\''")}'`;
  }

  return tmuxCmd;
}

export function generateAttachCommand(opts: {
  sessionName: string;
  windowKey?: string;
  sshTarget?: string;
  ccMode?: boolean;
}): string {
  const tmuxBin = opts.ccMode ? "tmux -CC" : "tmux";
  const target = opts.windowKey ?? opts.sessionName;
  const attach = `${tmuxBin} attach -t ${target}`;
  if (opts.sshTarget) {
    return `ssh -t ${opts.sshTarget} '${attach}'`;
  }
  return attach;
}
