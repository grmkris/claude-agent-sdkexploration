"use client";

import { ShikiHighlighter } from "react-shiki";

// Map file extensions to Shiki language identifiers
function extToLang(filename: string): string {
  const ext = filename.split(".").at(-1)?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    pyw: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    html: "html",
    htm: "html",
    xml: "xml",
    svg: "xml",
    json: "json",
    jsonc: "jsonc",
    jsonl: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    env: "dotenv",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
    dockerfile: "dockerfile",
    tf: "hcl",
    hcl: "hcl",
    lua: "lua",
    vim: "viml",
    r: "r",
    jl: "julia",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    clj: "clojure",
    md: "markdown",
    mdx: "mdx",
    rst: "rst",
    csv: "csv",
    txt: "text",
    log: "text",
  };
  return map[ext] ?? "text";
}

interface CodeViewerProps {
  content: string;
  filename: string;
}

export function CodeViewer({ content, filename }: CodeViewerProps) {
  const language = extToLang(filename);

  return (
    <div className="w-full overflow-auto">
      <ShikiHighlighter
        language={language}
        theme="github-dark"
        className="!bg-transparent text-xs leading-relaxed [&_code]:font-mono [&_pre]:!bg-transparent [&_pre]:p-4"
        showLanguage={false}
        addDefaultStyles={false}
      >
        {content}
      </ShikiHighlighter>
    </div>
  );
}
