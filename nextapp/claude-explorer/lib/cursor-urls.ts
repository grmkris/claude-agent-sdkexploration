/**
 * Generate a Cursor deep-link URL to open a folder.
 *
 * - With sshHost: cursor://vscode-remote/ssh-remote+{host}{path}
 * - Without:      cursor://file{path}
 *
 * The resulting URL can be used directly as an <a href> — the OS protocol
 * handler invokes Cursor with the correct remote/local context.
 */
export function generateCursorUrl(
  path: string,
  sshHost: string | null | undefined
): string {
  if (sshHost) {
    return `cursor://vscode-remote/ssh-remote+${sshHost}${path}`;
  }
  return `cursor://file${path}`;
}
