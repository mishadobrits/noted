#!/usr/bin/env python3
"""Thin CLI wrapper: convert a Jupyter notebook to annotated HTML via Node.

All conversion (markdown, highlight, notes/anchors, KaTeX hooks, interactive UI)
lives in ``ipynb-to-html.js``. This script only parses argv and shells out to Node.

Usage:
    python ipynb-to-html.py notebook.ipynb
    python ipynb-to-html.py notebook.ipynb -o out.html
    python ipynb-to-html.py notebook.ipynb --notes notes.json
    python ipynb-to-html.py notebook.ipynb --readonly-notes
    python ipynb-to-html.py notebook.ipynb --no-hide-tall-outputs

Requires Node.js on PATH (``node``). See ``ipynb-to-html.js`` for the notes schema
and interactive HTML behavior. Open ``viewer.html`` to pick one notebook.
``viewer.html?diff`` compares two notebooks, and ``viewer.html?diff=pair``
picks both files at once. Tall outputs start collapsed.
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
            "--readonly-notes shows notes but blocks adding or editing them. "
            "Tall outputs start collapsed; --no-hide-tall-outputs leaves them expanded. "
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
        "--readonly-notes",
        action="store_true",
        help="Show notes, but block adding or editing them",
    )
    p.add_argument(
        "--source-name",
        default=None,
        help="Name shown in the page header (default: notebook filename)",
    )
    p.add_argument(
        "--export-notebook",
        type=Path,
        default=None,
        help="Notebook the page downloads (default: the input notebook)",
    )
    p.add_argument(
        "--export-source-name",
        default=None,
        help="Filename used when the page downloads the notebook",
    )
    p.add_argument(
        "--note-storage-key",
        default=None,
        help="Browser storage key for notes on this page",
    )
    p.add_argument(
        "--diff-initial-mode",
        choices=("full", "filtered", "additions", "off"),
        default=None,
        help="Initial diff display mode",
    )
    p.add_argument(
        "--hide-tall-outputs",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Collapse outputs taller than the screen (default: on)",
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
    if args.readonly_notes:
        cmd.append("--readonly-notes")
    if args.source_name is not None:
        cmd.extend(["--source-name", args.source_name])
    if args.export_notebook is not None:
        cmd.extend(["--export-notebook", str(args.export_notebook)])
    if args.export_source_name is not None:
        cmd.extend(["--export-source-name", args.export_source_name])
    if args.note_storage_key is not None:
        cmd.extend(["--note-storage-key", args.note_storage_key])
    if args.diff_initial_mode is not None:
        cmd.extend(["--diff-initial-mode", args.diff_initial_mode])
    cmd.append("--hide-tall-outputs" if args.hide_tall_outputs else "--no-hide-tall-outputs")

    try:
        proc = subprocess.run(cmd, check=False)
    except OSError as e:
        print(f"error: failed to run Node: {e}", file=sys.stderr)
        return 1
    return int(proc.returncode)


if __name__ == "__main__":
    sys.exit(main())
