// JobFill Background Service Worker
// Handles: alarms, notifications, message routing, API calls

'use strict';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const COVER_LETTER_MODEL = 'llama-3.3-70b-versatile';
const FOLLOW_UP_ALARM_PREFIX = 'jobfill-followup-';
const DEFAULT_FOLLOW_UP_DAYS = 7;

// ─── Extension Lifecycle ──────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  }
  // Restore alarms from storage
  restoreFollowUpAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  restoreFollowUpAlarms();
});

// ─── Message Routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'GENERATE_COVER_LETTER':
      handleCoverLetterGeneration(message, sendResponse);
      return true;

    case 'ANALYZE_JOB':
      handleJobAnalysis(message, sendResponse);
      return true;

    case 'SAVE_JOB_APPLICATION':
      saveJobApplication(message.jobData).then(result => sendResponse(result));
      return true;

    case 'GET_APPLICATIONS':
      getApplications(message.filters).then(apps => sendResponse({ success: true, applications: apps }));
      return true;

    case 'UPDATE_APPLICATION':
      updateApplication(message.id, message.updates).then(result => sendResponse(result));
      return true;

    case 'DELETE_APPLICATION':
      deleteApplication(message.id).then(result => sendResponse(result));
      return true;

    case 'SCHEDULE_FOLLOW_UP':
      scheduleFollowUpAlarm(message.jobId, message.companyName, message.jobTitle, message.days)
        .then(result => sendResponse(result));
      return true;

    case 'CANCEL_FOLLOW_UP':
      cancelFollowUpAlarm(message.jobId).then(result => sendResponse(result));
      return true;

    case 'GET_PROFILE':
      chrome.storage.local.get(['profile'], (data) => {
        sendResponse({ success: true, profile: data.profile || {} });
      });
      return true;

    case 'OPEN_DASHBOARD':
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      sendResponse({ success: true });
      return true;

    case 'FILL_ACTIVE_TAB':
      fillActiveTab(message.profile, sendResponse);
      return true;

    case 'GET_PAGE_INFO':
      getActiveTabPageInfo(sendResponse);
      return true;

    case 'BUBBLE_CLICKED':
      // Content script bubble clicked - open popup
      // We can't programmatically open the popup, but we can notify
      break;

    default:
      return false;
  }
});

// ─── Cover Letter Generation ──────────────────────────────────────────────────

async function handleCoverLetterGeneration(message, sendResponse) {
  const { jobDescription, profile, jobMeta } = message;

  if (!profile?.groqApiKey) {
    sendResponse({ success: false, error: 'GROQ_API_KEY_MISSING' });
    return;
  }

  try {
    const coverLetter = await generateCoverLetterAPI(jobDescription, profile, jobMeta);
    sendResponse({ success: true, coverLetter });
  } catch (err) {
    console.error('JobFill: Cover letter generation failed', err);
    sendResponse({ success: false, error: err.message });
  }
}

async function generateCoverLetterAPI(jobDescription, profile, jobMeta) {
  const { firstName, lastName } = profile.personal || {};
  const { currentTitle, currentCompany, experience } = profile.professional || {};
  const skills = (profile.skills || []).join(', ');
  const resumeSummary = profile.resume?.summary || '';
  const { jobTitle = 'this role', company = 'your company' } = jobMeta || {};

  const prompt = `You are a professional cover letter writer. Write a compelling, personalized cover letter.

APPLICANT PROFILE:
- Name: ${firstName || ''} ${lastName || ''}
- Current Role: ${currentTitle || 'Professional'} at ${currentCompany || 'a company'}
- Years of Experience: ${experience || 'several years'}
- Key Skills: ${skills || 'various relevant skills'}
${resumeSummary ? `- Background: ${resumeSummary}` : ''}

JOB: ${jobTitle} at ${company}

JOB DESCRIPTION:
${(jobDescription || '').slice(0, 2000)}

Write EXACTLY 3 paragraphs (max 250 words total):
1. Why excited about THIS specific role at ${company} - reference something specific from the job description
2. Most relevant experience with specific numbers/metrics, connecting skills to job requirements
3. Professional call to action

Rules: No placeholder text, no header/date/signature, no "Dear Hiring Manager", start directly with engaging sentence, professional but conversational tone, output ONLY the 3 paragraphs.`;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${profile.groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: COVER_LETTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
      stream: false
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('GROQ_AUTH_ERROR');
    if (response.status === 429) throw new Error('GROQ_RATE_LIMIT');
    throw new Error(`GROQ_API_ERROR:${response.status}:${errData.error?.message || ''}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ─── Job Analysis ─────────────────────────────────────────────────────────────

async function handleJobAnalysis(message, sendResponse) {
  const { jobDescription, profile } = message;

  if (!profile?.groqApiKey) {
    sendResponse({ success: false, error: 'GROQ_API_KEY_MISSING' });
    return;
  }

  try {
    const analysis = await analyzeJobAPI(jobDescription, profile);
    sendResponse({ success: true, analysis });
  } catch (err) {
    console.error('JobFill: Job analysis failed', err);
    sendResponse({ success: false, error: err.message });
  }
}

async function analyzeJobAPI(jobDescription, profile) {
  const skills = (profile.skills || []).join(', ');
  const { currentTitle, experience } = profile.professional || {};

  const prompt = `Analyze this job fit. Respond with ONLY valid JSON (no markdown):
{"matchScore":<0-100>,"jobTitle":"<title>","company":"<company>","matchedSkills":["..."],"missingSkills":["..."],"highlights":["..."],"redFlags":["..."],"salaryRange":"<range or null>","jobType":"<Full-time|Part-time|Contract|Remote|Hybrid>"}

Candidate: ${currentTitle || 'Professional'}, ${experience || '?'} years experience, skills: ${skills || 'various'}

Job Description:
${(jobDescription || '').slice(0, 3000)}`;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${profile.groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: COVER_LETTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.2,
      stream: false
    })
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('GROQ_AUTH_ERROR');
    if (response.status === 429) throw new Error('GROQ_RATE_LIMIT');
    throw new Error(`GROQ_API_ERROR:${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      matchScore: Math.min(100, Math.max(0, parseInt(parsed.matchScore) || 0)),
      jobTitle: String(parsed.jobTitle || '').slice(0, 100),
      company: String(parsed.company || '').slice(0, 100),
      matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills.slice(0, 10) : [],
      missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills.slice(0, 10) : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 5) : [],
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.slice(0, 5) : [],
      salaryRange: parsed.salaryRange || null,
      jobType: parsed.jobType || 'Full-time'
    };
  } catch (e) {
    return { matchScore: 0, jobTitle: '', company: '', matchedSkills: [], missingSkills: [], highlights: [], redFlags: [], salaryRange: null, jobType: 'Full-time' };
  }
}

// ─── Job Application Storage ──────────────────────────────────────────────────

async function saveJobApplication(jobData) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['applications'], (data) => {
      const apps = data.applications || [];
      const existing = apps.findIndex(a => a.url === jobData.url);

      if (existing !== -1) {
        apps[existing] = { ...apps[existing], ...jobData, updatedAt: new Date().toISOString() };
        chrome.storage.local.set({ applications: apps }, () => {
          resolve({ success: true, id: apps[existing].id, updated: true });
        });
      } else {
        const newApp = {
          id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...jobData,
          status: jobData.status || 'applied',
          appliedAt: jobData.appliedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: jobData.notes || '',
          followUpDate: jobData.followUpDate || null
        };
        apps.unshift(newApp);
        chrome.storage.local.set({ applications: apps }, () => {
          resolve({ success: true, id: newApp.id, updated: false });
          // Schedule follow-up reminder
          if (newApp.id && newApp.company && newApp.jobTitle) {
            scheduleFollowUpAlarm(newApp.id, newApp.company, newApp.jobTitle, DEFAULT_FOLLOW_UP_DAYS);
          }
        });
      }
    });
  });
}

async function getApplications(filters = {}) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['applications'], (data) => {
      let apps = data.applications || [];

      if (filters.status && filters.status !== 'all') {
        apps = apps.filter(a => a.status === filters.status);
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        apps = apps.filter(a =>
          a.company?.toLowerCase().includes(q) ||
          a.jobTitle?.toLowerCase().includes(q)
        );
      }
      if (filters.sortBy) {
        apps = sortApplications(apps, filters.sortBy);
      }

      resolve(apps);
    });
  });
}

function sortApplications(apps, sortBy) {
  return [...apps].sort((a, b) => {
    switch (sortBy) {
      case 'date': return new Date(b.appliedAt) - new Date(a.appliedAt);
      case 'company': return (a.company || '').localeCompare(b.company || '');
      case 'status': return (a.status || '').localeCompare(b.status || '');
      case 'matchScore': return (b.matchScore || 0) - (a.matchScore || 0);
      default: return new Date(b.appliedAt) - new Date(a.appliedAt);
    }
  });
}

async function updateApplication(id, updates) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['applications'], (data) => {
      const apps = data.applications || [];
      const idx = apps.findIndex(a => a.id === id);
      if (idx === -1) {
        resolve({ success: false, error: 'Application not found' });
        return;
      }
      apps[idx] = { ...apps[idx], ...updates, updatedAt: new Date().toISOString() };
      chrome.storage.local.set({ applications: apps }, () => {
        resolve({ success: true });
        // If status changed to non-applied, cancel follow-up alarm
        if (updates.status && updates.status !== 'applied') {
          cancelFollowUpAlarm(id);
        }
      });
    });
  });
}

async function deleteApplication(id) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['applications'], (data) => {
      const apps = (data.applications || []).filter(a => a.id !== id);
      chrome.storage.local.set({ applications: apps }, () => {
        cancelFollowUpAlarm(id);
        resolve({ success: true });
      });
    });
  });
}

// ─── Follow-up Alarms ─────────────────────────────────────────────────────────

async function scheduleFollowUpAlarm(jobId, companyName, jobTitle, days = DEFAULT_FOLLOW_UP_DAYS) {
  const alarmName = `${FOLLOW_UP_ALARM_PREFIX}${jobId}`;
  const delayInMinutes = days * 24 * 60;

  return new Promise((resolve) => {
    chrome.alarms.create(alarmName, { delayInMinutes });

    // Store alarm metadata
    chrome.storage.local.get(['followUpAlarms'], (data) => {
      const alarms = data.followUpAlarms || {};
      alarms[alarmName] = { jobId, companyName, jobTitle, scheduledAt: new Date().toISOString(), days };
      chrome.storage.local.set({ followUpAlarms: alarms }, () => {
        resolve({ success: true, alarmName });
      });
    });
  });
}

async function cancelFollowUpAlarm(jobId) {
  const alarmName = `${FOLLOW_UP_ALARM_PREFIX}${jobId}`;
  return new Promise((resolve) => {
    chrome.alarms.clear(alarmName, () => {
      chrome.storage.local.get(['followUpAlarms'], (data) => {
        const alarms = data.followUpAlarms || {};
        delete alarms[alarmName];
        chrome.storage.local.set({ followUpAlarms: alarms }, () => {
          resolve({ success: true });
        });
      });
    });
  });
}

async function restoreFollowUpAlarms() {
  chrome.storage.local.get(['followUpAlarms', 'settings'], (data) => {
    const alarms = data.followUpAlarms || {};
    const followUpDays = data.settings?.followUpDays || DEFAULT_FOLLOW_UP_DAYS;

    Object.entries(alarms).forEach(([alarmName, alarmData]) => {
      chrome.alarms.get(alarmName, (existingAlarm) => {
        if (!existingAlarm) {
          // Recalculate remaining delay
          const scheduledAt = new Date(alarmData.scheduledAt);
          const triggerAt = new Date(scheduledAt.getTime() + alarmData.days * 24 * 60 * 60 * 1000);
          const now = new Date();
          const remainingMs = triggerAt - now;

          if (remainingMs > 0) {
            chrome.alarms.create(alarmName, { delayInMinutes: remainingMs / 60000 });
          } else {
            // Past due - fire immediately (with 1 minute delay)
            chrome.alarms.create(alarmName, { delayInMinutes: 1 });
          }
        }
      });
    });
  });
}

// ─── Alarm Handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(FOLLOW_UP_ALARM_PREFIX)) return;

  chrome.storage.local.get(['followUpAlarms', 'applications'], (data) => {
    const alarms = data.followUpAlarms || {};
    const alarmData = alarms[alarm.name];
    if (!alarmData) return;

    const apps = data.applications || [];
    const job = apps.find(a => a.id === alarmData.jobId);
    if (!job || job.status !== 'applied') {
      // Job status changed, no need for reminder
      delete alarms[alarm.name];
      chrome.storage.local.set({ followUpAlarms: alarms });
      return;
    }

    // Show notification
    chrome.notifications.create(`followup-${alarmData.jobId}`, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'JobFill Follow-up Reminder',
      message: `Follow up with ${alarmData.companyName} for ${alarmData.jobTitle}?`,
      buttons: [{ title: 'Open Job Page' }, { title: 'Dismiss' }],
      priority: 1
    });

    // Clean up the alarm metadata
    delete alarms[alarm.name];
    chrome.storage.local.set({ followUpAlarms: alarms });
  });
});

// ─── Notification Click Handler ───────────────────────────────────────────────

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (!notificationId.startsWith('followup-')) return;

  const jobId = notificationId.replace('followup-', '');
  chrome.notifications.clear(notificationId);

  if (buttonIndex === 0) {
    // Open job page
    chrome.storage.local.get(['applications'], (data) => {
      const apps = data.applications || [];
      const job = apps.find(a => a.id === jobId);
      if (job?.url) {
        chrome.tabs.create({ url: job.url });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      }
    });
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith('followup-')) return;
  const jobId = notificationId.replace('followup-', '');
  chrome.notifications.clear(notificationId);
  chrome.storage.local.get(['applications'], (data) => {
    const apps = data.applications || [];
    const job = apps.find(a => a.id === jobId);
    if (job?.url) {
      chrome.tabs.create({ url: job.url });
    }
  });
});

// ─── Fill Active Tab ──────────────────────────────────────────────────────────

function fillActiveTab(profile, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      sendResponse({ success: false, error: 'No active tab' });
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { action: 'FILL_FORM', profile }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not loaded, inject it
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['utils/atsDetector.js', 'utils/fieldMapper.js', 'utils/formDetector.js', 'content.js']
        }).then(() => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'FILL_FORM', profile }, (r) => {
              sendResponse(r || { success: false, error: 'Could not fill form' });
            });
          }, 500);
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
      } else {
        sendResponse(response || { success: true });
      }
    });
  });
}

function getActiveTabPageInfo(sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      sendResponse({ success: false, error: 'No active tab' });
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_JOB_DESCRIPTION' }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: 'Content script not available', url: tabs[0].url, title: tabs[0].title });
      } else {
        sendResponse({ success: true, ...(response || {}), url: tabs[0].url, title: tabs[0].title });
      }
    });
  });
}
