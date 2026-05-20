const fetch = require('node-fetch');

async function analyzeWithAI(filesContent, staticResults) {
  // ── Key check ──────────────────────────────────────────────────────────────
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();

  if (!apiKey) {
    throw new Error(
      'OpenRouter API key is missing. ' +
      'On Render: go to your service → Environment → add OPENROUTER_API_KEY. ' +
      'Locally: create a .env file with OPENROUTER_API_KEY=sk-or-v1-...'
    );
  }

  if (!apiKey.startsWith('sk-')) {
    throw new Error(
      `OpenRouter API key looks wrong (starts with "${apiKey.slice(0, 6)}..."). ` +
      'It should start with "sk-or-v1-". Check for extra spaces or quotes.'
    );
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  let codeContent = '';
  let totalChars = 0;
  const MAX_CHARS = 25000;

  for (const [name, content] of Object.entries(filesContent)) {
    const chunk = `--- FILE: ${name} ---\n${content}\n\n`;
    if (totalChars + chunk.length > MAX_CHARS) break;
    codeContent += chunk;
    totalChars += chunk.length;
  }

  const staticSummary = staticResults.length > 0
    ? JSON.stringify(staticResults, null, 2)
    : 'No issues found by static tools.';

  const prompt = `You are a senior web developer. Analyze this website code.

Static analysis already found these issues:
${staticSummary}

Now provide:
1. Simple explanation of the static tool findings
2. Security vulnerabilities the tools missed
3. Logic errors and bugs
4. Performance improvements
5. Code quality suggestions

Return as HTML using only these sections:
<h3>📋 Summary</h3>
<h3>🔒 Security Issues</h3>
<h3>🐛 Logic Bugs</h3>
<h3>⚡ Performance</h3>
<h3>✅ Improvements</h3>

For each issue use:
<div class="issue"><strong>File:</strong> filename | <strong>Line:</strong> approx | <strong>Issue:</strong> description | <strong>Fix:</strong> suggestion</div>

If a section has no issues write: <p class="ok">No issues found.</p>

CODE:
${codeContent}`;

  // ── Call OpenRouter ────────────────────────────────────────────────────────
  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'https://code-analyzer.onrender.com',
        'X-Title': 'Code Analyzer'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000
      })
    });
  } catch (networkErr) {
    throw new Error(`Network error reaching OpenRouter: ${networkErr.message}`);
  }

  // ── Parse response ─────────────────────────────────────────────────────────
  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new Error(`OpenRouter returned non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok || data.error) {
    const msg = data.error?.message || data.error || `HTTP ${response.status}`;
    throw new Error(`OpenRouter API error: ${msg}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter returned an empty response. Try again.');
  }

  return content;
}

module.exports = { analyzeWithAI };