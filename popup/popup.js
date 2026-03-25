// JobFill Popup Script
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  profile: null,
  pageInfo: null,
  coverLetter: '',
  analysis: null,
  applications: [],
  activeTab: 'fill',
  isGenerating: false,
  isAnalyzing: false,
  isFilling: false
};

// ─── DOM References ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupEventListeners();
  await loadProfile();
  await checkCurrentPage();
  await loadApplications();
  updateSettingsTab();
});

// ─── Profile Loading ──────────────────────────────────────────────────────────
async function loadProfile() {
  return new Promise(resolve => {
    chrome.storage.local.get(['profile', 'settings'], data => {
      state.profile = data.profile || {};
      state.settings = data.settings || {};
      updateProfileCompletion();
      updateFollowUpDesc();
      resolve();
    });
  });
}

function updateProfileCompletion() {
  const profile = state.profile || {};
  const fields = [
    profile.personal?.firstName,
    profile.personal?.lastName,
    profile.personal?.email,
    profile.personal?.phone,
    profile.personal?.location,
    profile.professional?.currentTitle,
    profile.professional?.experience,
    profile.resume?.fileData,
    profile.groqApiKey,
    (profile.skills || []).length > 0 ? 'ok' : null
  ];

  const filled = fields.filter(Boolean).length;
  const pct = Math.round((filled / fields.length) * 100);

  $('completionPct').textContent = `${pct}%`;
  $('progressFill').style.width = `${pct}%`;
  $('progressFill').style.background = pct >= 70
    ? 'linear-gradient(90deg, #22c55e, #4ade80)'
    : pct >= 40
      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
      : 'linear-gradient(90deg, #3b82f6, #60a5fa)';
}

function updateFollowUpDesc() {
  const days = state.settings?.followUpDays || 7;
  $('followUpDesc').textContent = `After ${days} days`;
}

// ─── Page Check ───────────────────────────────────────────────────────────────
async function checkCurrentPage() {
  try {
    const response = await sendToBackground({ action: 'GET_PAGE_INFO' });
    if (!response) return;
    state.pageInfo = response;
    updateStatusBar(response);

    if (response.isJobPage && response.fieldCount > 0) {
      showSaveAppPrompt(response.jobMeta);
      if (state.profile?.groqApiKey) {
        startJobAnalysis();
      }
    }
  } catch (e) {
    updateStatusBar(null);
  }
}

function updateStatusBar(pageInfo) {
  const dot = $('statusDot');
  const text = $('statusText');
  const platformBadge = $('platformBadge');

  if (!pageInfo || !pageInfo.success) {
    dot.className = 'status-dot no-form';
    text.textContent = 'Cannot access this page';
    return;
  }

  if (pageInfo.isJobPage && pageInfo.fieldCount > 0) {
    dot.className = 'status-dot detected';
    text.textContent = `${pageInfo.fieldCount} fields detected`;
  } else if (pageInfo.fieldCount > 0) {
    dot.className = 'status-dot';
    dot.style.background = '#f59e0b';
    text.textContent = `${pageInfo.fieldCount} fields found`;
  } else {
    dot.className = 'status-dot no-form';
    text.textContent = 'No form detected';
  }

  if (pageInfo.platform?.name) {
    platformBadge.textContent = pageInfo.platform.name;
    platformBadge.style.display = 'block';
  }
}

function showSaveAppPrompt(jobMeta) {
  if (!jobMeta) return;
  const name = [jobMeta.jobTitle, jobMeta.company].filter(Boolean).join(' @ ') || 'this job';
  $('saveAppName').textContent = name.slice(0, 40);
  $('saveAppPrompt').classList.add('visible');
}

// ─── Job Analysis ─────────────────────────────────────────────────────────────
async function startJobAnalysis() {
  if (state.isAnalyzing || !state.pageInfo?.jobDescription) return;
  state.isAnalyzing = true;

  const badge = $('matchBadge');
  badge.style.display = 'flex';
  badge.className = 'match-badge loading';
  badge.innerHTML = '<div class="spinner" style="width:10px;height:10px;border-width:1.5px"></div><span>Analyzing...</span>';

  try {
    const resp = await sendToBackground({
      action: 'ANALYZE_JOB',
      jobDescription: state.pageInfo.jobDescription,
      profile: state.profile
    });

    if (resp?.success && resp.analysis) {
      state.analysis = resp.analysis;
      updateMatchBadge(resp.analysis.matchScore);
      renderAnalysisPanel(resp.analysis);
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    badge.style.display = 'none';
  } finally {
    state.isAnalyzing = false;
  }
}

function updateMatchBadge(score) {
  const badge = $('matchBadge');
  badge.style.display = 'flex';

  const color = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';
  const label = score >= 70 ? 'Great Match' : score >= 40 ? 'Partial Match' : 'Low Match';
  badge.className = `match-badge ${color}`;
  badge.innerHTML = `<span>${score}%</span><span>${label}</span>`;
  badge.style.cursor = 'pointer';
  badge.onclick = () => {
    const panel = $('analysisPanel');
    panel.classList.toggle('visible');
  };
}

function renderAnalysisPanel(analysis) {
  const panel = $('analysisPanel');
  const content = $('analysisContent');

  let html = '';

  if (analysis.matchedSkills?.length) {
    html += `<div style="margin-bottom:10px">
      <div class="section-label" style="margin-bottom:6px;color:#9ca3af">Matched Skills</div>
      <div class="analysis-skills">
        ${analysis.matchedSkills.map(s => `<span class="skill-tag matched">${s}</span>`).join('')}
      </div>
    </div>`;
  }

  if (analysis.missingSkills?.length) {
    html += `<div style="margin-bottom:10px">
      <div class="section-label" style="margin-bottom:6px;color:#9ca3af">Missing Skills</div>
      <div class="analysis-skills">
        ${analysis.missingSkills.map(s => `<span class="skill-tag missing">${s}</span>`).join('')}
      </div>
    </div>`;
  }

  if (analysis.highlights?.length) {
    html += `<div style="margin-bottom:8px">
      <div class="section-label" style="margin-bottom:6px;color:#9ca3af">Why It's a Match</div>
      <ul class="analysis-list">
        ${analysis.highlights.map(h => `<li>${h}</li>`).join('')}
      </ul>
    </div>`;
  }

  if (analysis.redFlags?.length) {
    html += `<div>
      <div class="section-label" style="margin-bottom:6px;color:#9ca3af">Watch Out</div>
      <ul class="analysis-list flags">
        ${analysis.redFlags.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>`;
  }

  if (analysis.salaryRange) {
    html += `<div style="margin-top:8px;font-size:11px;color:#9ca3af">
      💰 Salary: <span style="color:#fff">${analysis.salaryRange}</span>
    </div>`;
  }

  content.innerHTML = html;
  // panel shows on badge click
}

// ─── Form Filling ─────────────────────────────────────────────────────────────
async function fillForm() {
  if (state.isFilling) return;
  if (!state.profile?.personal?.firstName && !state.profile?.personal?.email) {
    showToast('Please complete your profile first', 'error');
    openOptions();
    return;
  }

  state.isFilling = true;
  const btn = $('btnFill');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div> Filling...';
  btn.disabled = true;

  try {
    const resp = await sendToBackground({ action: 'FILL_ACTIVE_TAB', profile: state.profile });
    if (resp?.success) {
      const count = resp.filledCount || 0;
      if (count > 0) {
        showToast(`✓ Filled ${count} fields successfully!`, 'success');
      } else {
        showToast('No matching fields found on this page', 'info');
      }
    } else {
      showToast(resp?.error || 'Could not fill the form', 'error');
    }
  } catch (e) {
    showToast('Error filling form', 'error');
  } finally {
    state.isFilling = false;
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

// ─── Cover Letter ─────────────────────────────────────────────────────────────
async function generateCoverLetter() {
  if (state.isGenerating) return;

  if (!state.profile?.groqApiKey) {
    showToast('Add your Groq API key in Settings first', 'error');
    switchTab('settings');
    return;
  }

  const jobDescription = state.pageInfo?.jobDescription || '';
  if (jobDescription.length < 50) {
    showToast('No job description found on this page', 'error');
    return;
  }

  state.isGenerating = true;
  const btn = $('btnGenCoverLetter');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div> Generating...';
  btn.disabled = true;

  const container = $('coverLetterContainer');
  const textEl = $('coverLetterText');
  container.style.display = 'block';
  textEl.textContent = '';

  try {
    const resp = await sendToBackground({
      action: 'GENERATE_COVER_LETTER',
      jobDescription,
      profile: state.profile,
      jobMeta: state.pageInfo?.jobMeta || {}
    });

    if (resp?.success && resp.coverLetter) {
      state.coverLetter = resp.coverLetter;
      typewriterEffect(textEl, resp.coverLetter);
    } else {
      const errMsg = formatApiError(resp?.error);
      textEl.textContent = '';
      showToast(errMsg, 'error');
      container.style.display = 'none';
    }
  } catch (e) {
    showToast('Failed to generate cover letter', 'error');
    container.style.display = 'none';
  } finally {
    state.isGenerating = false;
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

function typewriterEffect(el, text) {
  el.textContent = '';
  const words = text.split(' ');
  let i = 0;
  const interval = setInterval(() => {
    if (i >= words.length) {
      clearInterval(interval);
      return;
    }
    el.textContent += (i > 0 ? ' ' : '') + words[i++];
    el.scrollTop = el.scrollHeight;
  }, 30);
}

async function copyCoverLetter() {
  if (!state.coverLetter) return;
  try {
    await navigator.clipboard.writeText(state.coverLetter);
    showToast('✓ Copied to clipboard!', 'success');
  } catch (e) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = state.coverLetter;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✓ Copied!', 'success');
  }
}

// ─── Application Saving ───────────────────────────────────────────────────────
async function saveCurrentApplication() {
  const pageInfo = state.pageInfo;
  const jobMeta = pageInfo?.jobMeta || {};
  const analysis = state.analysis;

  const jobData = {
    url: pageInfo?.url || '',
    jobTitle: jobMeta.jobTitle || analysis?.jobTitle || 'Unknown Role',
    company: jobMeta.company || analysis?.company || 'Unknown Company',
    matchScore: analysis?.matchScore || 0,
    coverLetter: state.coverLetter || '',
    jobDescription: (pageInfo?.jobDescription || '').slice(0, 2000)
  };

  const btn = $('btnSaveApp');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const resp = await sendToBackground({ action: 'SAVE_JOB_APPLICATION', jobData });
    if (resp?.success) {
      showToast(resp.updated ? '✓ Application updated!' : '✓ Application saved!', 'success');
      $('saveAppPrompt').classList.remove('visible');
      await loadApplications();
    } else {
      showToast('Could not save application', 'error');
    }
  } catch (e) {
    showToast('Error saving application', 'error');
  } finally {
    btn.textContent = 'Save';
    btn.disabled = false;
  }
}

// ─── Applications List ────────────────────────────────────────────────────────
async function loadApplications() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'GET_APPLICATIONS', filters: { sortBy: 'date' } }, resp => {
      state.applications = resp?.applications || [];
      renderApplications();
      resolve();
    });
  });
}

function renderApplications() {
  const list = $('appsList');
  const apps = state.applications.slice(0, 5);

  if (apps.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3>No applications yet</h3>
        <p>Fill a form and save it to start tracking</p>
      </div>`;
    return;
  }

  list.innerHTML = apps.map(app => {
    const date = new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const scoreColor = app.matchScore >= 70 ? '#22c55e' : app.matchScore >= 40 ? '#f59e0b' : '#9ca3af';

    return `
      <div class="app-card">
        <div class="app-card-header">
          <div>
            <div class="app-company">${escHtml(app.company)}</div>
            <div class="app-title">${escHtml(app.jobTitle)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="app-date">${date}</span>
            ${app.matchScore ? `<span class="score-mini" style="color:${scoreColor}">${app.matchScore}%</span>` : ''}
          </div>
        </div>
        <div class="app-footer">
          <span class="status-badge ${app.status}">${app.status}</span>
          <div style="margin-left:auto;display:flex;gap:5px">
            ${app.url ? `<button class="btn btn-secondary btn-sm" onclick="openUrl('${escHtml(app.url)}')">↗</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function openUrl(url) {
  chrome.tabs.create({ url });
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function updateSettingsTab() {
  const apiStatus = $('apiStatus');
  const profileDesc = $('profileStatusDesc');

  if (state.profile?.groqApiKey) {
    apiStatus.className = 'api-status connected';
    apiStatus.textContent = '✓ Connected';
  } else {
    apiStatus.className = 'api-status disconnected';
    apiStatus.textContent = 'Not Set';
  }

  const hasName = state.profile?.personal?.firstName || state.profile?.personal?.lastName;
  const hasEmail = state.profile?.personal?.email;
  if (hasName && hasEmail) {
    profileDesc.textContent = `${state.profile.personal.firstName || ''} ${state.profile.personal.lastName || ''}`.trim();
  } else {
    profileDesc.textContent = 'Not configured';
  }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function setupTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
  $('btnFill').addEventListener('click', fillForm);
  $('btnGenCoverLetter').addEventListener('click', generateCoverLetter);
  $('btnRegenCoverLetter').addEventListener('click', () => {
    state.coverLetter = '';
    generateCoverLetter();
  });
  $('btnCopyCoverLetter').addEventListener('click', copyCoverLetter);
  $('btnClearCoverLetter').addEventListener('click', () => {
    state.coverLetter = '';
    $('coverLetterContainer').style.display = 'none';
  });

  $('btnSaveApp').addEventListener('click', saveCurrentApplication);
  $('btnViewAll').addEventListener('click', () => {
    sendToBackground({ action: 'OPEN_DASHBOARD' });
  });

  $('btnDashboard').addEventListener('click', () => {
    sendToBackground({ action: 'OPEN_DASHBOARD' });
  });

  $('btnOptions').addEventListener('click', openOptions);
  $('btnEditProfile').addEventListener('click', openOptions);
  $('btnSettingsPage').addEventListener('click', openOptions);
  $('btnOpenDashboard2').addEventListener('click', () => {
    sendToBackground({ action: 'OPEN_DASHBOARD' });
  });

  $('btnPreviewFields').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'CHECK_FORM' }, resp => {
          if (chrome.runtime.lastError || !resp) {
            showToast('Cannot scan this page', 'info');
            return;
          }
          showToast(`Found ${resp.fieldCount} fillable fields`, 'info');
        });
      }
    } catch (e) {
      showToast('Cannot access this page', 'info');
    }
  });

  $('btnClearFill').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        // Ask content script to do nothing - clear is a browser refresh
        showToast('Refresh the page to reset all fields', 'info');
      }
    } catch (e) {}
  });

  $('btnExportData').addEventListener('click', exportData);
  $('btnClearData').addEventListener('click', clearAllData);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function openOptions() {
  chrome.runtime.openOptionsPage();
}

function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function formatApiError(error) {
  if (!error) return 'Unknown error occurred';
  if (error === 'GROQ_API_KEY_MISSING') return 'Add your Groq API key in Settings';
  if (error === 'GROQ_AUTH_ERROR') return 'Invalid Groq API key';
  if (error === 'GROQ_RATE_LIMIT') return 'Groq rate limit hit. Try again in a moment';
  if (error.startsWith('GROQ_API_ERROR')) return 'Groq API error. Check your key';
  return 'Failed to generate. Please try again';
}

function showToast(message, type = 'info') {
  // Remove existing toast
  document.querySelector('.toast')?.remove();

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}

async function exportData() {
  chrome.storage.local.get(null, data => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobfill-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function clearAllData() {
  if (!confirm('Clear ALL JobFill data? This cannot be undone.')) return;
  chrome.storage.local.clear(() => {
    state.applications = [];
    state.profile = {};
    state.coverLetter = '';
    state.analysis = null;
    renderApplications();
    updateProfileCompletion();
    updateSettingsTab();
    showToast('All data cleared', 'success');
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'FORM_DETECTED') {
    updateStatusBar({ success: true, isJobPage: true, fieldCount: message.fieldCount, platform: { name: message.platform } });
  }
});
