#!/bin/bash

# Read JSON input once
input=$(cat)

# Git info only (no ccstatusline on remote)
echo "$input" | bash /home/bun/.claude/statusline-command.sh
