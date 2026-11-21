"""Run the UI UX Pro Max search.py with isolated interpreter flags.

Usage (from the project root):
    python -I scripts/uiux_search.py "<query>" [search.py options...]

The skill's own scripts folder is added to sys.path explicitly so its sibling
modules (core.py, design_system.py) can be imported. The current working
directory and the caller's environment are not added to the import path.
"""
import os
import runpy
import sys

SKILL_SCRIPTS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", ".claude", "skills", "ui-ux-pro-max", "scripts",
)
SKILL_SCRIPTS = os.path.normpath(SKILL_SCRIPTS)
SEARCH = os.path.join(SKILL_SCRIPTS, "search.py")

sys.path.insert(0, SKILL_SCRIPTS)
sys.argv = [SEARCH] + sys.argv[1:]
runpy.run_path(SEARCH, run_name="__main__")
