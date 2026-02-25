"use client";

import { CopyButton } from "@/components/copy-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ResumeCommand {
  label: string;
  command: string;
  description: string;
}

function buildResumeCommands(
  sessionId: string,
  projectPath: string | null,
  sshHost: string | null | undefined
): ResumeCommand[] {
  const cdPart = projectPath ? `cd ${projectPath} && ` : "";
  const base = `claude --resume ${sessionId}`;

  const commands: ResumeCommand[] = [
    {
      label: "Resume",
      command: `${cdPart}${base}`,
      description: "Basic resume in project directory",
    },
    {
      label: "Skip permissions",
      command: `${cdPart}${base} --dangerously-skip-permissions`,
      description: "Resume with all permission prompts bypassed",
    },
    {
      label: "Skip perms + -c",
      command: `${cdPart}${base} --dangerously-skip-permissions -c`,
      description: "Resume with bypass permissions and CC mode (-c flag)",
    },
  ];

  if (sshHost && projectPath) {
    const remoteBase = `cd ${projectPath} && ${base}`;
    commands.push({
      label: "SSH resume",
      command: `ssh -t ${sshHost} '${remoteBase}'`,
      description: "Resume via SSH tunnel",
    });
    commands.push({
      label: "SSH + skip perms",
      command: `ssh -t ${sshHost} '${remoteBase} --dangerously-skip-permissions'`,
      description: "Resume via SSH with permissions bypassed",
    });
  }

  return commands;
}

export function ResumeSessionPopover({
  sessionId,
  projectPath,
  sshHost,
}: {
  sessionId: string;
  projectPath: string | null;
  sshHost?: string | null;
}) {
  const commands = buildResumeCommands(sessionId, projectPath, sshHost);

  return (
    <Popover>
      <PopoverTrigger
        className="h-6 shrink-0 cursor-pointer rounded px-2 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        resume
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium">Resume Commands</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Copy a command and run it in your terminal
            </p>
          </div>

          {commands.map((cmd) => (
            <div key={cmd.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-foreground">
                  {cmd.label}
                </span>
                <CopyButton text={cmd.command} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {cmd.description}
              </p>
              <code className="block break-all rounded bg-muted px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {cmd.command}
              </code>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
