#!/usr/bin/env python3
"""
sync.py — Scan sibling GitHub repos for CLAUDE.md / README.md and
merge discovered tasks into data/projects.json.

Usage:
    python3 sync.py               # dry-run preview
    python3 sync.py --write       # write changes to data/projects.json

The script:
  - Extracts GitHub-flavoured checkbox items  (- [ ] / - [x])
  - Extracts content under headings named: todo, roadmap, tasks,
    next steps, backlog, planned (case-insensitive)
  - Tags each synced task with its source file path
  - Merges into projects.json: adds new tasks, updates status of
    existing synced tasks, never touches UI-added tasks (no 'source' key)
"""

import json
import re
import sys
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

GITHUB_ROOT  = Path(__file__).parent.parent          # /Documents/GitHub
TODO_DIR     = Path(__file__).parent                 # /Documents/GitHub/todo
DATA_FILE    = TODO_DIR / "data" / "projects.json"

SOURCE_FILES = ["CLAUDE.md", "README.md"]

TODO_HEADINGS = re.compile(
    r'^#{1,4}\s*(todo|roadmap|tasks?|next\s+steps?|backlog|planned)',
    re.IGNORECASE
)

CHECKBOX_RE = re.compile(r'^\s*[-*]\s+\[([ xX])\]\s+(.+)')

HEADING_RE  = re.compile(r'^#{1,4}\s+')

# ── Extraction ────────────────────────────────────────────────────────────────

def extract_tasks(path: Path) -> list[dict]:
    """Return a list of task dicts extracted from a markdown file."""
    tasks = []
    seen_titles = set()

    try:
        text = path.read_text(encoding='utf-8', errors='replace')
    except OSError:
        return tasks

    lines        = text.splitlines()
    in_section   = False

    for line in lines:
        # Track entry/exit of todo-like sections
        if HEADING_RE.match(line):
            in_section = bool(TODO_HEADINGS.match(line))

        # Always capture checkbox items anywhere in the file
        m = CHECKBOX_RE.match(line)
        if m:
            done  = m.group(1).lower() == 'x'
            title = m.group(2).strip()
            key   = title.lower()
            if key not in seen_titles:
                seen_titles.add(key)
                tasks.append({
                    'title':  title,
                    'status': 'done' if done else 'todo',
                    'source': 'checkbox',
                })
            continue

        # Inside a todo section, capture plain list items too
        if in_section:
            plain = re.match(r'^\s*[-*]\s+(.+)', line)
            if plain:
                title = plain.group(1).strip()
                key   = title.lower()
                if key not in seen_titles:
                    seen_titles.add(key)
                    tasks.append({
                        'title':  title,
                        'status': 'todo',
                        'source': 'section',
                    })

    return tasks


# ── Merge ─────────────────────────────────────────────────────────────────────

def uid(path: Path, title: str) -> str:
    """Stable deterministic ID from source path + title."""
    import hashlib
    raw = f"{path}|{title}".encode()
    return hashlib.sha1(raw).hexdigest()[:12]


def merge(data: dict, repo: str, source_path: Path, raw_tasks: list[dict]) -> tuple[int, int]:
    """
    Merge raw_tasks into the project whose id matches `repo`.
    Creates the project if it doesn't exist.
    Returns (added, updated) counts.
    """
    # Find or create project
    project = next((p for p in data['projects'] if p['id'] == repo), None)
    if project is None:
        project = {
            'id':          repo,
            'name':        repo,
            'description': f'Synced from {source_path.name}',
            'tasks':       [],
        }
        data['projects'].append(project)

    existing_by_id    = {t['id']: t for t in project['tasks'] if 'id' in t}
    existing_by_title = {t['title'].lower(): t for t in project['tasks']}

    added = updated = 0

    for raw in raw_tasks:
        task_id = uid(source_path, raw['title'])
        source_tag = str(source_path)

        if task_id in existing_by_id:
            # Update status if it changed in the file (only for synced tasks)
            task = existing_by_id[task_id]
            if task.get('source') and task['status'] != raw['status']:
                task['status'] = raw['status']
                updated += 1
        elif raw['title'].lower() in existing_by_title:
            # Same title exists (maybe added via UI) — skip to avoid dupe
            pass
        else:
            project['tasks'].append({
                'id':       task_id,
                'title':    raw['title'],
                'status':   raw['status'],
                'priority': 'medium',
                'notes':    '',
                'source':   source_tag,
            })
            added += 1

    return added, updated


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    write_mode = '--write' in sys.argv

    # Load existing data
    if DATA_FILE.exists():
        data = json.loads(DATA_FILE.read_text())
    else:
        data = {'projects': []}

    total_added = total_updated = 0
    report = []

    for repo_dir in sorted(GITHUB_ROOT.iterdir()):
        if not repo_dir.is_dir() or repo_dir.name == 'todo':
            continue
        if repo_dir.name.startswith('.'):
            continue

        for fname in SOURCE_FILES:
            fpath = repo_dir / fname
            if not fpath.exists():
                continue

            tasks = extract_tasks(fpath)
            if not tasks:
                continue

            added, updated = merge(data, repo_dir.name, fpath, tasks)
            total_added   += added
            total_updated += updated

            if added or updated:
                report.append(
                    f"  {repo_dir.name}/{fname}: +{added} new, ~{updated} updated"
                )

    # Summary
    print(f"\nSync complete: {total_added} tasks added, {total_updated} updated.")
    if report:
        print('\n'.join(report))
    else:
        print("  No changes detected.")

    if write_mode:
        DATA_FILE.write_text(json.dumps(data, indent=2))
        print(f"\nWrote {DATA_FILE}")
        print("Tip: reload the site and clear localStorage to pick up the new JSON.")
        print("     (Open DevTools → Application → Local Storage → delete the key)")
    else:
        print("\nDry run — pass --write to save changes.")
        print("\nPreview of updated projects.json:")
        print(json.dumps(data, indent=2))


if __name__ == '__main__':
    main()
