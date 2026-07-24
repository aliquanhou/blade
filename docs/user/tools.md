# Blade Tools

Blade inherits over 20 built-in tools from the engine. Here are the key categories:

## File Operations

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with line numbers |
| `write_file` | Create or overwrite a file |
| `edit_file` | Apply partial edits to a file |
| `glob_search` | Find files by glob patterns |
| `grep_search` | Search file contents with regex |
| `diff` | Show file differences |

## Shell Operations

| Tool | Description |
|------|-------------|
| `run_bash` | Execute shell commands |
| `run_powershell` | Execute PowerShell commands (Windows) |

## Web Operations

| Tool | Description |
|------|-------------|
| `web_fetch` | Fetch and render URL content |
| `web_search` | Search the web |

## Code Operations

| Tool | Description |
|------|-------------|
| `agent_delegate` | Delegate to a specialized subagent |
| `todo_write` | Create a todo list |
| `task_create` | Create a tracked task |
| `notebook_edit` | Edit Jupyter notebooks |

## System

| Tool | Description |
|------|-------------|
| `ask_user_question` | Ask the user for input |
| `config_get_set` | View/change settings |
| `skill_invoke` | Run a custom skill |
| `mcp_call` | Call MCP servers |

## Finding Tools

Use `/help` inside Blade to see the full list of available tools for your session.
