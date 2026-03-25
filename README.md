# ⚡ JobFill - AI Job Application Auto-Filler

A Chrome Extension that auto-fills job application forms, generates personalized AI cover letters, and tracks your applications — all powered by the free Groq API.

---

## Features

- **Auto-Fill Forms** — Detects and fills job application fields (name, email, LinkedIn, GitHub, etc.) across Greenhouse, Lever, Workday, Ashby, LinkedIn, and custom forms
- **AI Cover Letters** — Generates personalized 250-word cover letters using Groq's Llama 3.3 70B model (free)
- **Job Analysis** — Analyzes job descriptions against your profile and shows match score (0-100%)
- **Application Tracker** — Tracks all jobs you've applied to with status, notes, follow-up dates
- **Follow-up Reminders** — Browser notifications when you haven't heard back after 7 days
- **ATS Detection** — Automatically detects Greenhouse, Lever, Workday, Ashby, LinkedIn, SmartRecruiters

---

## Installation

### Step 1 — Get the extension files
```
Clone or download this repository to your computer.
```

### Step 2 — Generate icons (required)
1. Open `icons/generate-icons.html` in your browser
2. Click **"Generate & Download All Icons"**
3. Move the downloaded `icon16.png`, `icon48.png`, `icon128.png` to the `icons/` folder

### Step 3 — Load in Chrome
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `jobfill-extension/` folder
5. The JobFill icon (⚡) will appear in your toolbar

---

## Setup

### Configure your profile
1. Click the JobFill icon in your toolbar
2. Click **⚙ Settings** (or go to the Settings tab → Edit profile)
3. Fill in:
   - **Personal Info** — Name, email, phone, location
   - **Professional** — Job title, company, experience level
   - **Social Links** — LinkedIn, GitHub, portfolio URL
   - **Skills** — Add your technical and soft skills
   - **Resume** — Upload your PDF/DOCX (stored locally)

### Add your Groq API key (for AI features)
1. Go to **[console.groq.com](https://console.groq.com)**
2. Sign up for a free account (no credit card needed)
3. Navigate to **API Keys → Create New Key**
4. Copy your key (starts with `gsk_...`)
5. In JobFill Settings → **AI Settings** → paste your key → Save

> Your API key is stored locally in Chrome storage and only sent to Groq's servers when generating cover letters or analyzing jobs.

---

## Usage

### Auto-filling a form
1. Navigate to any job application page (Greenhouse, Lever, LinkedIn, etc.)
2. A floating bubble will appear: **"JobFill detected a form!"**
3. Click the bubble, or open the extension popup and click **⚡ Auto Fill Form**
4. Fields matching your profile are filled automatically and highlighted in green

### Generating a cover letter
1. Open the extension popup on a job page
2. Click **✨ Generate Cover Letter**
3. JobFill analyzes the job description and generates a personalized letter
4. Click **📋 Copy** to copy it to your clipboard

### Viewing your job analysis
1. On a job page with your API key set, JobFill auto-analyzes the job description
2. A **match score badge** appears in the popup (green = 70%+, yellow = 40-70%, red = below 40%)
3. Click the badge to see matched skills, missing skills, highlights, and red flags

### Tracking applications
1. After viewing a job, click **Save** in the popup to add it to your tracker
2. Open the **Tracker tab** for your 5 most recent applications
3. Click **View All →** or **📊** to open the full dashboard
4. In the dashboard, update status, add notes, set follow-up dates, export to CSV

---

## Supported Job Platforms

| Platform | Detection | Auto-Fill | Notes |
|----------|-----------|-----------|-------|
| Greenhouse | ✅ | ✅ | Most fields supported |
| Lever | ✅ | ✅ | Most fields supported |
| Workday | ✅ | ✅ | Complex UI, partial support |
| Ashby | ✅ | ✅ | Most fields supported |
| LinkedIn Easy Apply | ✅ | ✅ | Basic fields |
| SmartRecruiters | ✅ | ✅ | Most fields supported |
| Custom HTML forms | ✅ | ✅ | Pattern-matched filling |

---

## Folder Structure

```
jobfill-extension/
├── manifest.json          # Extension config (Manifest V3)
├── background.js          # Service worker — alarms, notifications, API calls
├── content.js             # Injected into pages — form detection & filling
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
├── options/
│   ├── options.html       # Settings page
│   ├── options.js         # Settings logic
│   └── options.css        # Settings styles
├── dashboard/
│   ├── dashboard.html     # Job tracker dashboard
│   ├── dashboard.js       # Dashboard logic
│   └── dashboard.css      # Dashboard styles
├── ai/
│   ├── coverLetter.js     # Groq API cover letter generation
│   └── jobAnalyzer.js     # Groq API job analysis
├── utils/
│   ├── atsDetector.js     # Detects ATS platform
│   ├── fieldMapper.js     # Maps form fields to profile data
│   └── formDetector.js    # Scans page for fillable fields
└── icons/
    ├── icon16.png         # (generate using generate-icons.html)
    ├── icon48.png
    ├── icon128.png
    └── generate-icons.html  # Icon generator tool
```

---

## Privacy & Data

- **All data is stored locally** in Chrome's `chrome.storage.local`
- Your profile, resume, and applications **never leave your browser** (except Groq API calls)
- Groq API calls send only the job description text and your profile summary — never your full resume file
- No analytics, no tracking, no external servers

---

## Troubleshooting

**Extension not filling fields?**
- Make sure your profile is set up (Settings → Personal Info)
- Try refreshing the page and opening the popup again
- Some sites with heavy JavaScript may need a moment to load

**Cover letter not generating?**
- Verify your Groq API key is saved (Settings → AI Settings → Test Key)
- Make sure you're on a page with a job description
- Check your Groq console for rate limits

**Form not detected?**
- The page may not have enough form fields (needs at least 2)
- Some heavily dynamic pages (React/Angular) may need a page refresh

**Icons missing?**
- Open `icons/generate-icons.html` in Chrome and click "Generate & Download All Icons"
- Move the downloaded PNG files to the `icons/` folder
- Go to `chrome://extensions` → JobFill → click the refresh icon

---

## Development

No build step required — vanilla JS, HTML, CSS only.

To make changes:
1. Edit any file in the extension folder
2. Go to `chrome://extensions`
3. Click the refresh icon on the JobFill card
4. Test your changes

---

## Getting a Free Groq API Key

1. Visit **console.groq.com**
2. Sign up with your Google account or email
3. Go to **API Keys** in the sidebar
4. Click **Create API Key**
5. Copy the key and paste it in JobFill Settings → AI Settings

Groq's free tier includes:
- Llama 3.3 70B: 6,000 tokens/minute
- More than enough for cover letter generation

---

## License

MIT — use freely, modify freely.
