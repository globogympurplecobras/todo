// ── State ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'project-todos-v1';
let state = { projects: [] };

// ── Persistence ──────────────────────────────────────────────────────────────

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateJsonPanel();
}

async function loadData() {
  // Try localStorage first (UI-made edits take precedence)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { state = JSON.parse(stored); return; } catch {}
  }
  // Fall back to projects.json (source of truth when Claude edits it)
  try {
    const res = await fetch('data/projects.json');
    if (!res.ok) throw new Error('fetch failed');
    state = await res.json();
    saveLocal();
  } catch {
    state = { projects: [] };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
  const container = document.getElementById('projects-container');
  container.innerHTML = '';

  if (!state.projects.length) {
    container.innerHTML = '<p class="loading">No projects yet — add one above.</p>';
    return;
  }

  state.projects.forEach(project => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.id = project.id;

    const pending = project.tasks.filter(t => t.status !== 'done').length;
    const total   = project.tasks.length;

    card.innerHTML = `
      <div class="project-header">
        <div>
          <h2>${escHtml(project.name)}</h2>
          ${project.description ? `<p class="project-desc">${escHtml(project.description)}</p>` : ''}
          <p class="project-desc">${pending} remaining / ${total} total</p>
        </div>
        <button class="add-task-btn" data-project="${project.id}">+ Task</button>
      </div>
      <ul class="task-list">
        ${project.tasks.length
          ? project.tasks.map(taskHtml).join('')
          : '<li class="no-tasks">No tasks yet.</li>'}
      </ul>
    `;

    container.appendChild(card);
  });

  updateJsonPanel();
}

function taskHtml(task) {
  const done = task.status === 'done';
  return `
    <li class="task-item${done ? ' done' : ''}" data-id="${task.id}">
      <input type="checkbox" ${done ? 'checked' : ''} aria-label="Mark done">
      <div class="task-body">
        <div class="task-title">${escHtml(task.title)}</div>
        ${task.notes ? `<div class="task-notes">${escHtml(task.notes)}</div>` : ''}
        <div class="task-meta">
          <span class="priority-badge ${task.priority}">${task.priority}</span>
        </div>
      </div>
      <button class="task-delete" aria-label="Delete task" title="Delete">×</button>
    </li>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── JSON Panel ────────────────────────────────────────────────────────────────

function updateJsonPanel() {
  document.getElementById('json-output').value = JSON.stringify(state, null, 2);
}

// ── Events ───────────────────────────────────────────────────────────────────

// Toggle task done
document.getElementById('projects-container').addEventListener('change', e => {
  if (e.target.type !== 'checkbox') return;
  const li   = e.target.closest('.task-item');
  const card = e.target.closest('.project-card');
  if (!li || !card) return;

  const project = state.projects.find(p => p.id === card.dataset.id);
  if (!project) return;
  const task = project.tasks.find(t => t.id === li.dataset.id);
  if (!task) return;

  task.status = e.target.checked ? 'done' : 'todo';
  saveLocal();
  render();
});

// Delete task
document.getElementById('projects-container').addEventListener('click', e => {
  const btn  = e.target.closest('.task-delete');
  const addBtn = e.target.closest('.add-task-btn');

  if (btn) {
    const li   = btn.closest('.task-item');
    const card = btn.closest('.project-card');
    const project = state.projects.find(p => p.id === card.dataset.id);
    if (!project) return;
    project.tasks = project.tasks.filter(t => t.id !== li.dataset.id);
    saveLocal();
    render();
  }

  if (addBtn) {
    openTaskModal(addBtn.dataset.project);
  }
});

// ── Project Modal ─────────────────────────────────────────────────────────────

const projectModal = document.getElementById('project-modal');
const projectForm  = document.getElementById('project-form');

document.getElementById('add-project-btn').addEventListener('click', () => {
  projectForm.reset();
  projectModal.showModal();
});

document.getElementById('cancel-project').addEventListener('click', () => {
  projectModal.close();
});

projectForm.addEventListener('submit', e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(projectForm));
  state.projects.push({
    id: uid(),
    name: data.name.trim(),
    description: data.description.trim(),
    tasks: []
  });
  saveLocal();
  render();
  projectModal.close();
});

// ── Task Modal ────────────────────────────────────────────────────────────────

const taskModal = document.getElementById('task-modal');
const taskForm  = document.getElementById('task-form');

function openTaskModal(projectId) {
  taskForm.reset();
  taskForm.elements.projectId.value = projectId;
  taskModal.showModal();
}

document.getElementById('cancel-task').addEventListener('click', () => {
  taskModal.close();
});

taskForm.addEventListener('submit', e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(taskForm));
  const project = state.projects.find(p => p.id === data.projectId);
  if (!project) return;

  project.tasks.push({
    id: uid(),
    title: data.title.trim(),
    notes: data.notes.trim(),
    priority: data.priority,
    status: 'todo'
  });
  saveLocal();
  render();
  taskModal.close();
});

// ── Copy JSON ─────────────────────────────────────────────────────────────────

document.getElementById('copy-json-btn').addEventListener('click', () => {
  const text = document.getElementById('json-output').value;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-json-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500);
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadData().then(render);
