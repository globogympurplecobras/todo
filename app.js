const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function load() {
  const app = document.getElementById('app');
  try {
    const res = await fetch('data/projects.json?v=' + Date.now());
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    render(data);
  } catch (e) {
    app.innerHTML = `<p class="state-msg">Could not load projects.json — serve this over HTTP (e.g. <code>python3 -m http.server</code>).</p>`;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

let allProjects = [];
let activeFilter = 'all';

function render(data) {
  allProjects = data.projects || [];

  // Header meta
  const total = allProjects.reduce((n, p) => n + p.tasks.length, 0);
  const done  = allProjects.reduce((n, p) => n + p.tasks.filter(t => t.status === 'done').length, 0);
  document.getElementById('header-meta').textContent =
    `${done} / ${total} done across ${allProjects.length} projects`;

  renderFilters();
  renderProjects();
}

function renderFilters() {
  const app = document.getElementById('app');
  const filters = document.createElement('div');
  filters.className = 'filters';
  filters.id = 'filters';

  [['all','All'], ['todo','To do'], ['done','Done'], ['high','High priority']]
    .forEach(([val, label]) => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (activeFilter === val ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        activeFilter = val;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderProjects();
      });
      filters.appendChild(btn);
    });

  const existing = document.getElementById('filters');
  if (existing) existing.replaceWith(filters);
  else app.prepend(filters);
}

function renderProjects() {
  // Remove old project cards
  document.querySelectorAll('.project').forEach(el => el.remove());

  const app = document.getElementById('app');
  const filters = document.getElementById('filters');

  allProjects.forEach(project => {
    let tasks = project.tasks || [];

    // Apply filter
    if (activeFilter === 'todo')  tasks = tasks.filter(t => t.status !== 'done');
    if (activeFilter === 'done')  tasks = tasks.filter(t => t.status === 'done');
    if (activeFilter === 'high')  tasks = tasks.filter(t => t.priority === 'high');

    const card = buildProjectCard(project, tasks);
    app.appendChild(card);
  });
}

function buildProjectCard(project, tasks) {
  const total = project.tasks.length;
  const done  = project.tasks.filter(t => t.status === 'done').length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  const card = el('div', 'project');

  // Header
  const head = el('div', 'project-head');
  const info = el('div', 'project-info');
  info.innerHTML = `
    <div class="project-name">${esc(project.name)}</div>
    ${project.description ? `<div class="project-desc">${esc(project.description)}</div>` : ''}
  `;

  const stats = el('div', 'project-stats');
  stats.innerHTML = `
    <span class="stat-pill">${done}/${total}</span>
    <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
  `;

  head.appendChild(info);
  head.appendChild(stats);
  card.appendChild(head);

  if (!tasks.length) {
    const empty = el('p', 'no-tasks');
    empty.textContent = activeFilter === 'all' ? 'No tasks.' : 'Nothing here.';
    card.appendChild(empty);
    return card;
  }

  // Group by priority (within the filtered set)
  const groups = groupByPriority(tasks);
  groups.forEach(({ label, items }) => {
    if (!items.length) return;

    const sec = el('div', 'section-label');
    sec.textContent = label;
    card.appendChild(sec);

    items.forEach(task => card.appendChild(buildTask(task)));
  });

  return card;
}

function groupByPriority(tasks) {
  const sorted = [...tasks].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
  );

  const groups = [
    { label: 'High priority',   key: 'high',   items: [] },
    { label: 'Medium priority', key: 'medium', items: [] },
    { label: 'Low priority',    key: 'low',    items: [] },
    { label: 'Other',           key: null,     items: [] },
  ];

  sorted.forEach(task => {
    const g = groups.find(g => g.key === task.priority) || groups[3];
    g.items.push(task);
  });

  // If only one priority group has items, skip the section label
  const populated = groups.filter(g => g.items.length);
  if (populated.length === 1) populated[0].label = null;

  return groups;
}

function buildTask(task) {
  const done = task.status === 'done';
  const row  = el('div', 'task' + (done ? ' is-done' : ''));

  const dot = el('div', 'task-dot');
  const body = el('div', 'task-body');

  const title = el('div', 'task-title');
  title.textContent = task.title;
  body.appendChild(title);

  if (task.notes) {
    const notes = el('div', 'task-notes');
    notes.textContent = task.notes;
    body.appendChild(notes);
  }

  const foot = el('div', 'task-foot');

  if (done) {
    foot.appendChild(badge('Done', 'tag tag-done'));
  } else if (task.priority) {
    foot.appendChild(badge(cap(task.priority), `tag tag-${task.priority}`));
  }

  if (task.source) {
    const src = el('span', 'tag tag-source');
    src.textContent = shortSource(task.source);
    foot.appendChild(src);
  }

  if (foot.children.length) body.appendChild(foot);

  row.appendChild(dot);
  row.appendChild(body);
  return row;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function badge(text, cls) {
  const s = el('span', cls);
  s.textContent = text;
  return s;
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function shortSource(path) {
  // "/Users/jon/Documents/GitHub/efl/CLAUDE.md" → "efl/CLAUDE.md"
  const parts = path.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}

// ── Boot ──────────────────────────────────────────────────────────────────────

load();
