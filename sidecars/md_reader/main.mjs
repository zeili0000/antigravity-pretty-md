/**
 * Pretty Markdown Reader sidecar backend.
 *
 * Serves a self-contained Markdown reader Web UI and safely lists/reads
 * Markdown artifacts from the active conversation's brain directory and
 * open workspace folders.
 */
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, parse, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { SidecarApp, Response } from 'sidecar_sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = join(__dirname, '..', '..', 'themes');
const SETTINGS_FILE = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR
  ? join(process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR, 'settings.json')
  : join(__dirname, '..', '..', 'user-settings.json');
const ID_RE = /^[0-9a-f-]{8,}$/i;
const MD_EXT_RE = /\.(md|markdown)$/i;
const SAFE_THEME_RE = /^[a-z0-9][a-z0-9._ -]{0,60}\.css$/i;
const MAX_READ_BYTES = 4 * 1024 * 1024;
const MAX_THEME_BYTES = 128 * 1024;
const MAX_SCAN_DEPTH = 3;
const MAX_SCAN_FILES = 120;
const MAX_LIBRARY_DOCS = 300;

const ARTIFACT_SKIP_DIRS = new Set(['.system_generated', '.git', 'node_modules']);
const WORKSPACE_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  'dist',
  'build',
  '__pycache__',
  '.next',
  '.cache',
]);

function registerStaticAsset(app, route, absPath, contentType, cacheControl) {
  const bytes = readFileSync(absPath);
  const headers = cacheControl ? { 'Cache-Control': cacheControl } : undefined;
  app.api(
    route,
    () => new Response(bytes, { contentType, headers }),
    'GET'
  );
}

function findAppDataDirs() {
  const candidates = [];
  const pushIfBrain = (dir) => {
    if (!dir) return;
    try {
      if (existsSync(join(dir, 'brain')) && !candidates.includes(dir)) {
        candidates.push(dir);
      }
    } catch {
      // ignore invalid path
    }
  };

  pushIfBrain(process.env.ANTIGRAVITY_APP_DATA_DIR);

  const execDataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
  if (execDataDir) {
    for (let d = execDataDir; d && d !== dirname(d); d = dirname(d)) {
      if (basename(d) === 'sidecar_data') {
        pushIfBrain(dirname(d));
        break;
      }
    }
  }

  const geminiRoot = join(homedir(), '.gemini');
  pushIfBrain(join(geminiRoot, 'antigravity'));
  try {
    for (const entry of readdirSync(geminiRoot)) {
      pushIfBrain(join(geminiRoot, entry));
    }
  } catch {
    // ignore
  }

  return candidates;
}

function resolveBrainConvDir(convId) {
  if (!convId || !ID_RE.test(convId)) return null;
  for (const appData of findAppDataDirs()) {
    const dir = join(appData, 'brain', convId);
    try {
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        return dir;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function parseWorkspaceDirs(workspaceUris) {
  if (!Array.isArray(workspaceUris)) return [];
  const out = [];
  const seen = new Set();
  for (const uri of workspaceUris) {
    if (typeof uri !== 'string' || !uri.toLowerCase().startsWith('file://')) continue;
    try {
      const dir = fileURLToPath(uri);
      const real = realpathSync(dir);
      // Reject filesystem or drive roots (e.g. "/" or "C:\")
      if (parse(real).root === real) continue;
      const key = process.platform === 'win32' ? real.toLowerCase() : real;
      if (!seen.has(key) && statSync(real).isDirectory()) {
        seen.add(key);
        out.push(real);
      }
    } catch {
      // ignore unreadable/nonexistent workspace URI
    }
  }
  return out;
}

function scanMarkdownDir(rootDir, { skipDirs, group, workspaceName }) {
  const results = [];
  let rootReal;
  try {
    rootReal = realpathSync(rootDir);
  } catch {
    return results;
  }

  function walk(currentDir, depth) {
    if (results.length >= MAX_SCAN_FILES || depth > MAX_SCAN_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_SCAN_FILES) break;
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        if (depth < MAX_SCAN_DEPTH) {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile() && MD_EXT_RE.test(entry.name)) {
        try {
          const st = statSync(fullPath);
          const relPath = relative(rootReal, fullPath).replace(/\\/g, '/');
          results.push({
            path: realpathSync(fullPath),
            name: entry.name,
            relPath,
            group,
            ...(workspaceName ? { workspaceName } : {}),
            mtime: st.mtimeMs,
            size: st.size,
          });
        } catch {
          // ignore transient/unreadable file
        }
      }
    }
  }

  walk(rootReal, 0);
  return results;
}

function isWithinRoot(targetReal, rootReal) {
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const t = norm(targetReal);
  const r = norm(rootReal);
  const prefix = r.endsWith(sep) ? r : r + sep;
  return t.startsWith(prefix);
}

const app = new SidecarApp();

app.page('/', () => {
  const cssVer = Math.trunc(statSync(join(__dirname, 'styles.css')).mtimeMs);
  const jsVer = Math.trunc(statSync(join(__dirname, 'app.js')).mtimeMs);
  const html = readFileSync(join(__dirname, 'index.html'), 'utf-8')
    .replace('href="/styles.css"', `href="/styles.css?v=${cssVer}"`)
    .replace('src="/app.js"', `src="/app.js?v=${jsVer}"`);
  return new Response(html, {
    contentType: 'text/html; charset=utf-8',
    headers: { 'Cache-Control': 'no-store' },
  });
});

// Live-read frontend CSS/JS so UI edits reflect immediately without restart
app.api(
  '/styles.css',
  () =>
    new Response(readFileSync(join(__dirname, 'styles.css'), 'utf-8'), {
      contentType: 'text/css; charset=utf-8',
      headers: { 'Cache-Control': 'no-store' },
    }),
  'GET'
);
app.api(
  '/app.js',
  () =>
    new Response(readFileSync(join(__dirname, 'app.js'), 'utf-8'), {
      contentType: 'application/javascript; charset=utf-8',
      headers: { 'Cache-Control': 'no-store' },
    }),
  'GET'
);

// Bundled vendor assets (cached in memory)
registerStaticAsset(
  app,
  '/vendor/catppuccin.css',
  join(__dirname, 'node_modules', '@catppuccin', 'palette', 'css', 'catppuccin.css'),
  'text/css; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/js-yaml.min.js',
  join(__dirname, 'node_modules', 'js-yaml', 'dist', 'browser', 'js-yaml.umd.min.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/vega.min.js',
  join(__dirname, 'node_modules', 'vega', 'build', 'vega.min.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/vega-lite.min.js',
  join(__dirname, 'node_modules', 'vega-lite', 'build', 'vega-lite.min.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/vega-embed.min.js',
  join(__dirname, 'node_modules', 'vega-embed', 'build', 'vega-embed.min.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/purify.min.js',
  join(__dirname, 'node_modules', 'dompurify', 'dist', 'purify.min.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/marked.umd.js',
  join(__dirname, 'node_modules', 'marked', 'lib', 'marked.umd.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/highlight.min.js',
  join(__dirname, 'node_modules', '@highlightjs', 'cdn-assets', 'highlight.min.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/mermaid.min.js',
  join(__dirname, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/katex/katex.min.js',
  join(__dirname, 'node_modules', 'katex', 'dist', 'katex.min.js'),
  'application/javascript; charset=utf-8',
  'public, max-age=86400'
);
registerStaticAsset(
  app,
  '/vendor/katex/katex.min.css',
  join(__dirname, 'node_modules', 'katex', 'dist', 'katex.min.css'),
  'text/css; charset=utf-8',
  'public, max-age=86400'
);

// Register KaTeX font files so relative url(fonts/...) works with zero CSS rewrites
const katexFontsDir = join(__dirname, 'node_modules', 'katex', 'dist', 'fonts');
const FONT_MIME = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};
for (const fname of readdirSync(katexFontsDir)) {
  const extMatch = fname.match(/\.[a-z0-9]+$/i);
  const contentType = extMatch ? FONT_MIME[extMatch[0].toLowerCase()] : null;
  if (!contentType) continue;
  registerStaticAsset(
    app,
    `/vendor/katex/fonts/${fname}`,
    join(katexFontsDir, fname),
    contentType,
    'public, max-age=86400'
  );
}

app.api('/api/files', (data) => {
  const convId =
    (typeof data.conversationId === 'string' && ID_RE.test(data.conversationId) && data.conversationId) ||
    (app.config.conversationId && ID_RE.test(app.config.conversationId) && app.config.conversationId) ||
    '';

  const artifacts = [];
  const convDir = resolveBrainConvDir(convId);
  if (convDir) {
    artifacts.push(...scanMarkdownDir(convDir, { skipDirs: ARTIFACT_SKIP_DIRS, group: 'artifact' }));
    artifacts.sort((a, b) => b.mtime - a.mtime || a.relPath.localeCompare(b.relPath));
  }

  const workspaceFiles = [];
  for (const wsDir of parseWorkspaceDirs(data.workspaceUris)) {
    workspaceFiles.push(
      ...scanMarkdownDir(wsDir, {
        skipDirs: WORKSPACE_SKIP_DIRS,
        group: 'workspace',
        workspaceName: basename(wsDir),
      })
    );
  }
  workspaceFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));

  return {
    conversationId: convId || null,
    files: [...artifacts, ...workspaceFiles],
  };
}, 'POST');

function hasSystemGeneratedSegment(filePath) {
  return filePath
    .split(/[/\\]/)
    .some((seg) => seg.toLowerCase() === '.system_generated');
}

function getAllowedMarkdownRoots(workspaceUris) {
  const roots = [];
  for (const appData of findAppDataDirs()) {
    try {
      roots.push(realpathSync(join(appData, 'brain')));
    } catch {
      // ignore
    }
  }
  for (const wsDir of parseWorkspaceDirs(workspaceUris)) {
    roots.push(wsDir);
  }
  return roots;
}

function isAllowedMarkdownPath(realTarget, workspaceUris) {
  if (!MD_EXT_RE.test(realTarget) || hasSystemGeneratedSegment(realTarget)) {
    return false;
  }
  return getAllowedMarkdownRoots(workspaceUris).some((root) => isWithinRoot(realTarget, root));
}

function readHeadUtf8(filePath, maxBytes = 4096) {
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(maxBytes);
    const read = readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, read).toString('utf-8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

const metaCache = new Map();
function extractDocMeta(filePath, fallbackName, mtime, size) {
  const cacheKey = `${filePath}:${mtime}:${size}`;
  const hit = metaCache.get(cacheKey);
  if (hit) return hit;

  const head = readHeadUtf8(filePath, 4096);
  let title = '';
  let summary = '';
  let tags = [];
  let date = '';
  let body = head;

  const fmMatch = head.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (fmMatch) {
    body = head.slice(fmMatch[0].length);
    try {
      const fm = parseYaml(fmMatch[1]);
      if (fm && typeof fm === 'object' && !Array.isArray(fm)) {
        if (typeof fm.title === 'string') title = fm.title.trim();
        if (typeof fm.summary === 'string') summary = fm.summary.trim();
        else if (typeof fm.description === 'string') summary = fm.description.trim();
        if (fm.date instanceof Date && !Number.isNaN(fm.date.valueOf())) {
          date = fm.date.toISOString().slice(0, 10);
        } else if (typeof fm.date === 'string' || typeof fm.date === 'number') {
          date = String(fm.date).trim();
        }
        if (Array.isArray(fm.tags)) {
          tags = fm.tags.map((t) => String(t).trim()).filter(Boolean);
        } else if (typeof fm.tags === 'string') {
          tags = fm.tags.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }
    } catch {
      // ignore malformed YAML
    }
  }

  if (!title) {
    const hMatch = body.match(/^#\s+(.+)$/m);
    if (hMatch) title = hMatch[1].trim();
  }
  if (!title) title = fallbackName;

  if (!summary) {
    const proseLines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('---') && !l.startsWith('> [!'));
    if (proseLines.length) {
      summary = proseLines.join(' ').replace(/[*_`[\]]/g, '').slice(0, 160).trim();
    }
  }

  if (!date && Number.isFinite(mtime)) {
    date = new Date(mtime).toISOString().slice(0, 10);
  }

  const meta = { title, summary, tags, date };
  if (metaCache.size > 600) metaCache.clear();
  metaCache.set(cacheKey, meta);
  return meta;
}

app.api('/api/read', (data) => {
  const deny = (status, error) =>
    new Response(JSON.stringify({ error }), { status, contentType: 'application/json' });

  const requestedPath = typeof data.path === 'string' ? data.path : '';
  if (!requestedPath || !MD_EXT_RE.test(requestedPath)) {
    return deny(403, 'Access denied');
  }

  let realTarget;
  try {
    realTarget = realpathSync(requestedPath);
  } catch {
    return deny(404, 'File not found');
  }

  if (!isAllowedMarkdownPath(realTarget, data.workspaceUris)) {
    return deny(403, 'Access denied');
  }

  let st;
  try {
    st = statSync(realTarget);
  } catch {
    return deny(404, 'File not found');
  }
  if (!st.isFile()) {
    return deny(403, 'Not a file');
  }
  if (st.size > MAX_READ_BYTES) {
    return deny(413, 'File exceeds 4 MB limit');
  }

  const content = readFileSync(realTarget, 'utf-8');
  return {
    path: realTarget,
    name: basename(realTarget),
    content,
    mtime: st.mtimeMs,
    size: st.size,
  };
}, 'POST');

app.api('/api/write', (data) => {
  const errResp = (status, error) =>
    new Response(JSON.stringify({ error }), { status, contentType: 'application/json' });

  const requestedPath = typeof data.path === 'string' ? data.path : '';
  const content = typeof data.content === 'string' ? data.content : null;
  if (!requestedPath || content === null || Buffer.byteLength(content, 'utf-8') > MAX_READ_BYTES) {
    return errResp(400, 'Invalid path or content');
  }

  let realTarget;
  try {
    realTarget = realpathSync(requestedPath);
  } catch {
    return errResp(404, 'File not found');
  }
  if (!isAllowedMarkdownPath(realTarget, data.workspaceUris)) {
    return errResp(403, 'Access denied');
  }

  let st;
  try {
    st = statSync(realTarget);
  } catch {
    return errResp(404, 'File not found');
  }
  if (!st.isFile()) {
    return errResp(403, 'Not a file');
  }

  writeFileSync(realTarget, content, 'utf-8');
  const nextStat = statSync(realTarget);
  return { ok: true, path: realTarget, mtime: nextStat.mtimeMs };
}, 'POST');

app.api('/api/resolve-link', (data) => {
  const errResp = (status, error) =>
    new Response(JSON.stringify({ error }), { status, contentType: 'application/json' });

  const rawTarget = typeof data.target === 'string' ? data.target.trim() : '';
  const currentPath = typeof data.currentPath === 'string' ? data.currentPath.trim() : '';
  const workspaceUris = data.workspaceUris;
  if (!rawTarget) return errResp(400, 'Missing target');

  let decoded = rawTarget;
  try {
    decoded = decodeURIComponent(rawTarget);
  } catch {
    // keep raw
  }

  const tryCandidate = (candidatePath) => {
    if (!candidatePath) return null;
    const attempts = MD_EXT_RE.test(candidatePath)
      ? [candidatePath]
      : [candidatePath, `${candidatePath}.md`, `${candidatePath}.markdown`];
    for (const p of attempts) {
      try {
        const real = realpathSync(p);
        if (!isAllowedMarkdownPath(real, workspaceUris)) continue;
        if (statSync(real).isFile()) return real;
      } catch {
        // not found
      }
    }
    return null;
  };

  // 1. file:// URI
  if (/^file:\/\//i.test(decoded)) {
    try {
      const fsPath = fileURLToPath(decoded);
      const hit = tryCandidate(fsPath);
      if (hit) return { ok: true, path: hit, name: basename(hit) };
    } catch {
      // fall through
    }
    return errResp(404, 'Linked file not found or outside allowed folders');
  }

  // 2. Direct relative resolution from current file directory
  const baseDir = currentPath ? dirname(currentPath) : '';
  if (baseDir) {
    const hit = tryCandidate(join(baseDir, decoded));
    if (hit) return { ok: true, path: hit, name: basename(hit) };
  }

  // 3. Direct relative resolution from each open workspace root
  const wsDirs = parseWorkspaceDirs(workspaceUris);
  for (const wsDir of wsDirs) {
    const hit = tryCandidate(join(wsDir, decoded.replace(/^\/+/, '')));
    if (hit) return { ok: true, path: hit, name: basename(hit) };
  }

  // 4. Wikilink / filename search across active conversation, workspaces, and brain
  const normQuery = decoded.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  const normStem = normQuery.replace(MD_EXT_RE, '');
  const activeConvId =
    (typeof data.conversationId === 'string' && ID_RE.test(data.conversationId) && data.conversationId) ||
    (app.config.conversationId && ID_RE.test(app.config.conversationId) && app.config.conversationId) ||
    '';

  const candidates = [];
  const seen = new Set();
  const addItems = (items, priority) => {
    for (const item of items) {
      if (seen.has(item.path) || hasSystemGeneratedSegment(item.path)) continue;
      seen.add(item.path);
      candidates.push({ ...item, priority });
    }
  };

  const convDir = activeConvId ? resolveBrainConvDir(activeConvId) : null;
  if (convDir) {
    addItems(scanMarkdownDir(convDir, { skipDirs: ARTIFACT_SKIP_DIRS, group: 'artifact' }), 1);
  }
  for (const wsDir of wsDirs) {
    addItems(scanMarkdownDir(wsDir, { skipDirs: WORKSPACE_SKIP_DIRS, group: 'workspace', workspaceName: basename(wsDir) }), 2);
  }
  for (const appData of findAppDataDirs()) {
    const brainRoot = join(appData, 'brain');
    let entries;
    try {
      entries = readdirSync(brainRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_RE.test(entry.name) || entry.name === activeConvId) continue;
      addItems(scanMarkdownDir(join(brainRoot, entry.name), { skipDirs: ARTIFACT_SKIP_DIRS, group: 'archive' }), 3);
    }
  }

  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const rel = (c.relPath || c.name).replace(/\\/g, '/').toLowerCase();
    const relStem = rel.replace(MD_EXT_RE, '');
    const name = c.name.toLowerCase();
    const stem = name.replace(MD_EXT_RE, '');
    let matchRank = Infinity;
    if (rel === normQuery || relStem === normStem) matchRank = 0;
    else if (name === normQuery || stem === normStem) matchRank = 1;
    else if (rel.endsWith('/' + normQuery) || relStem.endsWith('/' + normStem)) matchRank = 2;
    if (matchRank < Infinity) {
      const score = matchRank * 10 + c.priority;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }

  if (best) {
    return { ok: true, path: best.path, name: best.name, group: best.group };
  }
  return errResp(404, 'Linked Markdown file not found');
}, 'POST');

app.api('/api/library', (data) => {
  const activeConvId =
    (typeof data.conversationId === 'string' && ID_RE.test(data.conversationId) && data.conversationId) ||
    (app.config.conversationId && ID_RE.test(app.config.conversationId) && app.config.conversationId) ||
    '';

  const docs = [];
  const seenPaths = new Set();

  for (const appData of findAppDataDirs()) {
    const brainRoot = join(appData, 'brain');
    let convEntries;
    try {
      convEntries = readdirSync(brainRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const convEntry of convEntries) {
      if (!convEntry.isDirectory() || !ID_RE.test(convEntry.name)) continue;
      const convId = convEntry.name;
      const scanned = scanMarkdownDir(join(brainRoot, convId), {
        skipDirs: ARTIFACT_SKIP_DIRS,
        group: convId === activeConvId ? 'artifact' : 'archive',
      });
      for (const item of scanned) {
        if (seenPaths.has(item.path) || hasSystemGeneratedSegment(item.path)) continue;
        seenPaths.add(item.path);
        const meta = extractDocMeta(item.path, item.name, item.mtime, item.size);
        docs.push({
          ...item,
          convId,
          isCurrentConv: convId === activeConvId,
          ...meta,
        });
      }
    }
  }

  for (const wsDir of parseWorkspaceDirs(data.workspaceUris)) {
    const scanned = scanMarkdownDir(wsDir, {
      skipDirs: WORKSPACE_SKIP_DIRS,
      group: 'workspace',
      workspaceName: basename(wsDir),
    });
    for (const item of scanned) {
      if (seenPaths.has(item.path)) continue;
      seenPaths.add(item.path);
      const meta = extractDocMeta(item.path, item.name, item.mtime, item.size);
      docs.push({
        ...item,
        convId: '',
        isCurrentConv: false,
        ...meta,
      });
    }
  }

  docs.sort((a, b) => b.mtime - a.mtime);
  return { docs: docs.slice(0, MAX_LIBRARY_DOCS) };
}, 'POST');

function readSettingsFile() {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
      return { archiveDir: typeof parsed?.archiveDir === 'string' ? parsed.archiveDir : '' };
    }
  } catch {
    // ignore corrupt settings
  }
  return { archiveDir: '' };
}

app.api('/api/settings-get', () => readSettingsFile(), 'POST');

app.api('/api/settings', (data) => {
  const errResp = (status, error) =>
    new Response(JSON.stringify({ error }), { status, contentType: 'application/json' });

  const rawDir = typeof data.archiveDir === 'string' ? data.archiveDir.trim() : '';
  let archiveDir = '';
  if (rawDir) {
    try {
      const real = realpathSync(rawDir);
      if (!statSync(real).isDirectory()) {
        return errResp(400, 'Archive path is not a directory');
      }
      archiveDir = real;
    } catch {
      return errResp(400, 'Archive folder does not exist');
    }
  }

  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify({ archiveDir }, null, 2), 'utf-8');
  return { archiveDir };
}, 'POST');

app.api('/api/archive', (data) => {
  const errResp = (status, error) =>
    new Response(JSON.stringify({ error }), { status, contentType: 'application/json' });

  const { archiveDir } = readSettingsFile();
  if (!archiveDir || !existsSync(archiveDir) || !statSync(archiveDir).isDirectory()) {
    return errResp(400, 'Set an existing archive folder first');
  }

  const content = typeof data.content === 'string' ? data.content : '';
  if (!content || Buffer.byteLength(content, 'utf-8') > MAX_READ_BYTES) {
    return errResp(400, 'Empty or oversized document');
  }

  const rawName = basename(String(data.filename || 'note.md')).replace(/\.(md|markdown)$/i, '');
  let cleanName = rawName
    .replace(/[^a-z0-9._ -]/gi, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/^[^a-z0-9]+/i, '')
    .slice(0, 80);
  if (!cleanName) cleanName = 'note';
  const safeFile = `${cleanName}.md`;

  const target = join(archiveDir, safeFile);
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    return errResp(403, 'Refusing to overwrite symlink');
  }
  writeFileSync(target, content, 'utf-8');
  return { ok: true, savedPath: target };
}, 'POST');

function isSafeThemeName(fname) {
  return typeof fname === 'string' && SAFE_THEME_RE.test(fname) && !fname.includes('..');
}

function humanThemeLabel(fname) {
  return fname
    .replace(/\.css$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

app.api('/api/themes', () => {
  if (!existsSync(THEMES_DIR)) {
    return { themes: [] };
  }
  const themes = [];
  try {
    for (const entry of readdirSync(THEMES_DIR, { withFileTypes: true })) {
      if (entry.isFile() && isSafeThemeName(entry.name)) {
        themes.push({
          id: `custom:${entry.name}`,
          file: entry.name,
          label: humanThemeLabel(entry.name),
        });
      }
    }
  } catch {
    return { themes: [] };
  }
  themes.sort((a, b) => a.label.localeCompare(b.label));
  return { themes };
}, 'GET');

app.api('/api/theme', (data) => {
  const errResp = (status, msg) =>
    new Response(JSON.stringify({ error: msg }), { status, contentType: 'application/json' });

  const fname = typeof data.file === 'string' ? data.file : '';
  if (!isSafeThemeName(fname)) {
    return errResp(403, 'Invalid theme filename');
  }
  if (!existsSync(THEMES_DIR)) {
    return errResp(404, 'Theme not found');
  }

  let themesReal;
  let targetReal;
  try {
    themesReal = realpathSync(THEMES_DIR);
    targetReal = realpathSync(join(themesReal, fname));
  } catch {
    return errResp(404, 'Theme not found');
  }
  if (!isWithinRoot(targetReal, themesReal)) {
    return errResp(403, 'Access denied');
  }

  let st;
  try {
    st = statSync(targetReal);
  } catch {
    return errResp(404, 'Theme not found');
  }
  if (!st.isFile()) {
    return errResp(403, 'Not a file');
  }
  if (st.size > MAX_THEME_BYTES) {
    return errResp(413, 'Theme exceeds 128 KB limit');
  }

  return new Response(readFileSync(targetReal, 'utf-8'), {
    contentType: 'text/css; charset=utf-8',
  });
}, 'GET');

app.api('/api/themes', (data) => {
  const errResp = (status, msg) =>
    new Response(JSON.stringify({ error: msg }), { status, contentType: 'application/json' });

  const css = typeof data.css === 'string' ? data.css : '';
  if (!css || css.length > MAX_THEME_BYTES) {
    return errResp(400, 'CSS must be non-empty and under 128 KB');
  }

  const rawBase = basename(String(data.name || 'custom-theme')).replace(/\.css$/i, '');
  let clean = rawBase
    .replace(/[^a-z0-9._ -]/gi, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/\s+/g, '-')
    .slice(0, 56);
  if (!clean) clean = 'custom-theme';
  const file = `${clean}.css`;
  if (!isSafeThemeName(file)) {
    return errResp(400, 'Invalid theme name');
  }

  mkdirSync(THEMES_DIR, { recursive: true });
  const themeTarget = join(THEMES_DIR, file);
  if (existsSync(themeTarget) && lstatSync(themeTarget).isSymbolicLink()) {
    return errResp(403, 'Refusing to overwrite symlink');
  }
  writeFileSync(themeTarget, css, 'utf-8');
  return {
    id: `custom:${file}`,
    file,
    label: humanThemeLabel(file),
  };
}, 'POST');

app.run();
