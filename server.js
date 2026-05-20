// Load .env file FIRST (for local development)
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { analyzePHP } = require('./analyzers/phpAnalyzer');
const { analyzeJS } = require('./analyzers/jsAnalyzer');
const { analyzeHTML } = require('./analyzers/htmlAnalyzer');
const { analyzeCSS } = require('./analyzers/cssAnalyzer');
const { analyzeWithAI } = require('./api/openrouter');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Check API key on startup ──────────────────────────────────────────────────
const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
if (!apiKey) {
  console.warn('⚠️  WARNING: OPENROUTER_API_KEY is not set!');
  console.warn('   → Locally: create a .env file with OPENROUTER_API_KEY=sk-or-v1-...');
  console.warn('   → On Render: Environment tab → add OPENROUTER_API_KEY');
} else {
  console.log(`✅ OPENROUTER_API_KEY loaded (${apiKey.slice(0, 12)}...)`);
}

// ── File upload config ────────────────────────────────────────────────────────
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

app.use(express.static('public'));

const SUPPORTED = ['php', 'html', 'htm', 'css', 'js', 'json', 'sql', 'txt'];
const SKIP = ['vendor', 'node_modules', '.git'];

function getExt(filename) {
  return path.extname(filename).toLowerCase().replace('.', '');
}

function shouldSkip(filePath) {
  return SKIP.some(f =>
    filePath.includes(`/${f}/`) ||
    filePath.includes(`\\${f}\\`) ||
    filePath.startsWith(`${f}/`)
  );
}

function extractFiles(uploadedFile) {
  const files = {};
  const ext = getExt(uploadedFile.originalname);

  if (ext === 'zip') {
    const zip = new AdmZip(uploadedFile.path);
    zip.getEntries().forEach(entry => {
      if (entry.isDirectory) return;
      if (shouldSkip(entry.entryName)) return;
      if (!SUPPORTED.includes(getExt(entry.name))) return;
      try {
        files[entry.entryName] = entry.getData().toString('utf8');
      } catch (e) {
        // skip unreadable entries
      }
    });
  } else {
    if (SUPPORTED.includes(ext)) {
      files[uploadedFile.originalname] = fs.readFileSync(uploadedFile.path, 'utf8');
    }
  }
  return files;
}

function writeTempFiles(filesContent) {
  const tempDir = `uploads/temp_${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });
  const written = {};
  for (const [name, content] of Object.entries(filesContent)) {
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempPath = path.join(tempDir, safeName);
    fs.writeFileSync(tempPath, content);
    written[name] = { path: tempPath, ext: getExt(name) };
  }
  return { tempDir, written };
}

function cleanup(paths) {
  paths.forEach(p => {
    try {
      if (!fs.existsSync(p)) return;
      fs.lstatSync(p).isDirectory()
        ? fs.rmSync(p, { recursive: true, force: true })
        : fs.unlinkSync(p);
    } catch (e) {}
  });
}

// ── Health check (visit /health to debug) ────────────────────────────────────
app.get('/health', (req, res) => {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  res.json({
    status: 'running',
    apiKeySet: !!key,
    apiKeyPrefix: key ? key.slice(0, 12) + '...' : 'NOT SET',
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development'
  });
});

// ── Main analyze endpoint ─────────────────────────────────────────────────────
app.post('/analyze', upload.single('codefile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const tempPaths = [req.file.path];

  try {
    const filesContent = extractFiles(req.file);

    if (Object.keys(filesContent).length === 0) {
      cleanup(tempPaths);
      return res.status(400).json({
        error: 'No supported files found. Upload PHP, HTML, CSS, JS, JSON, SQL, TXT or a ZIP containing them.'
      });
    }

    console.log(`Analyzing ${Object.keys(filesContent).length} file(s): ${Object.keys(filesContent).join(', ')}`);

    const { tempDir, written } = writeTempFiles(filesContent);
    tempPaths.push(tempDir);

    // Run static analyzers in parallel
    const staticPromises = [];
    for (const [name, { path: filePath, ext }] of Object.entries(written)) {
      if (ext === 'php') staticPromises.push(analyzePHP(filePath));
      if (ext === 'js') staticPromises.push(analyzeJS(filePath));
      if (['html', 'htm'].includes(ext)) staticPromises.push(analyzeHTML(filePath));
      if (ext === 'css') staticPromises.push(analyzeCSS(filePath));
    }

    const staticRaw = await Promise.all(staticPromises);
    const staticIssues = staticRaw.flat();
    console.log(`Static analysis complete: ${staticIssues.length} issue(s) found`);

    // AI analysis
    console.log('Sending to OpenRouter AI...');
    const aiAnalysis = await analyzeWithAI(filesContent, staticIssues);
    console.log('AI analysis complete');

    cleanup(tempPaths);

    res.json({
      success: true,
      fileCount: Object.keys(filesContent).length,
      staticIssues,
      aiAnalysis
    });

  } catch (err) {
    console.error('Analysis error:', err.message);
    cleanup(tempPaths);
    res.status(500).json({ error: err.message || 'Analysis failed. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Code Analyzer running on port ${PORT}`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});