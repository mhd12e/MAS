#!/bin/bash
# Start Mobile Agent Studio — backend + frontend + docs in split tmux panes
# Closing any pane kills everything and exits

ROOT="$(cd "$(dirname "$0")" && pwd)"
SESSION="agent-mobiles"

# Kill any leftover processes
kill $(lsof -ti:3000,3001,8001,5173) 2>/dev/null

# Kill existing session if any
tmux kill-session -t "$SESSION" 2>/dev/null

# Create session with backend (left)
tmux new-session -d -s "$SESSION" -c "$ROOT/backend" "pnpm start:dev"

# Split right — frontend
tmux split-window -h -t "$SESSION" -c "$ROOT/frontend" "pnpm dev"

# Split frontend pane vertically — docs below
tmux split-window -v -t "$SESSION:0.1" -c "$ROOT/docs" "python3 -m http.server 3001"

# Pane labels
tmux select-pane -t "$SESSION:0.0" -T "Backend :3000"
tmux select-pane -t "$SESSION:0.1" -T "Frontend :5173"
tmux select-pane -t "$SESSION:0.2" -T "Docs :3001"
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_title} "

# Focus backend pane
tmux select-pane -t "$SESSION:0.0"

# When any pane closes, kill the entire session
tmux set-hook -t "$SESSION" pane-exited "kill-session"

# Clean up ports after tmux exits
trap 'kill $(lsof -ti:3000,3001,8001,5173) 2>/dev/null' EXIT

# Attach
tmux attach-session -t "$SESSION"
