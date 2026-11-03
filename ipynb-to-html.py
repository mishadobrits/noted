#!/usr/bin/env python3
"""Thin CLI wrapper: convert a Jupyter notebook to annotated HTML via Node.

All conversion (markdown, highlight, notes/anchors, KaTeX hooks, interactive UI)
lives in ``ipynb-to-html.js``. This script only parses argv and shells out to Node.

Usage:
    python ipynb-to-html.py notebook.ipynb
    python ipynb-to-html.py notebook.ipynb -o out.html
    python ipynb-to-html.py notebook.ipynb --notes notes.json
    python ipynb-to-html.py notebook.ipynb --no-notes

Requires Node.js on PATH (``node``). See ``ipynb-to-html.js`` for the notes schema
and interactive HTML behavior. Open ``viewer.html`` to pick one notebook.
``viewer.html?diff`` compares two notebooks, and ``viewer.html?diff=pair``
picks both files at once.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

_JS_NAME = "ipynb-to-html.js"


def _js_path() -> Path:
    return Path(__file__).resolve().parent / _JS_NAME


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Convert a Jupyter notebook (.ipynb) to interactive annotated HTML "
            "(via Node ipynb-to-html.js)."
        ),
        epilog=(
            "Notes are not stored in the notebook. "
            "--notes FILE includes a notes JSON file for this run. "
            "--no-notes shows notes but blocks adding or editing them. "
            "Implementation: docs/ipynb-to-html.js"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("notebook", type=Path, help="Path to the .ipynb file")
    p.add_argument("-o", "--output", type=Path, default=None, help="Output HTML path")
    p.add_argument("--title", default=None, help="Document title (default: notebook stem)")
    p.add_argument(
        "--notes",
        type=Path,
        default=None,
        help="Include this notes JSON file in the page",
    )
    p.add_argument(
        "--no-notes",
        action="store_true",
        help="Generate a page where notes cannot be added or edited",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    js = _js_path()
    if not js.is_file():
        print(f"error: converter not found next to this script: {js}", file=sys.stderr)
        return 1

    node = shutil.which("node")
    if not node:
        print(
            "error: Node.js is required but 'node' was not found on PATH.\n"
            "Install Node.js, or run: node docs/ipynb-to-html.js …",
            file=sys.stderr,
        )
        return 1

    cmd: list[str] = [node, str(js), str(args.notebook)]
    if args.output is not None:
        cmd.extend(["-o", str(args.output)])
    if args.title is not None:
        cmd.extend(["--title", args.title])
    if args.notes is not None:
        cmd.extend(["--notes", str(args.notes)])
    if args.no_notes:
        cmd.append("--no-notes")

    try:
        proc = subprocess.run(cmd, check=False)
    except OSError as e:
        print(f"error: failed to run Node: {e}", file=sys.stderr)
        return 1
    return int(proc.returncode)


if __name__ == "__main__":
    sys.exit(main())
