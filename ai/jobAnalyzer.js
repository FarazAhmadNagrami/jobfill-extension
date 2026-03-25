// Job Analyzer
// Uses Groq API to analyze job descriptions and match against user profile

const JOB_ANALYZER_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL_ANALYZER = 'https://api.groq.com/openai/v1/chat/completions';

function buildAnalysisPrompt(jobDescription, profile) {
  const skills = (profile.skills || []).join(', ');
  const { currentTitle, experience } = profile.professional || {};
  const resumeSummary = profile.resume?.summary || '';

  return `You are a career coach analyzing job fit. Analyze this job description against the candidate's profile.

CANDIDATE PROFILE:
- Current Role: ${currentTitle || 'Not specified'}
- Years of Experience: ${experience || 'Not specified'}
- Skills: ${skills || 'Not specified'}
${resumeSummary ? `- Background: ${resumeSummary}` : ''}

JOB DESCRIPTION:
${jobDescription.slice(0, 3000)}

Analyze the fit and respond with ONLY a valid JSON object (no markdown, no code blocks, no explanation):
{
  "matchScore": <0-100 integer>,
  "jobTitle": "<extracted job title>",
  "company": "<extracted company name>",
  "matchedSkills": ["<skill1>", "<skill2>", ...],
  "missingSkills": ["<skill1>", "<skill2>", ...],
  "highlights": ["<positive highlight 1>", "<positive highlight 2>", "<positive highlight 3>"],
  "redFlags": ["<concern 1>", "<concern 2>"],
  "salaryRange": "<salary range if mentioned, else null>",
  "jobType": "<Full-time|Part-time|Contract|Remote|Hybrid|On-site>"
}

Rules:
- matchScore: Base on skills overlap, experience level match, and role alignment
- matchedSkills: Skills from candidate profile that appear in the job description
- missingSkills: Key requirements in the job that the candidate lacks
- highlights: Top reasons this is a good match
- redFlags: Potential concerns (over-qualification, missing requirements, etc.)
- Keep arrays concise (max 5 items each)`;
}

async function analyzeJobFit(jobDescription, profile) {
  const { groqApiKey } = profile;

  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY_MISSING');
  }

  if (!jobDescription || jobDescription.length < 50) {
    return getDefaultAnalysis();
  }

  const response = await fetch(GROQ_API_URL_ANALYZER, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: JOB_ANALYZER_MODEL,
      messages: [{ role: 'user', content: buildAnalysisPrompt(jobDescription, profile) }],
      max_tokens: 600,
      temperature: 0.3,
      stream: false
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('GROQ_AUTH_ERROR');
    if (response.status === 429) throw new Error('GROQ_RATE_LIMIT');
    throw new Error(`GROQ_API_ERROR:${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';

  try {
    // Extract JSON from response (handle markdown code blocks if present)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and sanitize
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
  } catch (parseError) {
    console.error('JobFill: Failed to parse job analysis JSON', parseError, content);
    return getDefaultAnalysis();
  }
}

function getDefaultAnalysis() {
  return {
    matchScore: 0,
    jobTitle: '',
    company: '',
    matchedSkills: [],
    missingSkills: [],
    highlights: [],
    redFlags: [],
    salaryRange: null,
    jobType: 'Full-time'
  };
}

function getScoreColor(score) {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function getScoreLabel(score) {
  if (score >= 70) return 'Great Match';
  if (score >= 40) return 'Partial Match';
  return 'Low Match';
}

// Analysis cache by URL
const analysisCache = new Map();

async function getJobAnalysis(url, jobDescription, profile) {
  if (analysisCache.has(url)) {
    return analysisCache.get(url);
  }
  const analysis = await analyzeJobFit(jobDescription, profile);
  analysisCache.set(url, analysis);
  return analysis;
}

function clearAnalysisCache(url = null) {
  if (url) analysisCache.delete(url);
  else analysisCache.clear();
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analyzeJobFit, getJobAnalysis, getScoreColor, getScoreLabel, clearAnalysisCache };
} else {
  window.JobFillAI = window.JobFillAI || {};
  window.JobFillAI.analyzeJobFit = analyzeJobFit;
  window.JobFillAI.getJobAnalysis = getJobAnalysis;
  window.JobFillAI.getScoreColor = getScoreColor;
  window.JobFillAI.getScoreLabel = getScoreLabel;
  window.JobFillAI.clearAnalysisCache = clearAnalysisCache;
}
