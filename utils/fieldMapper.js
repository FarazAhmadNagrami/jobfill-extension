// Field Mapper
// Maps detected form fields to user profile data using pattern matching

const FIELD_PATTERNS = {
  firstName: {
    patterns: ['first_name', 'firstname', 'fname', 'first-name', 'first name', 'given_name', 'givenname', 'given-name'],
    autocomplete: ['given-name'],
    type: 'text'
  },
  lastName: {
    patterns: ['last_name', 'lastname', 'lname', 'last-name', 'last name', 'surname', 'family_name', 'familyname'],
    autocomplete: ['family-name'],
    type: 'text'
  },
  fullName: {
    patterns: ['full_name', 'fullname', 'full-name', 'full name', 'your_name', 'yourname', 'name'],
    autocomplete: ['name'],
    type: 'text'
  },
  email: {
    patterns: ['email', 'e-mail', 'mail', 'email_address', 'emailaddress', 'your_email'],
    autocomplete: ['email'],
    type: 'email'
  },
  phone: {
    patterns: ['phone', 'mobile', 'tel', 'contact', 'phone_number', 'phonenumber', 'telephone', 'cell', 'cellphone', 'mobile_number'],
    autocomplete: ['tel'],
    type: 'tel'
  },
  linkedin: {
    patterns: ['linkedin', 'linked_in', 'linkedinurl', 'linkedin_url', 'linkedinprofile', 'linkedin profile', 'linkedin_profile'],
    autocomplete: [],
    type: 'url'
  },
  github: {
    patterns: ['github', 'git_hub', 'githuburl', 'github_url', 'githubprofile', 'github profile', 'github_profile'],
    autocomplete: [],
    type: 'url'
  },
  portfolio: {
    patterns: ['portfolio', 'website', 'personal_site', 'personalwebsite', 'personal website', 'personalsite', 'portfoliourl', 'portfolio_url', 'website_url'],
    autocomplete: ['url'],
    type: 'url'
  },
  location: {
    patterns: ['location', 'city', 'address', 'current_location', 'currentlocation', 'current location', 'city_state', 'citystate'],
    autocomplete: ['address-level2', 'locality'],
    type: 'text'
  },
  country: {
    patterns: ['country', 'country_code', 'countrycode'],
    autocomplete: ['country', 'country-name'],
    type: 'text'
  },
  currentCompany: {
    patterns: ['current_company', 'currentcompany', 'employer', 'company', 'current_employer', 'currentemployer', 'organization', 'organisation'],
    autocomplete: ['organization'],
    type: 'text'
  },
  currentTitle: {
    patterns: ['title', 'current_title', 'currenttitle', 'job_title', 'jobtitle', 'position', 'current_position', 'currentposition', 'role'],
    autocomplete: ['organization-title'],
    type: 'text'
  },
  experience: {
    patterns: ['experience', 'years_of_experience', 'yearsofexperience', 'yoe', 'years_experience', 'yearsexperience', 'work_experience'],
    autocomplete: [],
    type: 'text'
  },
  noticePeriod: {
    patterns: ['notice_period', 'noticeperiod', 'notice period', 'availability', 'available_from', 'start_date', 'when_available'],
    autocomplete: [],
    type: 'text'
  },
  expectedSalary: {
    patterns: ['salary', 'expected_salary', 'expectedsalary', 'compensation', 'desired_salary', 'desiredsalary', 'salary_expectation', 'pay_expectation'],
    autocomplete: [],
    type: 'text'
  },
  workAuth: {
    patterns: ['work_authorization', 'workauthorization', 'visa', 'work_auth', 'workauth', 'authorized', 'authorization', 'sponsorship', 'visa_required', 'work_permit'],
    autocomplete: [],
    type: 'select'
  }
};

// Work authorization answer mapping
const WORK_AUTH_VALUES = {
  yes: ['yes', 'authorized', 'citizen', 'no sponsorship', 'no, i do not', 'no visa'],
  no: ['no', 'need sponsorship', 'visa required', 'h1b', 'h-1b', 'opt', 'cpt']
};

function normalizeStr(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[-_\s]/g, '');
}

function getAssociatedLabel(element) {
  // Method 1: for attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return label.textContent.trim();
  }
  // Method 2: wrapping label
  const parentLabel = element.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();
  // Method 3: preceding sibling label
  let prev = element.previousElementSibling;
  while (prev) {
    if (prev.tagName === 'LABEL') return prev.textContent.trim();
    if (prev.tagName === 'INPUT' || prev.tagName === 'SELECT' || prev.tagName === 'TEXTAREA') break;
    prev = prev.previousElementSibling;
  }
  // Method 4: aria-labelledby
  const labelledById = element.getAttribute('aria-labelledby');
  if (labelledById) {
    const labelEl = document.getElementById(labelledById);
    if (labelEl) return labelEl.textContent.trim();
  }
  return '';
}

function matchFieldToProfile(element) {
  const name = normalizeStr(element.name);
  const id = normalizeStr(element.id);
  const placeholder = normalizeStr(element.placeholder);
  const ariaLabel = normalizeStr(element.getAttribute('aria-label'));
  const dataField = normalizeStr(element.getAttribute('data-field'));
  const autocomplete = element.getAttribute('autocomplete') || '';
  const labelText = normalizeStr(getAssociatedLabel(element));

  const searchAttrs = [name, id, placeholder, ariaLabel, dataField, labelText].filter(Boolean);

  for (const [fieldKey, config] of Object.entries(FIELD_PATTERNS)) {
    // Check autocomplete attribute first (most reliable)
    if (config.autocomplete.includes(autocomplete)) {
      return fieldKey;
    }

    // Check patterns against all searchable attributes
    for (const pattern of config.patterns) {
      const normalizedPattern = normalizeStr(pattern);
      if (searchAttrs.some(attr => attr.includes(normalizedPattern))) {
        return fieldKey;
      }
    }
  }

  return null;
}

function getValueForField(fieldKey, profile, element) {
  const rawPhone = profile.personal?.phone || '';
  const valueMap = {
    firstName: profile.personal?.firstName || '',
    lastName: profile.personal?.lastName || '',
    fullName: `${profile.personal?.firstName || ''} ${profile.personal?.lastName || ''}`.trim(),
    email: profile.personal?.email || '',
    // If a country-code picker is present nearby, fill only the local number
    phone: element ? getPhoneValue(element, rawPhone) : rawPhone,
    location: profile.personal?.location || '',
    linkedin: profile.personal?.linkedin || '',
    github: profile.personal?.github || '',
    portfolio: profile.personal?.portfolio || '',
    currentTitle: profile.professional?.currentTitle || '',
    currentCompany: profile.professional?.currentCompany || '',
    experience: profile.professional?.experience || '',
    noticePeriod: profile.professional?.noticePeriod || '',
    expectedSalary: profile.professional?.expectedSalary || '',
    workAuth: profile.professional?.workAuth || '',
    country: profile.personal?.location?.split(',').pop()?.trim() || ''
  };
  return valueMap[fieldKey] || null;
}

// Country dial codes map (ISO → +XX)
const COUNTRY_DIAL_CODES = {
  '91': 'IN', '1': 'US', '44': 'GB', '49': 'DE', '33': 'FR',
  '61': 'AU', '81': 'JP', '86': 'CN', '82': 'KR', '65': 'SG',
  '971': 'AE', '972': 'IL', '47': 'NO', '46': 'SE', '45': 'DK',
  '31': 'NL', '39': 'IT', '34': 'ES', '55': 'BR', '52': 'MX',
  '7': 'RU', '27': 'ZA', '64': 'NZ', '41': 'CH', '43': 'AT',
  '32': 'BE', '351': 'PT', '353': 'IE', '48': 'PL', '380': 'UA',
  '90': 'TR', '66': 'TH', '60': 'MY', '62': 'ID', '63': 'PH',
  '84': 'VN', '880': 'BD', '92': 'PK', '94': 'LK', '977': 'NP',
  '20': 'EG', '234': 'NG', '254': 'KE', '233': 'GH', '212': 'MA'
};

// Detects if element has a country-code picker nearby (intl-tel-input, custom dropdowns, etc.)
function hasNearbyCountryCodeSelector(phoneEl) {
  // Check siblings and parent for country code selectors
  const parent = phoneEl.parentElement?.parentElement || phoneEl.parentElement;
  if (!parent) return false;

  const html = parent.innerHTML.toLowerCase();

  // intl-tel-input library (very common on job forms)
  if (phoneEl.classList.contains('iti__tel-input') ||
      phoneEl.closest('.iti') ||
      phoneEl.closest('.intl-tel-input')) {
    return true;
  }

  // Flag emoji or country flag image nearby
  if (parent.querySelector('[class*="flag"]') ||
      parent.querySelector('[class*="country"]') ||
      parent.querySelector('[class*="dial-code"]') ||
      parent.querySelector('[class*="phone-code"]') ||
      parent.querySelector('[class*="country-code"]')) {
    return true;
  }

  // Select with dial codes nearby
  const selects = parent.querySelectorAll('select');
  for (const sel of selects) {
    if (sel === phoneEl) continue;
    const opts = Array.from(sel.options).slice(0, 5).map(o => o.text + o.value).join('');
    if (/\+\d{1,3}/.test(opts) || /dial|country|code/i.test(sel.name + sel.id + sel.className)) {
      return true;
    }
  }

  // Text showing +XX or flag + code in parent container
  if (/\+\d{1,3}/.test(parent.innerText?.slice(0, 200) || '')) {
    // Make sure it's not inside the phone input's own value
    return true;
  }

  return false;
}

// Extracts just the local number by stripping country code prefix
function getLocalPhoneNumber(fullPhone) {
  if (!fullPhone) return fullPhone;
  const cleaned = fullPhone.replace(/[\s\-().]/g, '');

  // Starts with + (e.g. +91786..., +1800...)
  if (cleaned.startsWith('+')) {
    // Try to match known dial codes (longest first to avoid +1 matching +91)
    const digits = cleaned.slice(1);
    const sortedCodes = Object.keys(COUNTRY_DIAL_CODES).sort((a, b) => b.length - a.length);
    for (const code of sortedCodes) {
      if (digits.startsWith(code)) {
        const local = digits.slice(code.length);
        // Local number should be at least 7 digits
        if (local.length >= 7) return local;
      }
    }
    // Fallback: strip first 1-3 digits as country code
    if (digits.length > 10) return digits.slice(digits.length - 10);
    return digits;
  }

  // Starts with 00 (European format: 0091...)
  if (cleaned.startsWith('00')) {
    const digits = cleaned.slice(2);
    const sortedCodes = Object.keys(COUNTRY_DIAL_CODES).sort((a, b) => b.length - a.length);
    for (const code of sortedCodes) {
      if (digits.startsWith(code)) {
        const local = digits.slice(code.length);
        if (local.length >= 7) return local;
      }
    }
  }

  // Already a local number (no country code)
  return fullPhone;
}

// Returns the right phone value to fill based on whether a country code selector is nearby
function getPhoneValue(phoneEl, fullPhone) {
  if (!fullPhone) return fullPhone;
  if (hasNearbyCountryCodeSelector(phoneEl)) {
    return getLocalPhoneNumber(fullPhone);
  }
  return fullPhone;
}

function fillSelectField(element, value) {
  if (!value) return false;
  const valueLower = value.toLowerCase();
  const options = Array.from(element.options);

  // Try exact match first
  const exactMatch = options.find(opt =>
    opt.value.toLowerCase() === valueLower ||
    opt.text.toLowerCase() === valueLower
  );
  if (exactMatch) {
    element.value = exactMatch.value;
    return true;
  }

  // Try partial match
  const partialMatch = options.find(opt =>
    opt.value.toLowerCase().includes(valueLower) ||
    opt.text.toLowerCase().includes(valueLower) ||
    valueLower.includes(opt.value.toLowerCase()) ||
    valueLower.includes(opt.text.toLowerCase())
  );
  if (partialMatch) {
    element.value = partialMatch.value;
    return true;
  }

  // For work authorization: try yes/no mapping
  if (WORK_AUTH_VALUES.yes.some(v => valueLower.includes(v))) {
    const yesOption = options.find(opt =>
      WORK_AUTH_VALUES.yes.some(v => opt.text.toLowerCase().includes(v) || opt.value.toLowerCase().includes(v))
    );
    if (yesOption) { element.value = yesOption.value; return true; }
  }

  return false;
}

// Expose globally
window.JobFill = window.JobFill || {};
window.JobFill.FIELD_PATTERNS = FIELD_PATTERNS;
window.JobFill.matchFieldToProfile = matchFieldToProfile;
window.JobFill.getValueForField = getValueForField;
window.JobFill.fillSelectField = fillSelectField;
window.JobFill.getAssociatedLabel = getAssociatedLabel;
window.JobFill.getPhoneValue = getPhoneValue;
window.JobFill.getLocalPhoneNumber = getLocalPhoneNumber;
window.JobFill.hasNearbyCountryCodeSelector = hasNearbyCountryCodeSelector;
