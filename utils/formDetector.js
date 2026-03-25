// Form Detector
// Scans the page for fillable form fields and detects job application forms

const IGNORED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'color', 'range'
]);

const JOB_PAGE_INDICATORS = [
  'apply', 'application', 'job', 'career', 'position', 'role', 'opening',
  'candidate', 'resume', 'cv', 'cover letter', 'hiring'
];

function isVisible(element) {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isIgnoredInput(element) {
  if (element.tagName === 'INPUT') {
    return IGNORED_INPUT_TYPES.has(element.type?.toLowerCase());
  }
  return false;
}

function getFillableFields() {
  const selectors = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"])',
    'textarea',
    'select'
  ];

  const elements = document.querySelectorAll(selectors.join(', '));
  return Array.from(elements).filter(el => !isIgnoredInput(el) && isVisible(el));
}

function getFileUploadFields() {
  return Array.from(document.querySelectorAll('input[type="file"]')).filter(isVisible);
}

function isJobApplicationPage() {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();
  const metaDesc = document.querySelector('meta[name="description"]')?.content?.toLowerCase() || '';
  const h1Text = document.querySelector('h1')?.textContent?.toLowerCase() || '';
  const bodyText = document.body?.innerText?.slice(0, 2000)?.toLowerCase() || '';

  const textToCheck = [url, title, metaDesc, h1Text, bodyText].join(' ');

  const matchCount = JOB_PAGE_INDICATORS.filter(indicator => textToCheck.includes(indicator)).length;

  // Also check if there's a form with reasonable number of fields
  const fillableFields = getFillableFields();
  const hasForm = fillableFields.length >= 2;

  return (matchCount >= 2 && hasForm) || matchCount >= 4;
}

function getJobDescription() {
  // Common selectors for job descriptions across ATS platforms
  const descSelectors = [
    // Greenhouse
    '#content .job-post-content',
    '.job-post-content',
    '#job-description',

    // Lever
    '.posting-content',
    '.posting-description',
    '[data-qa="job-description"]',

    // Workday
    '[data-automation-id="job-posting-title"]',
    '.job-description',
    '#job-description-container',

    // Ashby
    '._jobDescription_',
    '.job-description',

    // LinkedIn
    '.jobs-description__content',
    '.jobs-description-content__text',

    // SmartRecruiters
    '.job-sections',
    '.job-description',

    // Generic
    '#job-description',
    '.job-description',
    '[class*="job-description"]',
    '[id*="job-description"]',
    '[class*="jobDescription"]',
    '[id*="jobDescription"]',
    '[class*="job_description"]',
    'article.job',
    '.posting-requirements',
    '.job-details',
    '[class*="job-detail"]',
    '[class*="jobDetail"]',
    'main section',
    '[role="main"]',
  ];

  for (const selector of descSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el && el.innerText.length > 100) {
        return el.innerText.trim().slice(0, 5000);
      }
    } catch (e) {
      continue;
    }
  }

  // Fallback: find the largest text block on the page
  const candidates = Array.from(document.querySelectorAll('div, section, article, main'))
    .filter(el => {
      const text = el.innerText || '';
      return text.length > 200 && text.length < 15000;
    })
    .sort((a, b) => (b.innerText?.length || 0) - (a.innerText?.length || 0));

  if (candidates.length > 0) {
    return candidates[0].innerText.trim().slice(0, 5000);
  }

  return document.body?.innerText?.slice(0, 3000) || '';
}

function extractJobMetadata() {
  const url = window.location.href;
  const title = document.title;

  // Try to extract company name
  let company = '';
  const companySelectors = [
    '[class*="company-name"]',
    '[class*="companyName"]',
    '[class*="employer"]',
    '.company',
    '[itemprop="hiringOrganization"]',
    '[data-qa="company-name"]'
  ];
  for (const sel of companySelectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) {
      company = el.textContent.trim();
      break;
    }
  }

  // Try to extract job title
  let jobTitle = '';
  const titleSelectors = [
    'h1[class*="job"]',
    'h1[class*="position"]',
    'h1[class*="title"]',
    '[data-qa="job-title"]',
    '[class*="job-title"]',
    '[class*="jobTitle"]',
    'h1'
  ];
  for (const sel of titleSelectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) {
      jobTitle = el.textContent.trim();
      break;
    }
  }

  // Fallback: parse from page title
  if (!jobTitle || !company) {
    const parts = title.split(/[-–|@,]/);
    if (parts.length >= 2) {
      if (!jobTitle) jobTitle = parts[0].trim();
      if (!company) company = parts[parts.length - 1].trim();
    }
  }

  return { jobTitle, company, url };
}

// Expose globally
window.JobFill = window.JobFill || {};
window.JobFill.getFillableFields = getFillableFields;
window.JobFill.getFileUploadFields = getFileUploadFields;
window.JobFill.isJobApplicationPage = isJobApplicationPage;
window.JobFill.getJobDescription = getJobDescription;
window.JobFill.extractJobMetadata = extractJobMetadata;
