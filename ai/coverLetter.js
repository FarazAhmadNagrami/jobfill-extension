// Cover Letter Generator
// Uses Groq API with llama-3.3-70b-versatile to generate personalized cover letters

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const COVER_LETTER_MODEL = 'llama-3.3-70b-versatile';

function buildCoverLetterPrompt(jobDescription, profile, jobMeta) {
  const { firstName, lastName, email } = profile.personal || {};
  const { currentTitle, currentCompany, experience } = profile.professional || {};
  const skills = (profile.skills || []).join(', ');
  const resumeSummary = profile.resume?.summary || '';
  const { jobTitle = 'this role', company = 'your company' } = jobMeta || {};

  return `You are a professional cover letter writer. Write a compelling, personalized cover letter for this job application.

APPLICANT PROFILE:
- Name: ${firstName || ''} ${lastName || ''}
- Current Role: ${currentTitle || 'Professional'} at ${currentCompany || 'current company'}
- Years of Experience: ${experience || 'several years'}
- Key Skills: ${skills || 'various relevant skills'}
${resumeSummary ? `- Summary: ${resumeSummary}` : ''}

JOB BEING APPLIED TO:
- Position: ${jobTitle}
- Company: ${company}

JOB DESCRIPTION:
${jobDescription.slice(0, 2000)}

INSTRUCTIONS:
Write a cover letter with EXACTLY 3 paragraphs:
1. Opening paragraph: Express genuine enthusiasm for THIS specific role at ${company}. Reference something specific about the company or role from the job description.
2. Middle paragraph: Highlight the most relevant experience and achievements with specific numbers/metrics where possible. Connect your skills directly to the job requirements.
3. Closing paragraph: Professional call to action expressing eagerness to discuss further.

REQUIREMENTS:
- Maximum 250 words total
- Professional but conversational tone (avoid corporate jargon)
- Do NOT use placeholder text like [Your Name] or [Date]
- Do NOT include a header, date, or signature block
- Do NOT start with "Dear Hiring Manager" or similar generic openings
- Start directly with an engaging opening sentence
- Make it sound human and authentic, not AI-generated
- Only output the 3 paragraphs, nothing else

Write the cover letter now:`;
}

async function generateCoverLetter(jobDescription, profile, jobMeta, onChunk = null) {
  const { groqApiKey } = profile;

  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY_MISSING');
  }

  if (!jobDescription || jobDescription.length < 50) {
    throw new Error('JOB_DESCRIPTION_TOO_SHORT');
  }

  const prompt = buildCoverLetterPrompt(jobDescription, profile, jobMeta);

  const requestBody = {
    model: COVER_LETTER_MODEL,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 500,
    temperature: 0.7,
    stream: !!onChunk
  };

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('GROQ_AUTH_ERROR');
    if (response.status === 429) throw new Error('GROQ_RATE_LIMIT');
    throw new Error(`GROQ_API_ERROR:${response.status}:${errorData.error?.message || 'Unknown error'}`);
  }

  // Streaming mode
  if (onChunk && requestBody.stream) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            onChunk(content, fullText);
          }
        } catch (e) {
          // Skip malformed chunks
        }
      }
    }
    return fullText.trim();
  }

  // Non-streaming mode
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// Cache cover letters by URL
const coverLetterCache = new Map();

async function getCoverLetter(url, jobDescription, profile, jobMeta, onChunk = null) {
  if (coverLetterCache.has(url)) {
    const cached = coverLetterCache.get(url);
    if (onChunk) onChunk(cached, cached);
    return cached;
  }
  const letter = await generateCoverLetter(jobDescription, profile, jobMeta, onChunk);
  coverLetterCache.set(url, letter);
  return letter;
}

function clearCoverLetterCache(url = null) {
  if (url) {
    coverLetterCache.delete(url);
  } else {
    coverLetterCache.clear();
  }
}

// Export for use in background.js and popup.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateCoverLetter, getCoverLetter, clearCoverLetterCache };
} else {
  window.JobFillAI = window.JobFillAI || {};
  window.JobFillAI.generateCoverLetter = generateCoverLetter;
  window.JobFillAI.getCoverLetter = getCoverLetter;
  window.JobFillAI.clearCoverLetterCache = clearCoverLetterCache;
}
