"""Blade Web — configuration."""

import os
from pathlib import Path

# Paths
BLADE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
ENGINE_PATH = BLADE_ROOT / "engine" / "blade-engine.js"
BLADE_SCRIPT = BLADE_ROOT / "bin" / "blade.js"

# Server
HOST = os.getenv("BLADE_WEB_HOST", "0.0.0.0")
PORT = int(os.getenv("BLADE_WEB_PORT", "8000"))
DEBUG = os.getenv("BLADE_DEBUG", "").lower() in ("1", "true")

# Provider
PROVIDER = os.getenv("BLADE_PROVIDER", "deepseek")
API_KEY = os.getenv("BLADE_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or ""
MODEL = os.getenv("BLADE_MODEL", "deepseek-v4-flash")

# Allowed working directories
WORK_DIRS = [
    str(BLADE_ROOT),
]
