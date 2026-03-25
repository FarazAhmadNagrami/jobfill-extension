// JobFill Dashboard Script
'use strict';

const ITEMS_PER_PAGE = 10;

let allApplications = [];
let filteredApplications = [];
let currentFilter = 'all';
let currentSort = 'date';
let currentPage = 1;
let searchQuery = '';
let pendingSaves = new Map(); // id -> timeout

const $ = id => document.getElementById(id);

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadApplications();
  setupEventListeners();
  applyFilters();
  updateStats();
});

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadApplications() {
  return new Promise(resolve => {
    chrome.storage.local.get(['applications'], data => {
      allApplications = data.applications || [];
      resolve();
    });
  });
}

async function saveApplications() {
  return new Promise(resolve => {
    chrome.storage.local.set({ applications: allApplications }, resolve);
  });
}

// ─── Filters & Sort ───────────────────────────────────────────────────────────
function applyFilters() {
  let apps = [...allApplications];

  // Filter by status
  if (currentFilter !== 'all') {
    apps = apps.filter(a => a.status === currentFilter);
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    apps = apps.filter(a =>
      a.company?.toLowerCase().includes(q) ||
      a.jobTitle?.toLowerCase().includes(q) ||
      a.notes?.toLowerCase().includes(q)
    );
  }

  // Sort
  apps = sortApps(apps, currentSort);

  filteredApplications = apps;
  currentPage = 1;
  updateFilterCounts();
  renderPage();
  updateResultsCount();
}

function sortApps(apps, sortBy) {
  return [...apps].sort((a, b) => {
    switch (sortBy) {
      case 'date': return new Date(b.appliedAt) - new Date(a.appliedAt);
      case 'company': return (a.company || '').localeCompare(b.company || '');
      case 'status': {
        const order = { offer: 0, interview: 1, applied: 2, ghosted: 3, rejected: 4 };
        return (order[a.status] ?? 5) - (order[b.status] ?? 5);
      }
      case 'matchScore': return (b.matchScore || 0) - (a.matchScore || 0);
      default: return 0;
    }
  });
}

function updateFilterCounts() {
  const counts = { all: allApplications.length };
  ['applied', 'interview', 'offer', 'rejected', 'ghosted'].forEach(s => {
    counts[s] = allApplications.filter(a => a.status === s).length;
  });

  $('countAll').textContent = counts.all;
  $('countApplied').textContent = counts.applied;
  $('countInterview').textContent = counts.interview;
  $('countOffer').textContent = counts.offer;
  $('countRejected').textContent = counts.rejected;
  $('countGhosted').textContent = counts.ghosted;
}

function updateResultsCount() {
  const total = filteredApplications.length;
  const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(currentPage * ITEMS_PER_PAGE, total);
  $('resultsCount').textContent = total > 0
    ? `${start}-${end} of ${total} application${total !== 1 ? 's' : ''}`
    : '0 applications';
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  const total = allApplications.length;
  const applied = allApplications.filter(a => a.status === 'applied').length;
  const interview = allApplications.filter(a => a.status === 'interview').length;
  const offer = allApplications.filter(a => a.status === 'offer').length;
  const rate = total > 0 ? Math.round(((interview + offer) / total) * 100) : 0;

  // Count this week's applications
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = allApplications.filter(a => new Date(a.appliedAt) > weekAgo).length;

  $('statTotal').textContent = total;
  $('statTotalTrend').textContent = `${thisWeek} this week`;
  $('statApplied').textContent = applied;
  $('statInterview').textContent = interview;
  $('statOffer').textContent = offer;
  $('statRate').textContent = `${rate}%`;
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderPage() {
  const grid = $('jobsGrid');
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageApps = filteredApplications.slice(start, end);

  if (filteredApplications.length === 0) {
    grid.innerHTML = renderEmptyState();
    $('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = pageApps.map(app => renderJobCard(app)).join('');
  attachCardListeners();
  renderPagination();
}

function renderEmptyState() {
  if (allApplications.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-art">📭</div>
        <h2>No applications yet</h2>
        <p>Visit a job posting page and use the JobFill extension to auto-fill and save your application.</p>
        <button class="btn btn-primary" onclick="chrome.runtime.openOptionsPage()">⚙ Set Up Profile</button>
      </div>`;
  }
  return `
    <div class="empty-state">
      <div class="empty-state-art">🔍</div>
      <h2>No results found</h2>
      <p>Try adjusting your search or filter settings.</p>
      <button class="btn btn-secondary" onclick="clearSearch()">Clear Search</button>
    </div>`;
}

function renderJobCard(app) {
  const date = formatDate(app.appliedAt);
  const scoreClass = app.matchScore >= 70 ? 'green' : app.matchScore >= 40 ? 'yellow' : app.matchScore > 0 ? 'red' : 'none';
  const scoreText = app.matchScore > 0 ? `${app.matchScore}%` : '—';
  const initial = (app.company || '?')[0].toUpperCase();
  const followUp = app.followUpDate ? app.followUpDate.split('T')[0] : '';
  const isOverdue = app.followUpDate && new Date(app.followUpDate) < new Date() && app.status === 'applied';

  return `
    <div class="job-card status-${app.status}" data-id="${escHtml(app.id)}">
      <div class="card-top">
        <div class="company-logo" style="background:${getCompanyColor(app.company)}20;color:${getCompanyColor(app.company)}">
          ${initial}
        </div>
        <div class="card-info">
          <div class="card-company" title="${escHtml(app.company)}">${escHtml(app.company || 'Unknown Company')}</div>
          <div class="card-title" title="${escHtml(app.jobTitle)}">${escHtml(app.jobTitle || 'Unknown Role')}</div>
          <div class="card-meta">
            <span class="status-badge ${app.status}">${app.status}</span>
            <span class="match-score ${scoreClass}">${scoreText}</span>
            <span class="card-date">📅 ${date}</span>
          </div>
        </div>
      </div>

      <textarea
        class="card-notes"
        placeholder="Add notes about this application..."
        data-id="${escHtml(app.id)}"
        maxlength="1000"
      >${escHtml(app.notes || '')}</textarea>

      <div class="followup-row">
        <span>📅 Follow-up:</span>
        <input
          type="date"
          class="followup-input ${isOverdue ? 'overdue' : ''}"
          data-id="${escHtml(app.id)}"
          value="${followUp}"
          title="${isOverdue ? 'Overdue! Time to follow up.' : 'Set follow-up date'}"
          style="${isOverdue ? 'border-color:#ef4444;color:#fca5a5' : ''}"
        >
        ${isOverdue ? '<span style="color:#ef4444;font-size:10px;font-weight:700">OVERDUE</span>' : ''}
      </div>

      <div class="card-actions">
        <select class="status-select" data-id="${escHtml(app.id)}">
          <option value="applied" ${app.status === 'applied' ? 'selected' : ''}>Applied</option>
          <option value="interview" ${app.status === 'interview' ? 'selected' : ''}>Interview</option>
          <option value="offer" ${app.status === 'offer' ? 'selected' : ''}>Offer</option>
          <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          <option value="ghosted" ${app.status === 'ghosted' ? 'selected' : ''}>Ghosted</option>
        </select>
        ${app.url ? `<button class="btn-action visit" data-url="${escHtml(app.url)}">↗ Visit</button>` : ''}
        <button class="btn-action delete" data-id="${escHtml(app.id)}">🗑</button>
      </div>
    </div>`;
}

function attachCardListeners() {
  // Status update
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await updateApp(sel.dataset.id, { status: sel.value });
      updateStats();
      updateFilterCounts();
      if (currentFilter !== 'all') applyFilters();
      showToast(`Status updated to ${sel.value}`, 'success');
    });
  });

  // Notes (debounced auto-save)
  document.querySelectorAll('.card-notes').forEach(ta => {
    ta.addEventListener('input', () => {
      const id = ta.dataset.id;
      if (pendingSaves.has(id)) clearTimeout(pendingSaves.get(id));
      const timeout = setTimeout(async () => {
        await updateApp(id, { notes: ta.value });
        pendingSaves.delete(id);
      }, 1000);
      pendingSaves.set(id, timeout);
    });
  });

  // Follow-up date
  document.querySelectorAll('.followup-input').forEach(input => {
    input.addEventListener('change', async () => {
      const date = input.value ? new Date(input.value).toISOString() : null;
      await updateApp(input.dataset.id, { followUpDate: date });
      showToast('Follow-up date saved', 'success');
    });
  });

  // Visit URL
  document.querySelectorAll('.btn-action.visit').forEach(btn => {
    btn.addEventListener('click', () => chrome.tabs.create({ url: btn.dataset.url }));
  });

  // Delete
  document.querySelectorAll('.btn-action.delete').forEach(btn => {
    btn.addEventListener('click', () => deleteApp(btn.dataset.id));
  });
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function renderPagination() {
  const totalPages = Math.ceil(filteredApplications.length / ITEMS_PER_PAGE);
  const pag = $('pagination');

  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = '';

  html += `<button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;

  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    } else if (i === currentPage - delta - 1 || i === currentPage + delta + 1) {
      html += `<span class="page-info">…</span>`;
    }
  }

  html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
  html += `<span class="page-info">${currentPage} / ${totalPages}</span>`;

  pag.innerHTML = html;
}

function goToPage(page) {
  const totalPages = Math.ceil(filteredApplications.length / ITEMS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderPage();
  updateResultsCount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
async function updateApp(id, updates) {
  const idx = allApplications.findIndex(a => a.id === id);
  if (idx === -1) return;
  allApplications[idx] = { ...allApplications[idx], ...updates, updatedAt: new Date().toISOString() };
  await saveApplications();
}

async function deleteApp(id) {
  if (!confirm('Delete this application? This cannot be undone.')) return;
  allApplications = allApplications.filter(a => a.id !== id);
  await saveApplications();
  applyFilters();
  updateStats();
  showToast('Application deleted', 'success');
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
  // Search
  let searchTimeout;
  $('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      applyFilters();
    }, 300);
  });

  // Sort
  $('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    applyFilters();
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      applyFilters();
    });
  });

  // Header buttons
  $('btnExportCSV').addEventListener('click', exportCSV);
  $('btnExportJSON').addEventListener('click', exportJSON);
  $('btnOpenOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

// ─── Exports ──────────────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['Company', 'Job Title', 'Status', 'Match Score', 'Applied Date', 'Follow-up Date', 'Notes', 'URL'];
  const rows = allApplications.map(a => [
    csvEscape(a.company),
    csvEscape(a.jobTitle),
    a.status,
    a.matchScore || '',
    formatDate(a.appliedAt),
    a.followUpDate ? formatDate(a.followUpDate) : '',
    csvEscape(a.notes),
    a.url || ''
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  downloadFile(csv, `jobfill-applications-${getDateStr()}.csv`, 'text/csv');
  showToast('CSV exported!', 'success');
}

function exportJSON() {
  const data = allApplications.map(a => ({
    ...a,
    jobDescription: undefined,
    coverLetter: undefined // Remove large fields
  }));
  downloadFile(JSON.stringify(data, null, 2), `jobfill-applications-${getDateStr()}.json`, 'application/json');
  showToast('JSON exported!', 'success');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clearSearch() {
  $('searchInput').value = '';
  searchQuery = '';
  applyFilters();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDateStr() {
  return new Date().toISOString().split('T')[0];
}

const COMPANY_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#84cc16'];
function getCompanyColor(company) {
  if (!company) return COMPANY_COLORS[0];
  let hash = 0;
  for (const c of company) hash = (hash * 31 + c.charCodeAt(0)) & 0xfffffff;
  return COMPANY_COLORS[hash % COMPANY_COLORS.length];
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}

function csvEscape(str) {
  const s = String(str || '').replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
}

function showToast(message, type = 'info') {
  const container = $('toast-container');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="color:${colors[type]};font-weight:bold">${icons[type]}</span>
    <span>${escHtml(message)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Storage change listener - refresh if data changes externally
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.applications) {
    allApplications = changes.applications.newValue || [];
    applyFilters();
    updateStats();
  }
});
