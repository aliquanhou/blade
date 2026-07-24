"""Blade tool registry — all 21 tools implemented as direct Python methods."""

import os, re, subprocess, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent


class BladeTools:
    """All 21 built-in tools, each as a direct Python method."""

    # ── File operations (5) ──────────────────────────────────

    def read_file(self, path: str) -> str:
        """Read file contents."""
        full = self._resolve(path)
        if not full.exists():
            return f"Error: File not found: {path}"
        try:
            return full.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            return f"Error reading file: {e}"

    def write_file(self, path: str, content: str = "") -> str:
        """Create or overwrite a file."""
        full = self._resolve(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        try:
            full.write_text(content, encoding="utf-8")
            return f"Written: {path} ({full.stat().st_size} bytes)"
        except Exception as e:
            return f"Error writing file: {e}"

    def edit_file(self, path: str, old_text: str = "", new_text: str = "") -> str:
        """Find and replace text in a file."""
        full = self._resolve(path)
        if not full.exists():
            return f"Error: File not found: {path}"
        try:
            content = full.read_text(encoding="utf-8")
            if old_text not in content:
                return f"Error: text not found in {path}"
            content = content.replace(old_text, new_text, 1)
            full.write_text(content, encoding="utf-8")
            return f"Edited: {path} (1 replacement)"
        except Exception as e:
            return f"Error editing file: {e}"

    def delete_file(self, path: str) -> str:
        """Delete a file or empty directory."""
        full = self._resolve(path)
        if not full.exists():
            return f"Error: Not found: {path}"
        try:
            if full.is_dir():
                full.rmdir() if not list(full.iterdir()) else full.unlink()
            else:
                full.unlink()
            return f"Deleted: {path}"
        except Exception as e:
            return f"Error deleting: {e}"

    def list_files(self, path: str = ".") -> str:
        """List directory contents."""
        full = self._resolve(path)
        if not full.is_dir():
            return f"Error: Not a directory: {path}"
        lines = []
        for entry in sorted(full.iterdir()):
            suffix = "/" if entry.is_dir() else ""
            size = entry.stat().st_size if entry.is_file() else 0
            lines.append(f"  {entry.name}{suffix}  ({self._fmt_size(size)})")
        return f"Directory: {path}\n" + "\n".join(lines) if lines else f"Directory: {path}\n  (empty)"

    # ── Code analysis (3) ────────────────────────────────────

    def grep_search(self, path: str = ".", pattern: str = "") -> str:
        """Search file contents for a pattern."""
        if not pattern:
            return "Error: No pattern provided"
        root = self._resolve(path)
        if not root.is_dir():
            root = root.parent
        matches = []
        for f in root.rglob("*"):
            if f.is_file() and f.stat().st_size < 1_000_000:
                try:
                    text = f.read_text(encoding="utf-8", errors="ignore")
                    for i, line in enumerate(text.split("\n"), 1):
                        if pattern in line:
                            rel = f.relative_to(ROOT)
                            matches.append(f"  {rel}:{i}: {line.strip()[:100]}")
                except Exception:
                    continue
        if not matches:
            return f'No matches for "{pattern}"'
        return f'Search "{pattern}" ({len(matches)} matches):\n' + "\n".join(matches[:50])

    def analyze_python(self, path: str = ".") -> str:
        """Analyze Python file structure using AST."""
        full = self._resolve(path)
        if full.is_dir():
            full = full / "__init__.py" if (full / "__init__.py").exists() else full
        if not full.exists() or not full.name.endswith(".py"):
            return "Error: Python file not found"
        try:
            import ast
            tree = ast.parse(full.read_text(encoding="utf-8"))
            classes = [n.name for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]
            funcs = [n.name for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
            imports = [n.names[0].name for n in ast.walk(tree) if isinstance(n, ast.Import)]
            imports_from = [f"{n.module}.{n.names[0].name}" for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module]
            lines = full.read_text().count("\n") + 1
            return (
                f"File: {path} ({lines} lines)\n"
                + (f"Classes: {', '.join(classes)}\n" if classes else "")
                + (f"Functions: {', '.join(funcs)}\n" if funcs else "")
                + (f"Imports: {', '.join(imports + imports_from)}\n" if imports or imports_from else "")
            )
        except SyntaxError as e:
            return f"Syntax error: {e}"
        except Exception as e:
            return f"Error analyzing: {e}"

    def count_lines(self, path: str = ".") -> str:
        """Count lines of code in a directory or file."""
        full = self._resolve(path)
        if full.is_file():
            lines = full.read_text(encoding="utf-8").count("\n") + 1
            return f"{path}: {lines} lines"
        total = 0
        by_ext: dict[str, int] = {}
        for f in full.rglob("*"):
            if f.is_file() and f.stat().st_size < 500_000:
                try:
                    l = f.read_text(encoding="utf-8", errors="ignore").count("\n") + 1
                    ext = f.suffix or "(no ext)"
                    by_ext[ext] = by_ext.get(ext, 0) + l
                    total += l
                except Exception:
                    continue
        result = f"Total: {total} lines in {path}\n"
        for ext, count in sorted(by_ext.items(), key=lambda x: -x[1]):
            result += f"  {ext}: {count} lines\n"
        return result

    # ── Shell (2) ────────────────────────────────────────────

    def run_bash(self, command: str = "") -> str:
        """Execute a shell command."""
        if not command:
            return "Error: No command"
        try:
            result = subprocess.run(
                ["cmd", "/c", command] if os.name == "nt" else ["sh", "-c", command],
                capture_output=True, text=True, timeout=30, cwd=str(ROOT),
            )
            output = (result.stdout or result.stderr or "").strip()
            return output or f"(exit code {result.returncode})"
        except subprocess.TimeoutExpired:
            return "Error: Command timed out (30s)"
        except Exception as e:
            return f"Error: {e}"

    def system_info(self) -> str:
        """Get system information."""
        import platform
        try:
            cpu = platform.processor() or "Unknown"
            return (
                f"OS: {platform.system()} {platform.release()}\n"
                f"Machine: {platform.machine()}\n"
                f"CPU: {cpu}\n"
                f"Python: {platform.python_version()}\n"
                f"CWD: {ROOT}\n"
                f"User: {os.environ.get('USERNAME', 'unknown')}\n"
            )
        except Exception as e:
            return f"Error: {e}"

    # ── Web (2) ──────────────────────────────────────────────

    async def web_get(self, url: str = "") -> str:
        """Fetch URL content."""
        if not url:
            return "Error: No URL"
        import httpx
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
                r = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
                r.encoding = "utf-8"
                text = r.text
                text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
                text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
                text = re.sub(r"<[^>]+>", " ", text)
                text = re.sub(r"\s+", " ", text).strip()
                if len(text) > 2000:
                    text = text[:2000] + "..."
                return f"URL: {url}\nStatus: {r.status_code}\nContent:\n{text or '(empty)'}"
        except Exception as e:
            return f"Error fetching URL: {e}"

    async def web_search(self, query: str = "") -> str:
        """Search the web via DuckDuckGo."""
        from core.agent import web_search as ddg_search
        return await ddg_search(query) if query else "Error: No query"

    # ── Git (4) ──────────────────────────────────────────────

    def git_status(self, path: str = ".") -> str:
        """Git status."""
        try:
            result = subprocess.run(["git", "status", "--short"], capture_output=True, text=True, timeout=10, cwd=self._resolve(path))
            return result.stdout.strip() or "(clean working tree)"
        except Exception as e:
            return f"Error: {e}" if "fatal" in str(e) else f"Error: {e}"

    def git_log(self, path: str = ".", count: int = 10) -> str:
        """Git log."""
        try:
            result = subprocess.run(
                ["git", "log", f"--max-count={count}", "--oneline", "--graph"],
                capture_output=True, text=True, timeout=10, cwd=self._resolve(path),
            )
            return result.stdout.strip() or "(no commits)"
        except Exception as e:
            return f"Error: {e}"

    def git_diff(self, path: str = ".") -> str:
        """Git diff (unstaged changes)."""
        try:
            result = subprocess.run(["git", "diff"], capture_output=True, text=True, timeout=10, cwd=self._resolve(path))
            return result.stdout.strip() or "(no changes)"
        except Exception as e:
            return f"Error: {e}"

    def git_branches(self, path: str = ".") -> str:
        """Git branch list."""
        try:
            result = subprocess.run(["git", "branch", "-a"], capture_output=True, text=True, timeout=10, cwd=self._resolve(path))
            return result.stdout.strip() or "(no branches)"
        except Exception as e:
            return f"Error: {e}"

    # ── System monitoring (5) ─────────────────────────────────

    def list_processes(self) -> str:
        """List running processes."""
        try:
            import psutil
            processes = []
            for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]):
                try:
                    processes.append(f"  {p.info['pid']:>6}  {p.info['cpu_percent'] or 0:>4.1f}%  {p.info['memory_percent'] or 0:>4.1f}%  {p.info['name'][:40]}")
                except Exception:
                    continue
            return f"Processes ({len(processes)}):\n" + "\n".join(processes[:30])
        except ImportError:
            return "Install psutil: pip install psutil"
        except Exception as e:
            return f"Error: {e}"

    def disk_usage(self) -> str:
        """Show disk usage."""
        try:
            import psutil
            d = psutil.disk_usage("/")
            return f"Total: {self._fmt_size(d.total)}\nUsed:  {self._fmt_size(d.used)} ({d.percent:.0f}%)\nFree:  {self._fmt_size(d.free)}"
        except ImportError:
            return "Install psutil"
        except Exception as e:
            return f"Error: {e}"

    def memory_usage(self) -> str:
        """Show memory usage."""
        import psutil
        try:
            m = psutil.virtual_memory()
            return f"Total: {self._fmt_size(m.total)}\nUsed:  {self._fmt_size(m.used)} ({m.percent:.0f}%)\nFree:  {self._fmt_size(m.available)}"
        except ImportError:
            return "Install psutil"
        except Exception as e:
            return f"Error: {e}"

    def cpu_info(self) -> str:
        """Show CPU info."""
        try:
            import psutil
            return f"Cores: {psutil.cpu_count()}\nUsage: {psutil.cpu_percent(interval=1)}%\nFrequency: {psutil.cpu_freq().current:.0f} MHz" if psutil.cpu_freq() else f"Cores: {psutil.cpu_count()}\nUsage: {psutil.cpu_percent(interval=1)}%"
        except ImportError:
            return "Install psutil"
        except Exception as e:
            return f"Error: {e}"

    # ── Helpers ──────────────────────────────────────────────

    def _resolve(self, path: str) -> Path:
        p = Path(path)
        return p if p.is_absolute() else (ROOT / p).resolve()

    def _fmt_size(self, bytes_: int) -> str:
        for unit in ["B", "KB", "MB", "GB"]:
            if bytes_ < 1024:
                return f"{bytes_:.1f}{unit}"
            bytes_ /= 1024
        return f"{bytes_:.1f}TB"

    def get_tool_list(self) -> list[dict]:
        """Return all tool definitions."""
        return [
            {"name": "read_file", "description": "读取文件内容", "category": "file"},
            {"name": "write_file", "description": "创建或写入文件", "category": "file"},
            {"name": "edit_file", "description": "替换文件内容", "category": "file"},
            {"name": "delete_file", "description": "删除文件", "category": "file"},
            {"name": "list_files", "description": "列出目录内容", "category": "file"},
            {"name": "grep_search", "description": "搜索文件内容", "category": "code"},
            {"name": "analyze_python", "description": "分析 Python 代码结构", "category": "code"},
            {"name": "count_lines", "description": "统计代码行数", "category": "code"},
            {"name": "run_bash", "description": "执行 Shell 命令", "category": "shell"},
            {"name": "system_info", "description": "查看系统信息", "category": "shell"},
            {"name": "web_get", "description": "获取网页内容", "category": "web"},
            {"name": "web_search", "description": "搜索网络", "category": "web"},
            {"name": "git_status", "description": "查看 Git 状态", "category": "git"},
            {"name": "git_log", "description": "查看 Git 日志", "category": "git"},
            {"name": "git_diff", "description": "查看 Git 差异", "category": "git"},
            {"name": "git_branches", "description": "查看 Git 分支", "category": "git"},
            {"name": "list_processes", "description": "列出进程", "category": "system"},
            {"name": "disk_usage", "description": "磁盘使用情况", "category": "system"},
            {"name": "memory_usage", "description": "内存使用情况", "category": "system"},
            {"name": "cpu_info", "description": "CPU 信息", "category": "system"},
            {"name": "system_info", "description": "系统信息", "category": "system"},
        ]
