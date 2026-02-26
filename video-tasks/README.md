# Video Walkthrough — Extracted Tasks & Features

Source: `fixers.mp4` (8:22 walkthrough)

## Features (13 total)

| # | Feature | Priority | Complexity |
|---|---------|----------|------------|
| 01 | [Sidebar Navigation Items](./feature-01-sidebar-nav-items/notes.md) | High | Low |
| 02 | [Sessions Panel - Collapse by Default](./feature-02-sessions-panel-collapse/notes.md) | Medium | Low |
| 03 | [Middle Content - No Horizontal Scroll](./feature-03-middle-content-no-scroll/notes.md) | High | Low |
| 04 | [Project Name Display](./feature-04-project-name-display/notes.md) | High | Low |
| 05 | [Project Creation - MCPs/Skills/Templates](./feature-05-project-creation-templates/notes.md) | Medium | Medium |
| 06 | [Session Thread Actions Popover](./feature-06-session-thread-actions/notes.md) | High | Medium |
| 07 | [Sidebar Recent Activities & Work Trees](./feature-07-sidebar-recent-activities/notes.md) | Low | High |
| 08 | [Tmux Sessions Integration](./feature-08-tmux-sessions-integration/notes.md) | Medium | Medium |
| 09 | [Skills & MCP Status Fixes](./feature-09-skills-mcp-status/notes.md) | High | Medium |
| 10 | [File Tree Improvements](./feature-10-file-tree-improvements/notes.md) | Medium | Medium |
| 11 | [Tab Interface](./feature-11-tab-interface/notes.md) | High | High |
| 12 | [Project-Scoped Sessions](./feature-12-project-scoped-sessions/notes.md) | High | Low |
| 13 | [Railway & Linear Integration](./feature-13-railway-linear-integration/notes.md) | Medium | High |

## Quick Fix (Low Complexity)
- **01** Sidebar nav items — add emails, webhooks, cron jobs
- **02** Sessions panel — collapse by default
- **03** Middle content — fix horizontal scroll overflow
- **04** Project name — show actual name instead of "Home"
- **12** Project-scoped sessions — filter by current project

## Medium Effort
- **05** Project creation — add MCP/skill selection and templates
- **06** Session thread actions — popover with copy/resume/tmux options
- **08** Tmux sessions — display and connect to tmux sessions
- **09** Skills & MCP — fix broken skills, dismissible MCP errors
- **10** File tree — open files, add type icons

## Major Features
- **07** Sidebar activities & worktree mapping — research needed
- **11** Tab interface — multi-tab with cross-project persistence
- **13** Railway & Linear integration — deployments, tickets, session triggers

## All Tasks Checklist

### 01 — Sidebar Navigation Items
- [ ] Add emails section to sidebar
- [ ] Add webhooks section to sidebar
- [ ] Add cron jobs section to sidebar

### 02 — Sessions Panel
- [ ] Collapse sessions panel by default

### 03 — Middle Content
- [ ] Fix horizontal scroll overflow in main content area

### 04 — Project Name Display
- [ ] Show project name instead of "Home" placeholder
- [ ] Auto-create CLAUDE.md in project directory
- [ ] Allow specifying MCPs/skills during project setup

### 05 — Project Creation Templates
- [ ] Add initial prompt field
- [ ] Add MCP selection
- [ ] Add skills selection
- [ ] Add project templates

### 06 — Session Thread Actions
- [ ] Add popover on session items
- [ ] Copy command action
- [ ] Resume session action
- [ ] Open in tmux action
- [ ] Fix popover latency

### 07 — Sidebar Activities & Work Trees
- [ ] Research: recent activities display
- [ ] Research: worktree-to-session mapping

### 08 — Tmux Sessions
- [ ] Display active tmux sessions
- [ ] Button to select and open session
- [ ] Auto-construct tmux attach command

### 09 — Skills & MCP Status
- [ ] Fix skills section loading
- [ ] Make MCP errors dismissible
- [ ] Fix tool display with MCP servers

### 10 — File Tree
- [ ] Click file to view contents
- [ ] Add file type icons
- [ ] Richer tree view

### 11 — Tab Interface
- [ ] Implement multi-tab interface
- [ ] Persist tabs across project navigation
- [ ] Save/restore tab state

### 12 — Project-Scoped Sessions
- [ ] Filter sessions by current project
- [ ] Keep "all sessions" view accessible

### 13 — Railway & Linear Integration
- [ ] Railway: show deployment status/failures
- [ ] Linear: show project tickets
- [ ] Connect Linear project to app project
- [ ] Start Claude session from Linear ticket
- [ ] Investigate failed Railway deployment from UI
