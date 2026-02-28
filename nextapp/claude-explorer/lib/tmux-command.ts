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
    tmuxCmd = `${tmuxBin} new-session -s ${safeName} -c ${safePath} '${panelCmd(0)}'`;
    if (sshTarget) {
      return `ssh -t ${sshTarget} '${tmuxCmd.replace(/'/g, "'\\''")}'`;
    }
    return tmuxCmd;
  }

  // Multi-pane: build the setup chain with plain tmux (no -CC).
  const setupParts: string[] = [
    `tmux new-session -d -s ${safeName} -c ${safePath} '${panelCmd(0)}'`,
  ];

  for (let i = 1; i < panelCount; i++) {
    const dir =
      layout === "even-vertical" || layout === "main-vertical" ? "-v" : "-h";
    setupParts.push(`split-window ${dir} -c ${safePath} '${panelCmd(i)}'`);
  }

  setupParts.push(`select-layout ${layout}`);

  const setupCmd = setupParts.join(" \\; \\\n  ");

  if (ccMode && sshTarget) {
    // iTerm2 control mode requires tmux -CC to be the very first command in a
    // fresh SSH session — it cannot be chained after other commands because
    // iTerm2 detects the control-mode DSC sequence only at connection start.
    // Solution: two separate SSH invocations:
    //   1. Non-interactive SSH to set up the detached session (no -t needed)
    //   2. Fresh ssh -t with tmux -CC attach as the only command
    const escapedSetup = setupCmd.replace(/'/g, "'\\''");
    const attachCmd = `tmux -CC attach -t ${safeName}`;
    return (
      `ssh ${sshTarget} '${escapedSetup}' && \\\n` +
      `ssh -t ${sshTarget} '${attachCmd}'`
    );
  }

  if (ccMode) {
    // Local -CC multi-pane: same two-step approach without SSH
    return setupCmd + ` && \\\n  tmux -CC attach -t ${safeName}`;
  }

  setupParts.push("attach");
  tmuxCmd = setupParts.join(" \\; \\\n  ");

  if (sshTarget) {
    return `ssh -t ${sshTarget} '${tmuxCmd.replace(/'/g, "'\\''")}'`;
  }

  return tmuxCmd;
}

/**
 * Generate a plain SSH command that lands the user in the project directory.
 * If no sshTarget is provided, returns a bare `cd <path> && bash`.
 */
export function generateSshCommand(opts: {
  projectPath: string;
  sshTarget?: string;
}): string {
  const safePath = opts.projectPath.includes(" ")
    ? `"${opts.projectPath}"`
    : opts.projectPath;

  const innerCmd = `cd ${safePath} && exec bash`;

  if (opts.sshTarget) {
    return `ssh -t ${opts.sshTarget} '${innerCmd.replace(/'/g, "'\\''")}'`;
  }
  return innerCmd;
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
