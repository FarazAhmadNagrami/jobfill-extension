// JobFill Options Page Script
'use strict';

const SKILL_SUGGESTIONS = [
  'JavaScript', 'TypeScript', 'Python', 'React', 'Node.js', 'Vue.js', 'Angular',
  'Java', 'C++', 'Go', 'Rust', 'SQL', 'PostgreSQL', 'MongoDB', 'Redis',
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'CI/CD', 'Git',
  'REST API', 'GraphQL', 'Machine Learning', 'Data Science', 'TensorFlow',
  'Product Management', 'Agile', 'Scrum', 'Figma', 'UI/UX Design',
  'Communication', 'Leadership', 'Project Management', 'Excel', 'Tableau'
];

let profile = {};
let settings = {};
let skills = [];
let resumeData = null;

const $ = id => document.getElementById(id);

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupNavigation();
  setupSkills();
  setupResumeUpload();
  setupApiKeyToggle();
  setupSaveButtons();
  setupOtherButtons();
  setupResumeModal();
  renderSkillSuggestions();
  populateForm();
  updateSidebarProgress();
});

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadData() {
  return new Promise(resolve => {
    chrome.storage.local.get(['profile', 'settings'], data => {
      profile = data.profile || {};
      settings = data.settings || {};
      skills = profile.skills || [];
      resumeData = profile.resume || null;
      resolve();
    });
  });
}

// ─── Populate Form ────────────────────────────────────────────────────────────
function populateForm() {
  // Personal
  setVal('firstName', profile.personal?.firstName);
  setVal('lastName', profile.personal?.lastName);
  setVal('email', profile.personal?.email);
  setVal('phone', profile.personal?.phone);
  setVal('location', profile.personal?.location);
  setVal('linkedin', profile.personal?.linkedin);
  setVal('github', profile.personal?.github);
  setVal('portfolio', profile.personal?.portfolio);

  // Professional
  setVal('currentTitle', profile.professional?.currentTitle);
  setVal('currentCompany', profile.professional?.currentCompany);
  setVal('experience', profile.professional?.experience);
  setVal('workAuth', profile.professional?.workAuth);
  setVal('noticePeriod', profile.professional?.noticePeriod);
  setVal('expectedSalary', profile.professional?.expectedSalary);
  setVal('workPreference', profile.professional?.workPreference);

  // Skills
  renderSkillTags();

  // Resume
  if (resumeData?.fileName) {
    showResumePreview(resumeData.fileName, resumeData.fileSize);
  }
  setVal('resumeSummary', profile.resume?.summary);

  // AI Settings
  setVal('groqApiKey', profile.groqApiKey);
  updateApiStatus(!!profile.groqApiKey);
  setVal('coverLetterModel', settings.coverLetterModel || 'llama-3.3-70b-versatile');
  setVal('coverLetterLength', settings.coverLetterLength || 'medium');
  setVal('writingTone', settings.writingTone || 'conversational');

  // Preferences
  setVal('followUpDays', settings.followUpDays || 7);
  setChecked('enableNotifications', settings.enableNotifications !== false);
  setChecked('showBubble', settings.showBubble !== false);
  setChecked('highlightFields', settings.highlightFields !== false);
  setChecked('autoAnalyze', settings.autoAnalyze !== false);

  // Sidebar
  const name = [profile.personal?.firstName, profile.personal?.lastName].filter(Boolean).join(' ');
  $('sidebarName').textContent = name || 'Your Name';
}

function setVal(id, value) {
  const el = $(id);
  if (el && value !== undefined && value !== null) el.value = value;
}

function setChecked(id, checked) {
  const el = $(id);
  if (el) el.checked = checked;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      switchSection(section);
    });
  });
}

function switchSection(sectionId) {
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.section === sectionId);
  });
  document.querySelectorAll('.section-view').forEach(s => {
    s.classList.toggle('active', s.id === `section-${sectionId}`);
  });
}

// ─── Skills ───────────────────────────────────────────────────────────────────
function setupSkills() {
  const input = $('skillInput');
  const addBtn = $('btnAddSkill');

  addBtn.addEventListener('click', () => addSkill(input.value.trim()));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(input.value.trim());
    }
  });
}

function addSkill(skill) {
  if (!skill) return;
  skill = skill.replace(/,/g, '').trim();
  if (!skill || skills.includes(skill)) return;
  if (skills.length >= 50) { showToast('Maximum 50 skills allowed', 'error'); return; }
  skills.push(skill);
  renderSkillTags();
  $('skillInput').value = '';
  updateSuggestions();
}

function removeSkill(skill) {
  skills = skills.filter(s => s !== skill);
  renderSkillTags();
  updateSuggestions();
}

function renderSkillTags() {
  const container = $('skillsTags');
  container.innerHTML = skills.map(skill => `
    <span class="skill-tag">
      ${escHtml(skill)}
      <button class="skill-remove" data-skill="${escHtml(skill)}" type="button">×</button>
    </span>
  `).join('');

  container.querySelectorAll('.skill-remove').forEach(btn => {
    btn.addEventListener('click', () => removeSkill(btn.dataset.skill));
  });
}

function renderSkillSuggestions() {
  const container = $('skillSuggestions');
  updateSuggestions();
  container.parentElement.style.display = 'block';
}

function updateSuggestions() {
  const container = $('skillSuggestions');
  const available = SKILL_SUGGESTIONS.filter(s => !skills.includes(s)).slice(0, 20);
  container.innerHTML = available.map(s =>
    `<span class="skill-suggest-tag" data-skill="${escHtml(s)}">${escHtml(s)}</span>`
  ).join('');
  container.querySelectorAll('.skill-suggest-tag').forEach(tag => {
    tag.addEventListener('click', () => addSkill(tag.dataset.skill));
  });
}

// ─── Resume Upload ────────────────────────────────────────────────────────────
function setupResumeUpload() {
  const dropzone = $('resumeDropzone');
  const fileInput = $('resumeFileInput');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) processResumeFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) processResumeFile(file);
  });

  $('btnPreviewResume').addEventListener('click', () => openResumeModal());

  $('btnRemoveResume').addEventListener('click', () => {
    resumeData = null;
    $('resumeDropzone').style.display = 'block';
    $('resumePreview').classList.remove('visible');
    fileInput.value = '';
  });
}

function processResumeFile(file) {
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED = ['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  if (!ALLOWED.includes(file.type) && !file.name.match(/\.(pdf|doc|docx)$/i)) {
    showToast('Only PDF, DOC, and DOCX files are supported', 'error');
    return;
  }
  if (file.size > MAX_SIZE) {
    showToast('File must be smaller than 5MB', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    resumeData = {
      fileName: file.name,
      fileData: base64,
      fileSize: formatFileSize(file.size),
      fileType: file.type,
      uploadedAt: new Date().toISOString()
    };
    showResumePreview(file.name, formatFileSize(file.size));
    showToast(`✓ ${file.name} uploaded successfully`, 'success');
  };
  reader.readAsDataURL(file);
}

function showResumePreview(name, size) {
  $('resumeFilename').textContent = name;
  $('resumeFilesize').textContent = size || '';
  $('resumeDropzone').style.display = 'none';
  $('resumePreview').classList.add('visible');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── API Key ──────────────────────────────────────────────────────────────────
function setupApiKeyToggle() {
  const input = $('groqApiKey');
  const toggle = $('toggleApiKey');

  toggle.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    toggle.textContent = input.type === 'password' ? '👁' : '🙈';
  });

  input.addEventListener('input', () => {
    const hasKey = input.value.trim().startsWith('gsk_') || input.value.trim().length > 20;
    updateApiStatus(hasKey ? null : false); // null = unverified
  });

  $('btnTestApi').addEventListener('click', testApiKey);
}

function updateApiStatus(status) {
  const chip = $('apiStatusChip');
  if (status === true) {
    chip.className = 'api-chip valid';
    chip.textContent = '✓ Connected';
  } else if (status === false) {
    chip.className = 'api-chip invalid';
    chip.textContent = '✕ Not configured';
  } else if (status === null) {
    chip.className = 'api-chip loading';
    chip.textContent = '○ Not verified';
  } else {
    chip.className = 'api-chip loading';
    chip.textContent = 'Not configured';
  }
}

async function testApiKey() {
  const key = $('groqApiKey').value.trim();
  if (!key) { showToast('Enter an API key first', 'error'); return; }

  const btn = $('btnTestApi');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="border-top-color:#9ca3af"></div> Testing...';

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });

    if (resp.ok) {
      updateApiStatus(true);
      showToast('✓ API key is valid!', 'success');
    } else if (resp.status === 401) {
      updateApiStatus(false);
      showToast('Invalid API key', 'error');
    } else {
      showToast(`API returned ${resp.status}. Key may still work.`, 'info');
      updateApiStatus(null);
    }
  } catch (e) {
    showToast('Could not reach Groq API. Check your connection.', 'error');
    updateApiStatus(null);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Key';
  }
}

// ─── Save Buttons ─────────────────────────────────────────────────────────────
function setupSaveButtons() {
  $('savePersonal').addEventListener('click', savePersonal);
  $('saveProfessional').addEventListener('click', saveProfessional);
  $('saveSkills').addEventListener('click', saveSkills);
  $('saveResume').addEventListener('click', saveResume);
  $('saveAI').addEventListener('click', saveAI);
  $('savePreferences').addEventListener('click', savePreferences);
}

async function savePersonal() {
  profile.personal = {
    firstName: $('firstName').value.trim(),
    lastName: $('lastName').value.trim(),
    email: $('email').value.trim(),
    phone: $('phone').value.trim(),
    location: $('location').value.trim(),
    linkedin: $('linkedin').value.trim(),
    github: $('github').value.trim(),
    portfolio: $('portfolio').value.trim()
  };

  await saveProfile();
  showSaveStatus('personal', '✓ Saved');
  showToast('Personal info saved!', 'success');
  updateSidebarProgress();
}

async function saveProfessional() {
  profile.professional = {
    currentTitle: $('currentTitle').value.trim(),
    currentCompany: $('currentCompany').value.trim(),
    experience: $('experience').value,
    workAuth: $('workAuth').value,
    noticePeriod: $('noticePeriod').value,
    expectedSalary: $('expectedSalary').value.trim(),
    workPreference: $('workPreference').value
  };

  await saveProfile();
  showSaveStatus('professional', '✓ Saved');
  showToast('Professional info saved!', 'success');
  updateSidebarProgress();
}

async function saveSkills() {
  profile.skills = [...skills];
  await saveProfile();
  showSaveStatus('skills', `✓ ${skills.length} skills saved`);
  showToast(`${skills.length} skills saved!`, 'success');
  updateSidebarProgress();
}

async function saveResume() {
  if (resumeData) {
    profile.resume = {
      ...resumeData,
      summary: $('resumeSummary').value.trim()
    };
  } else {
    profile.resume = { summary: $('resumeSummary').value.trim() };
  }

  await saveProfile();
  showSaveStatus('resume', '✓ Saved');
  showToast('Resume info saved!', 'success');
  updateSidebarProgress();
}

async function saveAI() {
  const key = $('groqApiKey').value.trim();
  profile.groqApiKey = key;

  settings.coverLetterModel = $('coverLetterModel').value;
  settings.coverLetterLength = $('coverLetterLength').value;
  settings.writingTone = $('writingTone').value;

  await Promise.all([saveProfile(), saveSettings()]);
  showSaveStatus('ai', '✓ Saved');
  showToast('AI settings saved!', 'success');
  if (key) updateApiStatus(true);
  updateSidebarProgress();
}

async function savePreferences() {
  settings.followUpDays = parseInt($('followUpDays').value) || 7;
  settings.enableNotifications = $('enableNotifications').checked;
  settings.showBubble = $('showBubble').checked;
  settings.highlightFields = $('highlightFields').checked;
  settings.autoAnalyze = $('autoAnalyze').checked;

  await saveSettings();
  showSaveStatus('preferences', '✓ Saved');
  showToast('Preferences saved!', 'success');
}

function saveProfile() {
  return new Promise(resolve => {
    chrome.storage.local.set({ profile }, () => {
      if (chrome.runtime.lastError) {
        showToast('Storage error: ' + chrome.runtime.lastError.message, 'error');
      }
      resolve();
    });
  });
}

function saveSettings() {
  return new Promise(resolve => {
    chrome.storage.local.set({ settings }, () => resolve());
  });
}

// ─── Sidebar Progress ─────────────────────────────────────────────────────────
function updateSidebarProgress() {
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
    skills.length > 0 ? 'ok' : null
  ];

  const filled = fields.filter(Boolean).length;
  const pct = Math.round((filled / fields.length) * 100);

  $('sidebarProgress').style.width = `${pct}%`;
  $('sidebarPct').textContent = `${pct}%`;

  const name = [profile.personal?.firstName, profile.personal?.lastName].filter(Boolean).join(' ');
  $('sidebarName').textContent = name || 'Your Name';
}

// ─── Other Buttons ────────────────────────────────────────────────────────────
function setupOtherButtons() {
  $('btnOpenDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  $('btnExportProfile').addEventListener('click', exportData);
  $('btnImportProfile').addEventListener('click', () => $('importFileInput').click());

  $('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const imported = JSON.parse(text);
      if (imported.profile) {
        profile = imported.profile;
        skills = profile.skills || [];
        resumeData = profile.resume || null;
        if (imported.settings) settings = imported.settings;
        await Promise.all([saveProfile(), saveSettings()]);
        populateForm();
        updateSidebarProgress();
        showToast('✓ Data imported successfully!', 'success');
      } else {
        showToast('Invalid import file format', 'error');
      }
    } catch (err) {
      showToast('Could not parse import file', 'error');
    }
    $('importFileInput').value = '';
  });

  $('btnClearApplications').addEventListener('click', () => {
    if (!confirm('Delete all job applications? Profile data will be kept.')) return;
    chrome.storage.local.remove(['applications', 'followUpAlarms'], () => {
      showToast('All applications cleared', 'success');
    });
  });

  $('btnClearAll').addEventListener('click', () => {
    if (!confirm('Delete ALL JobFill data including your profile? This cannot be undone.')) return;
    chrome.storage.local.clear(() => {
      profile = {};
      settings = {};
      skills = [];
      resumeData = null;
      populateForm();
      updateSidebarProgress();
      showToast('All data cleared', 'success');
    });
  });
}

// ─── Save Status ──────────────────────────────────────────────────────────────
function showSaveStatus(section, message) {
  const el = $(`saveStatus-${section}`);
  if (!el) return;
  el.textContent = message;
  el.style.color = message.startsWith('✓') ? '#22c55e' : '#ef4444';
  setTimeout(() => { el.textContent = ''; }, 3000);
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = $('toast-container');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="color:${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};font-weight:bold">${icons[type]}</span>
    <span>${escHtml(message)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

function exportData() {
  chrome.storage.local.get(null, data => {
    // Don't export fileData (too large) unless needed
    const exportObj = { ...data };
    if (exportObj.profile?.resume?.fileData) {
      exportObj.profile = { ...exportObj.profile, resume: { ...exportObj.profile.resume } };
      delete exportObj.profile.resume.fileData;
    }
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobfill-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ─── Resume Preview Modal ─────────────────────────────────────────────────────
function openResumeModal() {
  const data = resumeData || profile?.resume;
  if (!data?.fileData) {
    showToast('No resume uploaded yet', 'error');
    return;
  }

  const modal = $('resumeModal');
  const iframe = $('resumeIframe');
  const fallback = $('resumeModalFallback');
  const filename = data.fileName || 'resume.pdf';
  const isPDF = filename.toLowerCase().endsWith('.pdf') || data.fileType === 'application/pdf';

  $('modalFilename').textContent = filename;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  if (isPDF) {
    // Use the base64 data URL directly in the iframe
    iframe.style.display = 'block';
    fallback.style.display = 'none';
    iframe.src = data.fileData;
  } else {
    // DOC/DOCX — browser can't render these natively, show download option
    iframe.style.display = 'none';
    fallback.style.display = 'flex';
    $('btnFallbackDownload').onclick = () => downloadResume(data);
  }

  // Download button in header
  $('btnModalDownload').onclick = () => downloadResume(data);
}

function closeResumeModal() {
  const modal = $('resumeModal');
  modal.style.display = 'none';
  document.body.style.overflow = '';
  // Clear iframe src to stop rendering and free memory
  $('resumeIframe').src = '';
}

function downloadResume(data) {
  const link = document.createElement('a');
  link.href = data.fileData;
  link.download = data.fileName || 'resume.pdf';
  link.click();
}

function setupResumeModal() {
  // Close on X button
  $('btnModalClose').addEventListener('click', closeResumeModal);

  // Close on backdrop click
  $('resumeModal').addEventListener('click', (e) => {
    if (e.target.id === 'resumeModal') closeResumeModal();
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('resumeModal').style.display !== 'none') {
      closeResumeModal();
    }
  });
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}
