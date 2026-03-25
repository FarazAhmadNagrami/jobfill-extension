// JobFill Content Script
// Injected into all pages - handles form detection, filling, and job description extraction

(function () {
  'use strict';

  // Prevent double injection
  if (window.__JOBFILL_INJECTED__) return;
  window.__JOBFILL_INJECTED__ = true;

  const JF = window.JobFill || {};

  let detectedFieldCount = 0;
  let floatingBubble = null;
  let bubbleTimeout = null;
  let isJobPage = false;

  // ─── Initialization ────────────────────────────────────────────────────────

  function init() {
    // Detect ATS platform
    const platform = JF.detectATS ? JF.detectATS() : { key: 'custom', name: 'Custom' };

    // Check if this looks like a job application page
    isJobPage = JF.isJobApplicationPage ? JF.isJobApplicationPage() : false;
    const fields = JF.getFillableFields ? JF.getFillableFields() : [];
    detectedFieldCount = fields.length;

    if (isJobPage && detectedFieldCount > 0) {
      showFloatingBubble(detectedFieldCount, platform.name);
      // Notify popup if it's open
      safeNotifyPopup({ action: 'FORM_DETECTED', fieldCount: detectedFieldCount, platform: platform.name });
    }

    // Listen for DOM changes (SPA navigation)
    observePageChanges();
  }

  // ─── Form Filling ────────────────────────────────────────────────────────────

  async function fillForm(profile) {
    const fields = JF.getFillableFields ? JF.getFillableFields() : [];
    let filledCount = 0;
    const results = [];

    for (const field of fields) {
      try {
        const fieldKey = JF.matchFieldToProfile ? JF.matchFieldToProfile(field) : null;
        if (!fieldKey) continue;

        // Pass the element so phone fields can detect nearby country-code selectors
        const value = JF.getValueForField ? JF.getValueForField(fieldKey, profile, field) : null;
        if (!value) continue;

        const filled = await fillField(field, value);
        if (filled) {
          filledCount++;
          results.push({ field: field.name || field.id || field.placeholder, key: fieldKey, value });
          highlightField(field);
        }
      } catch (err) {
        console.warn('JobFill: Error filling field', field, err);
      }
    }

    // Handle file upload for resume
    if (profile.resume?.fileData && profile.resume?.fileName) {
      const fileFields = JF.getFileUploadFields ? JF.getFileUploadFields() : [];
      for (const fileField of fileFields) {
        await handleFileUpload(fileField, profile.resume);
      }
    }

    return { filledCount, totalFields: fields.length, results };
  }

  async function fillField(element, value) {
    const tag = element.tagName.toLowerCase();

    if (tag === 'select') {
      const filled = JF.fillSelectField ? JF.fillSelectField(element, value) : false;
      if (filled) fireEvents(element);
      return filled;
    }

    if (tag === 'textarea' || tag === 'input') {
      const currentVal = element.value;
      if (currentVal && currentVal !== '') return false; // Don't overwrite existing values

      // Use native input value setter to handle React controlled components
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        tag === 'textarea'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype,
        'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
      } else {
        element.value = value;
      }

      fireEvents(element);
      return true;
    }

    // Handle contenteditable divs
    if (element.contentEditable === 'true') {
      element.textContent = value;
      fireEvents(element);
      return true;
    }

    return false;
  }

  function fireEvents(element) {
    const events = ['input', 'change', 'blur', 'keyup'];
    events.forEach(eventType => {
      element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });

    // React synthetic events
    element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
  }

  function highlightField(element) {
    const originalBg = element.style.backgroundColor;
    const originalBorder = element.style.border;
    const originalTransition = element.style.transition;

    element.style.transition = 'background-color 0.3s ease, border 0.3s ease';
    element.style.backgroundColor = 'rgba(34, 197, 94, 0.15)';
    element.style.border = '2px solid #22c55e';

    setTimeout(() => {
      element.style.backgroundColor = originalBg;
      element.style.border = originalBorder;
      element.style.transition = originalTransition;
    }, 2000);
  }

  // ─── File Upload ─────────────────────────────────────────────────────────────

  async function handleFileUpload(fileInput, resumeData) {
    try {
      // Check if this is a resume/CV file input
      const name = (fileInput.name + fileInput.id + fileInput.getAttribute('aria-label') + '').toLowerCase();
      if (!name.includes('resume') && !name.includes('cv') && !name.includes('document') && !name.includes('file')) {
        return false;
      }

      const base64 = resumeData.fileData;
      const fileName = resumeData.fileName || 'resume.pdf';

      // Convert base64 to File object
      const byteString = atob(base64.split(',')[1] || base64);
      const mimeType = base64.match(/data:([^;]+)/)?.[1] || 'application/pdf';
      const arrayBuffer = new ArrayBuffer(byteString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([arrayBuffer], { type: mimeType });
      const file = new File([blob], fileName, { type: mimeType });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fireEvents(fileInput);
      return true;
    } catch (err) {
      console.warn('JobFill: Could not handle file upload', err);
      return false;
    }
  }

  // ─── Floating Bubble UI ──────────────────────────────────────────────────────

  function createBubbleStyles() {
    if (document.getElementById('jobfill-bubble-styles')) return;
    const style = document.createElement('style');
    style.id = 'jobfill-bubble-styles';
    style.textContent = `
      #jobfill-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
        border: 1px solid #3b82f6;
        border-radius: 12px;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3), 0 2px 8px rgba(0,0,0,0.5);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        color: #fff;
        max-width: 280px;
        animation: jobfill-slideIn 0.3s ease;
        user-select: none;
        transition: all 0.2s ease;
      }
      #jobfill-bubble:hover {
        border-color: #60a5fa;
        box-shadow: 0 8px 32px rgba(59, 130, 246, 0.5), 0 2px 8px rgba(0,0,0,0.5);
        transform: translateY(-2px);
      }
      #jobfill-bubble-icon {
        width: 28px;
        height: 28px;
        background: #3b82f6;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 14px;
      }
      #jobfill-bubble-content {
        flex: 1;
        min-width: 0;
      }
      #jobfill-bubble-title {
        font-weight: 600;
        color: #fff;
        margin-bottom: 2px;
        font-size: 13px;
      }
      #jobfill-bubble-subtitle {
        color: #9ca3af;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #jobfill-bubble-close {
        color: #6b7280;
        font-size: 16px;
        line-height: 1;
        padding: 2px;
        cursor: pointer;
        flex-shrink: 0;
        transition: color 0.2s ease;
      }
      #jobfill-bubble-close:hover { color: #9ca3af; }
      @keyframes jobfill-slideIn {
        from { opacity: 0; transform: translateY(20px) scale(0.9); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      #jobfill-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: #1a1a1a;
        border: 1px solid #22c55e;
        border-radius: 8px;
        padding: 10px 16px;
        color: #fff;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: jobfill-slideIn 0.3s ease;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      }
    `;
    document.head.appendChild(style);
  }

  function showFloatingBubble(fieldCount, platformName) {
    if (floatingBubble) return;
    createBubbleStyles();

    floatingBubble = document.createElement('div');
    floatingBubble.id = 'jobfill-bubble';
    floatingBubble.innerHTML = `
      <div id="jobfill-bubble-icon">⚡</div>
      <div id="jobfill-bubble-content">
        <div id="jobfill-bubble-title">JobFill detected a form!</div>
        <div id="jobfill-bubble-subtitle">${fieldCount} fields on ${platformName || 'this page'} · Click to autofill</div>
      </div>
      <div id="jobfill-bubble-close">×</div>
    `;

    floatingBubble.addEventListener('click', (e) => {
      if (e.target.id === 'jobfill-bubble-close') {
        dismissBubble();
        return;
      }
      // Trigger fill via popup or direct
      chrome.runtime.sendMessage({ action: 'BUBBLE_CLICKED' });
      dismissBubble();
    });

    document.body.appendChild(floatingBubble);

    // Auto-dismiss after 10 seconds
    bubbleTimeout = setTimeout(dismissBubble, 10000);
  }

  function dismissBubble() {
    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    if (floatingBubble) {
      floatingBubble.style.animation = 'none';
      floatingBubble.style.opacity = '0';
      floatingBubble.style.transform = 'translateY(20px) scale(0.9)';
      floatingBubble.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        floatingBubble?.remove();
        floatingBubble = null;
      }, 300);
    }
  }

  function showToast(message, type = 'success') {
    createBubbleStyles();
    const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6' };
    const icons = { success: '✓', error: '✕', info: 'ℹ' };

    const toast = document.createElement('div');
    toast.id = 'jobfill-toast';
    toast.style.borderColor = colors[type] || colors.info;
    toast.innerHTML = `
      <span style="color:${colors[type] || colors.info};font-weight:bold">${icons[type] || icons.info}</span>
      <span>${message}</span>
    `;
    // Remove existing toast
    document.getElementById('jobfill-toast')?.remove();
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // ─── SPA Navigation Observer ─────────────────────────────────────────────────

  function observePageChanges() {
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Re-initialize on navigation
        setTimeout(() => {
          floatingBubble?.remove();
          floatingBubble = null;
          window.__JOBFILL_INJECTED__ = false;
          init();
        }, 1500);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true });
  }

  // ─── Safe Popup Notification ─────────────────────────────────────────────────

  function safeNotifyPopup(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch (e) {
      // Popup not open, ignore
    }
  }

  // ─── Message Listener ────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'FILL_FORM': {
        const profile = message.profile;
        if (!profile) {
          sendResponse({ success: false, error: 'No profile provided' });
          return true;
        }
        fillForm(profile).then(result => {
          sendResponse({ success: true, ...result });
          if (result.filledCount > 0) {
            showToast(`Filled ${result.filledCount} fields successfully!`, 'success');
          } else {
            showToast('No matching fields found on this page.', 'info');
          }
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
          showToast('Error filling form. Check the console.', 'error');
        });
        return true; // Keep message channel open
      }

      case 'GET_JOB_DESCRIPTION': {
        const jobDesc = JF.getJobDescription ? JF.getJobDescription() : '';
        const jobMeta = JF.extractJobMetadata ? JF.extractJobMetadata() : {};
        const platform = JF.detectATS ? JF.detectATS() : { key: 'custom', name: 'Custom' };
        const fields = JF.getFillableFields ? JF.getFillableFields() : [];
        sendResponse({
          jobDescription: jobDesc,
          jobMeta,
          platform,
          fieldCount: fields.length,
          isJobPage: JF.isJobApplicationPage ? JF.isJobApplicationPage() : false
        });
        return true;
      }

      case 'CHECK_FORM': {
        const fields = JF.getFillableFields ? JF.getFillableFields() : [];
        const platform = JF.detectATS ? JF.detectATS() : { key: 'custom', name: 'Custom' };
        sendResponse({
          fieldCount: fields.length,
          isJobPage: JF.isJobApplicationPage ? JF.isJobApplicationPage() : fields.length > 1,
          platform
        });
        return true;
      }

      case 'SHOW_TOAST': {
        showToast(message.text, message.type || 'info');
        sendResponse({ success: true });
        return true;
      }

      default:
        return false;
    }
  });

  // ─── Start ────────────────────────────────────────────────────────────────────

  // Wait a bit for dynamic content to load
  if (document.readyState === 'complete') {
    setTimeout(init, 500);
  } else {
    window.addEventListener('load', () => setTimeout(init, 500));
  }

})();
