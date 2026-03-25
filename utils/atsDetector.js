// ATS Platform Detector
// Identifies which Applicant Tracking System the current page is using
// and returns platform-specific configuration for form filling strategies

const ATS_PLATFORMS = {
  greenhouse: {
    name: 'Greenhouse',
    urlPatterns: ['greenhouse.io', 'boards.greenhouse', 'grnh.se'],
    selectors: {
      form: '#application_form, .application-form, form[action*="greenhouse"]',
      submitBtn: '#submit_app, input[type="submit"][value*="Submit"]'
    },
    fieldStrategy: 'standard'
  },
  lever: {
    name: 'Lever',
    urlPatterns: ['jobs.lever.co', 'lever.co/apply'],
    selectors: {
      form: '.application-form, form.lever-apply',
      submitBtn: '.template-btn-submit'
    },
    fieldStrategy: 'standard'
  },
  workday: {
    name: 'Workday',
    urlPatterns: ['myworkdayjobs', 'workday.com', 'wd3.myworkday'],
    selectors: {
      form: '[data-automation-id="richTextInput"], .css-1u1uqol',
      submitBtn: '[data-automation-id="bottom-navigation-next-button"]'
    },
    fieldStrategy: 'workday'
  },
  ashby: {
    name: 'Ashby',
    urlPatterns: ['ashbyhq.com', 'jobs.ashbyhq'],
    selectors: {
      form: 'form[id*="application"], ._applicationForm_',
      submitBtn: 'button[type="submit"]'
    },
    fieldStrategy: 'standard'
  },
  linkedin: {
    name: 'LinkedIn',
    urlPatterns: ['linkedin.com/jobs', 'linkedin.com/job'],
    selectors: {
      form: '.jobs-easy-apply-modal, .application-outlet',
      submitBtn: '.jobs-apply-button, button[aria-label*="Submit"]'
    },
    fieldStrategy: 'linkedin'
  },
  smartrecruiters: {
    name: 'SmartRecruiters',
    urlPatterns: ['smartrecruiters.com', 'jobs.smartrecruiters'],
    selectors: {
      form: '.application-form',
      submitBtn: 'button[data-ui="apply-submit"]'
    },
    fieldStrategy: 'standard'
  },
  breezy: {
    name: 'Breezy HR',
    urlPatterns: ['breezy.hr', 'app.breezy'],
    selectors: {
      form: '.position-apply-form',
      submitBtn: 'button[type="submit"]'
    },
    fieldStrategy: 'standard'
  },
  icims: {
    name: 'iCIMS',
    urlPatterns: ['icims.com', 'recruiting.ultipro'],
    selectors: {
      form: '.iCIMS_InfoMsg, #icims_content',
      submitBtn: 'input[value="Submit Application"]'
    },
    fieldStrategy: 'standard'
  }
};

function detectATS() {
  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();

  for (const [platformKey, platform] of Object.entries(ATS_PLATFORMS)) {
    for (const pattern of platform.urlPatterns) {
      if (url.includes(pattern) || hostname.includes(pattern)) {
        return {
          key: platformKey,
          name: platform.name,
          selectors: platform.selectors,
          fieldStrategy: platform.fieldStrategy
        };
      }
    }
  }

  // Try to detect from page content as fallback
  const pageText = document.body?.innerText?.toLowerCase() || '';
  const metaGenerator = document.querySelector('meta[name="generator"]')?.content?.toLowerCase() || '';

  if (metaGenerator.includes('greenhouse')) return { key: 'greenhouse', name: 'Greenhouse', fieldStrategy: 'standard' };
  if (metaGenerator.includes('lever')) return { key: 'lever', name: 'Lever', fieldStrategy: 'standard' };
  if (metaGenerator.includes('workday')) return { key: 'workday', name: 'Workday', fieldStrategy: 'workday' };

  return {
    key: 'custom',
    name: 'Custom',
    selectors: { form: 'form', submitBtn: 'button[type="submit"], input[type="submit"]' },
    fieldStrategy: 'standard'
  };
}

// Expose globally for content.js
window.JobFill = window.JobFill || {};
window.JobFill.detectATS = detectATS;
window.JobFill.ATS_PLATFORMS = ATS_PLATFORMS;
