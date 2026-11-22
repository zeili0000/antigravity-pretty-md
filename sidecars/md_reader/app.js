(() => {
  const POLL_MS = 2000;
  const THEME_KEY = 'pretty-md:theme';
  const FONT_KEY = 'pretty-md:font';
  const FONT_SCALE_KEY = 'pretty-md:fontScale';
  const WIDTH_KEY = 'pretty-md:width';
  const PIN_KEY = 'pretty-md:pinned';
  const CHECK_KEY_PREFIX = 'pretty-md:checks:';
  const FOLD_KEY_PREFIX = 'pretty-md:folded:';

  const VALID_THEMES = new Set(['ochre', 'gruvbox-dark', 'catppuccin-mocha']);

  function resolveInitialTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (!saved) return 'ochre';
    if (VALID_THEMES.has(saved)) return saved;
    if (saved.startsWith('custom:') && saved.length > 7) return saved;
    return 'ochre';
  }

  function resolveInitialScale() {
    const raw = Number(localStorage.getItem(FONT_SCALE_KEY));
    return Number.isFinite(raw) && raw >= 0.85 && raw <= 1.35 ? raw : 1;
  }

  const $ = (id) => document.getElementById(id);
  const appEl = $('app');
  const readProgress = $('read-progress');
  const topbarTrigger = $('topbar-trigger');
  const topbarShell = $('topbar-shell');
  const fileSelect = $('file-select');
  const tocBtn = $('toc-btn');
  const settingsBtn = $('settings-btn');

  const fileInput = $('file-input');
  const themeFileInput = $('theme-file-input');
  const customThemeStyle = $('custom-theme-style');

  const settingsPopover = $('settings-popover');
  const themeSwatches = $('theme-swatches');
  const addThemeBtn = $('add-theme-btn');
  const fontSerifBtn = $('font-serif-btn');
  const fontSansBtn = $('font-sans-btn');
  const fontDecBtn = $('font-dec-btn');
  const fontResetBtn = $('font-reset-btn');
  const fontIncBtn = $('font-inc-btn');
  const barAutohideBtn = $('bar-autohide-btn');
  const barPinnedBtn = $('bar-pinned-btn');
  const widthNormalBtn = $('width-normal-btn');
  const widthWideBtn = $('width-wide-btn');
  const openLibraryBtn = $('open-library-btn');
  const openFindBtn = $('open-find-btn');
  const editModeBtn = $('edit-mode-btn');
  const openBtn = $('open-btn');
  const emptyOpenBtn = $('empty-open-btn');
  const printBtn = $('print-btn');
  const copyMdBtn = $('copy-md-btn');
  const archiveSaveBtn = $('archive-save-btn');
  const archiveDirInput = $('archive-dir-input');
  const archiveDirSave = $('archive-dir-save');
  const helpBtn = $('help-btn');

  const tocDrawer = $('toc-drawer');
  const foldAllBtn = $('fold-all-btn');
  const expandAllBtn = $('expand-all-btn');
  const tocClose = $('toc-close');
  const tocList = $('toc-list');

  const findBar = $('find-bar');
  const findInput = $('find-input');
  const findCount = $('find-count');
  const findPrev = $('find-prev');
  const findNext = $('find-next');
  const findClose = $('find-close');

  const toastEl = $('toast');
  const docMeta = $('doc-meta');
  const metaBadge = $('meta-badge');
  const metaName = $('meta-name');
  const metaStats = $('meta-stats');
  const frontmatterCard = $('frontmatter-card');
  const emptyState = $('empty-state');
  const docEl = $('doc');

  const editorShell = $('editor-shell');
  const editFileLabel = $('edit-file-label');
  const editStatus = $('edit-status');
  const editCancelBtn = $('edit-cancel-btn');
  const editSaveBtn = $('edit-save-btn');
  const sourceTextarea = $('source-textarea');

  const libraryModal = $('library-modal');
  const libSearch = $('lib-search');
  const libClose = $('lib-close');
  const libTags = $('lib-tags');
  const libList = $('lib-list');
  const libScopeBtns = [...document.querySelectorAll('.lib-scope-btn')];

  const helpModal = $('help-modal');
  const helpClose = $('help-close');

  const mermaidModal = $('mermaid-modal');
  const mermaidModalTitle = $('mermaid-modal-title');
  const mermaidModalBody = $('mermaid-modal-body');
  const mermaidModalInner = $('mermaid-modal-inner');
  const mermaidZoomIn = $('mermaid-zoom-in');
  const mermaidZoomOut = $('mermaid-zoom-out');
  const mermaidZoomFit = $('mermaid-zoom-fit');
  const mermaidModalClose = $('mermaid-modal-close');

  const params = new URLSearchParams(location.search);
  const state = {
    theme: resolveInitialTheme(),
    customThemes: [],
    font: localStorage.getItem(FONT_KEY) === 'sans' ? 'sans' : 'serif',
    fontScale: resolveInitialScale(),
    width: localStorage.getItem(WIDTH_KEY) === 'wide' ? 'wide' : 'normal',
    pinned: localStorage.getItem(PIN_KEY) === '1',
    triggerInside: false,
    shellInside: false,
    hideTimer: null,
    workspaceUris: [],
    diskFiles: [],
    pinnedLibraryFiles: [],
    droppedFiles: [],
    knownArtifactPaths: new Set(),
    hasInitializedPoll: false,
    selectedKey: '',
    currentDocKey: '',
    renderedMtime: null,
    renderedContent: '',
    renderedTitle: '',
    renderedBadge: '',
    editing: false,
    dragDepth: 0,
    pollTimer: null,
    mermaidCounter: 0,
    modalScale: 1,
    toastTimer: null,
    scrollRaf: 0,
    findHits: [],
    findIdx: -1,
    libDocs: [],
    libFiltered: [],
    libScope: 'all',
    libTag: '',
    libSelectedIdx: 0,
    navBack: [],
    navForward: [],
  };

  function conversationId() {
    return window.sidecar?.conversationId || params.get('conversationId') || '';
  }

  async function apiGet(url) {
    const fetcher = window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : fetch;
    const res = await fetcher(url, { method: 'GET' });
    if (!res.ok) throw new Error(`${url} (${res.status})`);
    return res;
  }

  async function postJson(url, payload) {
    const fetcher = window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : fetch;
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`${url} (${res.status}): ${msg}`);
    }
    return res.json();
  }

  function showToast(msg, ms = 2400) {
    clearTimeout(state.toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    state.toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Sidecar iframes often lack clipboard-write permission policy; fall through to execCommand.
      }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    let ok = false;
    try {
      ta.focus({ preventScroll: true });
      ta.select();
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    } finally {
      ta.remove();
    }
    if (!ok) throw new Error('Clipboard copy blocked');
    return true;
  }

  // ---------- Theme, Typography, Size, Width, Top Bar ----------
  function syncBodyOverrides() {
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue('--pm-bg').trim();
    const fg = styles.getPropertyValue('--pm-fg').trim();
    if (bg) document.body.style.setProperty('background', bg, 'important');
    if (fg) document.body.style.setProperty('color', fg, 'important');
  }

  function isDarkBackground() {
    if (state.theme === 'catppuccin-mocha' || state.theme === 'gruvbox-dark') return true;
    if (VALID_THEMES.has(state.theme)) return false;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--pm-bg, #f1e6ce)';
    document.documentElement.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const nums = (c.match(/[\d.]+/g) || []).map(Number);
    if (nums.length < 3) return false;
    const scale = c.startsWith('color(') ? 1 : 255;
    const [r, g, b] = nums.slice(0, 3).map((v) => v / scale);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
  }

  function themePaletteSnapshot() {
    const isDark = isDarkBackground();
    const styles = getComputedStyle(document.documentElement);
    return {
      isDark,
      bg: styles.getPropertyValue('--pm-surface').trim() || (isDark ? '#32302f' : '#f8f1e1'),
      surfaceAlt: styles.getPropertyValue('--pm-surface-alt').trim() || (isDark ? '#3c3836' : '#eadbbf'),
      fg: styles.getPropertyValue('--pm-fg').trim() || (isDark ? '#ebdbb2' : '#2a2118'),
      fgMuted: styles.getPropertyValue('--pm-fg-muted').trim() || (isDark ? '#bdae93' : '#6d5b47'),
      accent: styles.getPropertyValue('--pm-accent').trim() || '#a45914',
      border: styles.getPropertyValue('--pm-border-strong').trim() || '#c6ae81',
    };
  }

  function mermaidThemeConfig() {
    const p = themePaletteSnapshot();
    return {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: p.isDark ? 'dark' : 'base',
      fontSize: 15,
      flowchart: {
        htmlLabels: true,
        padding: 16,
        nodeSpacing: 38,
        rankSpacing: 46,
        useMaxWidth: false,
      },
      themeVariables: {
        primaryColor: p.surfaceAlt,
        primaryTextColor: p.fg,
        primaryBorderColor: p.accent,
        lineColor: p.accent,
        secondaryColor: p.bg,
        tertiaryColor: p.bg,
        textColor: p.fg,
        nodeBorder: p.border,
        mainBkg: p.surfaceAlt,
        fontSize: '15px',
        fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    };
  }

  function vegaThemeConfig() {
    const p = themePaletteSnapshot();
    return {
      background: 'transparent',
      title: { color: p.fg, subtitleColor: p.fgMuted, font: 'Plus Jakarta Sans, sans-serif' },
      axis: {
        domainColor: p.border,
        gridColor: p.border,
        gridOpacity: 0.45,
        tickColor: p.border,
        labelColor: p.fgMuted,
        titleColor: p.fg,
        labelFont: 'Plus Jakarta Sans, sans-serif',
        titleFont: 'Plus Jakarta Sans, sans-serif',
      },
      legend: {
        labelColor: p.fg,
        titleColor: p.fg,
        labelFont: 'Plus Jakarta Sans, sans-serif',
        titleFont: 'Plus Jakarta Sans, sans-serif',
      },
      view: { stroke: p.border },
      mark: { color: p.accent },
      range: {
        category: [p.accent, '#3b7a6b', '#4d76a8', '#b85348', '#8d64a8', '#c2921e'],
      },
    };
  }

  const BUILTIN_THEMES = [
    { value: 'ochre', label: 'Ochre Paper', bg: '#f1e6ce', accent: '#a45914' },
    { value: 'gruvbox-dark', label: 'Gruvbox Dark', bg: '#282828', accent: '#fe8019' },
    { value: 'catppuccin-mocha', label: 'Catppuccin Mocha', bg: '#1e1e2e', accent: '#fab387' },
  ];

  function populateThemeSwatches() {
    themeSwatches.innerHTML = '';
    const addSwatch = (id, label, dotBg, dotBorder) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-swatch-btn' + (state.theme === id ? ' active' : '');
      btn.setAttribute('aria-pressed', String(state.theme === id));

      const dot = document.createElement('span');
      dot.className = 'swatch-dot';
      dot.style.background = dotBg;
      if (dotBorder) dot.style.borderColor = dotBorder;

      const text = document.createElement('span');
      text.textContent = label;

      btn.appendChild(dot);
      btn.appendChild(text);
      btn.addEventListener('click', () => applyTheme(id));
      themeSwatches.appendChild(btn);
    };

    for (const item of BUILTIN_THEMES) {
      addSwatch(item.value, item.label, `linear-gradient(135deg, ${item.bg} 55%, ${item.accent} 55%)`, item.accent);
    }
    for (const ct of state.customThemes) {
      addSwatch(ct.id, ct.label, 'linear-gradient(135deg, var(--pm-surface-alt) 50%, var(--pm-accent) 50%)');
    }
  }

  async function refreshThemes() {
    try {
      const res = await apiGet('/api/themes');
      const data = await res.json();
      state.customThemes = Array.isArray(data.themes) ? data.themes : [];
    } catch {
      state.customThemes = [];
    }
    populateThemeSwatches();
  }

  async function applyTheme(theme) {
    if (typeof theme === 'string' && theme.startsWith('custom:')) {
      const fname = theme.slice('custom:'.length);
      try {
        const res = await apiGet(`/api/theme?file=${encodeURIComponent(fname)}`);
        const cssText = await res.text();
        customThemeStyle.textContent = cssText;
        state.theme = theme;
        localStorage.setItem(THEME_KEY, state.theme);
        document.documentElement.dataset.readerTheme = state.theme;
        populateThemeSwatches();
        syncBodyOverrides();
        reRenderMermaidNodes();
        reRenderVegaPlots();
        return;
      } catch {
        // Fallback below
      }
    }

    customThemeStyle.textContent = '';
    state.theme = VALID_THEMES.has(theme) ? theme : 'ochre';
    localStorage.setItem(THEME_KEY, state.theme);
    document.documentElement.dataset.readerTheme = state.theme;
    populateThemeSwatches();
    syncBodyOverrides();
    reRenderMermaidNodes();
    reRenderVegaPlots();
  }

  function applyFont(font) {
    state.font = font === 'sans' ? 'sans' : 'serif';
    localStorage.setItem(FONT_KEY, state.font);
    document.documentElement.dataset.font = state.font;
    const isSerif = state.font === 'serif';
    fontSerifBtn.classList.toggle('active', isSerif);
    fontSerifBtn.setAttribute('aria-pressed', String(isSerif));
    fontSansBtn.classList.toggle('active', !isSerif);
    fontSansBtn.setAttribute('aria-pressed', String(!isSerif));
  }

  function applyFontScale(scale) {
    const clamped = Math.min(1.35, Math.max(0.85, Math.round(scale * 20) / 20));
    state.fontScale = clamped;
    localStorage.setItem(FONT_SCALE_KEY, String(clamped));
    document.documentElement.style.setProperty('--pm-font-scale', String(clamped));
    fontResetBtn.textContent = `${Math.round(clamped * 100)}%`;
  }

  function applyWidth(width) {
    state.width = width === 'wide' ? 'wide' : 'normal';
    localStorage.setItem(WIDTH_KEY, state.width);
    document.documentElement.dataset.width = state.width;
    const isWide = state.width === 'wide';
    widthNormalBtn.classList.toggle('active', !isWide);
    widthNormalBtn.setAttribute('aria-pressed', String(!isWide));
    widthWideBtn.classList.toggle('active', isWide);
    widthWideBtn.setAttribute('aria-pressed', String(isWide));
  }

  function applyPinned(pinned) {
    state.pinned = Boolean(pinned);
    localStorage.setItem(PIN_KEY, state.pinned ? '1' : '0');
    appEl.classList.toggle('is-pinned', state.pinned);
    barAutohideBtn.classList.toggle('active', !state.pinned);
    barAutohideBtn.setAttribute('aria-pressed', String(!state.pinned));
    barPinnedBtn.classList.toggle('active', state.pinned);
    barPinnedBtn.setAttribute('aria-pressed', String(state.pinned));
    if (state.pinned) {
      setBarRevealed(true);
    } else {
      scheduleHide();
    }
  }

  function setBarRevealed(revealed) {
    clearTimeout(state.hideTimer);
    topbarShell.classList.toggle('is-revealed', revealed);
  }

  function hasOpenPopover() {
    return (
      !tocDrawer.classList.contains('hidden') ||
      !settingsPopover.classList.contains('hidden') ||
      !findBar.classList.contains('hidden')
    );
  }

  function scheduleHide() {
    clearTimeout(state.hideTimer);
    if (state.pinned) return;
    state.hideTimer = setTimeout(() => {
      if (
        state.pinned ||
        state.triggerInside ||
        state.shellInside ||
        topbarShell.contains(document.activeElement) ||
        hasOpenPopover()
      ) {
        return;
      }
      topbarShell.classList.remove('is-revealed');
    }, 200);
  }

  topbarTrigger.addEventListener('mouseenter', () => {
    state.triggerInside = true;
    setBarRevealed(true);
  });
  topbarTrigger.addEventListener('mouseleave', () => {
    state.triggerInside = false;
    scheduleHide();
  });
  topbarShell.addEventListener('mouseenter', () => {
    state.shellInside = true;
    setBarRevealed(true);
  });
  topbarShell.addEventListener('mouseleave', () => {
    state.shellInside = false;
    scheduleHide();
  });
  topbarShell.addEventListener('focusin', () => setBarRevealed(true));
  topbarShell.addEventListener('focusout', () => scheduleHide());

  addThemeBtn.addEventListener('click', () => themeFileInput.click());
  themeFileInput.addEventListener('change', () => {
    const file = themeFileInput.files?.[0];
    themeFileInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const css = String(reader.result || '');
        const saved = await postJson('/api/themes', { name: file.name, css });
        await refreshThemes();
        await applyTheme(saved.id);
        showToast(`Theme "${saved.label}" added`);
      } catch (err) {
        showToast('Could not save theme CSS');
        console.warn('Theme upload failed:', err);
      }
    };
    reader.readAsText(file);
  });

  fontSerifBtn.addEventListener('click', () => applyFont('serif'));
  fontSansBtn.addEventListener('click', () => applyFont('sans'));
  fontDecBtn.addEventListener('click', () => applyFontScale(state.fontScale - 0.05));
  fontResetBtn.addEventListener('click', () => applyFontScale(1));
  fontIncBtn.addEventListener('click', () => applyFontScale(state.fontScale + 0.05));
  widthNormalBtn.addEventListener('click', () => applyWidth('normal'));
  widthWideBtn.addEventListener('click', () => applyWidth('wide'));
  barAutohideBtn.addEventListener('click', () => applyPinned(false));
  barPinnedBtn.addEventListener('click', () => applyPinned(true));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      populateThemeSwatches();
      if (VALID_THEMES.has(state.theme)) applyTheme(state.theme);
      applyFont(state.font);
      applyFontScale(state.fontScale);
      applyWidth(state.width);
      applyPinned(state.pinned);
    });
  } else {
    populateThemeSwatches();
    if (VALID_THEMES.has(state.theme)) applyTheme(state.theme);
    applyFont(state.font);
    applyFontScale(state.fontScale);
    applyWidth(state.width);
    applyPinned(state.pinned);
  }

  // ---------- Outline & Aa Settings Popovers ----------
  function setTocOpen(open) {
    if (open) setSettingsOpen(false);
    tocDrawer.classList.toggle('hidden', !open);
    tocBtn.setAttribute('aria-expanded', String(open));
    tocBtn.classList.toggle('active', open);
    if (open) setBarRevealed(true);
    else scheduleHide();
  }

  function setSettingsOpen(open) {
    if (open && !tocDrawer.classList.contains('hidden')) {
      tocDrawer.classList.add('hidden');
      tocBtn.setAttribute('aria-expanded', 'false');
      tocBtn.classList.remove('active');
    }
    settingsPopover.classList.toggle('hidden', !open);
    settingsBtn.setAttribute('aria-expanded', String(open));
    settingsBtn.classList.toggle('active', open);
    if (open) setBarRevealed(true);
    else scheduleHide();
  }

  tocBtn.addEventListener('click', (e) => {
    setTocOpen(tocDrawer.classList.contains('hidden'));
    if (e.detail > 0) tocBtn.blur();
  });
  tocClose.addEventListener('click', () => setTocOpen(false));

  settingsBtn.addEventListener('click', (e) => {
    setSettingsOpen(settingsPopover.classList.contains('hidden'));
    if (e.detail > 0) settingsBtn.blur();
  });

  document.addEventListener('click', (e) => {
    if (!settingsPopover.classList.contains('hidden')) {
      if (!settingsPopover.contains(e.target) && !settingsBtn.contains(e.target)) {
        setSettingsOpen(false);
      }
    }
    if (!tocDrawer.classList.contains('hidden')) {
      if (!tocDrawer.contains(e.target) && !tocBtn.contains(e.target)) {
        setTocOpen(false);
      }
    }
  });

  for (const sub of settingsPopover.querySelectorAll('.aa-submenu')) {
    sub.addEventListener('toggle', () => {
      if (sub.open) sub.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  // ---------- Collapsible H2 Chapters + Scroll Progress & Scrollspy ----------
  function loadFoldedIds(docKey) {
    try {
      const arr = JSON.parse(localStorage.getItem(FOLD_KEY_PREFIX + docKey) || '[]');
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveFoldedIds(docKey) {
    if (!docKey) return;
    const ids = [...docEl.querySelectorAll('h2.is-collapsible.is-collapsed')].map((h) => h.id).filter(Boolean);
    try {
      localStorage.setItem(FOLD_KEY_PREFIX + docKey, JSON.stringify(ids));
    } catch {
      // ignore quota error
    }
  }

  function setSectionCollapsed(h2, body, collapsed) {
    h2.classList.toggle('is-collapsed', collapsed);
    body.classList.toggle('is-collapsed', collapsed);
  }

  function enhanceCollapsibleSections(root, docKey) {
    const foldedSet = loadFoldedIds(docKey);
    const h2s = [...root.querySelectorAll('h2')];
    for (const h2 of h2s) {
      const body = document.createElement('div');
      body.className = 'section-body';
      const toWrap = [];
      let cur = h2.nextElementSibling;
      while (cur && cur.tagName !== 'H1' && cur.tagName !== 'H2' && !cur.classList.contains('footnotes')) {
        toWrap.push(cur);
        cur = cur.nextElementSibling;
      }
      if (!toWrap.length) continue;

      h2.parentNode.insertBefore(body, toWrap[0]);
      for (const el of toWrap) body.appendChild(el);

      h2.classList.add('is-collapsible');
      const pill = document.createElement('span');
      pill.className = 'section-folded-pill';
      pill.textContent = 'folded';
      const chev = document.createElement('span');
      chev.className = 'section-toggle-icon';
      chev.setAttribute('aria-hidden', 'true');
      chev.textContent = '▾';
      h2.appendChild(pill);
      h2.appendChild(chev);

      if (h2.id && foldedSet.has(h2.id)) {
        setSectionCollapsed(h2, body, true);
      }

      h2.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        const next = !h2.classList.contains('is-collapsed');
        setSectionCollapsed(h2, body, next);
        saveFoldedIds(docKey);
        updateScrollUi();
      });
    }
  }

  function setAllSectionsCollapsed(collapsed) {
    for (const h2 of docEl.querySelectorAll('h2.is-collapsible')) {
      const body = h2.nextElementSibling;
      if (body?.classList.contains('section-body')) {
        setSectionCollapsed(h2, body, collapsed);
      }
    }
    saveFoldedIds(state.currentDocKey);
    updateScrollUi();
  }

  foldAllBtn.addEventListener('click', () => setAllSectionsCollapsed(true));
  expandAllBtn.addEventListener('click', () => setAllSectionsCollapsed(false));

  function ensureElementVisible(el) {
    const body = el.closest('.section-body.is-collapsed');
    if (body) {
      const h2 = body.previousElementSibling;
      if (h2?.classList.contains('is-collapsible')) {
        setSectionCollapsed(h2, body, false);
        saveFoldedIds(state.currentDocKey);
      }
    }
    let det = el.closest('details:not([open])');
    while (det) {
      det.open = true;
      det = det.parentElement?.closest('details:not([open])') || null;
    }
  }

  function updateScrollUi() {
    if (state.editing || !docEl.innerHTML) {
      readProgress.style.width = '0%';
      return;
    }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const pct = maxScroll > 20 ? Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100)) : 0;
    readProgress.style.width = `${pct.toFixed(1)}%`;

    const headings = [...docEl.querySelectorAll('h1[id], h2[id], h3[id]')].filter((h) => h.offsetParent !== null);
    let activeId = headings[0]?.id || '';
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= 100) {
        activeId = h.id;
      } else {
        break;
      }
    }
    for (const li of tocList.querySelectorAll('.toc-item')) {
      const a = li.querySelector('a');
      li.classList.toggle('is-active', Boolean(activeId && a?.getAttribute('href') === `#${activeId}`));
    }
  }

  window.addEventListener(
    'scroll',
    () => {
      if (state.scrollRaf) return;
      state.scrollRaf = requestAnimationFrame(() => {
        state.scrollRaf = 0;
        updateScrollUi();
      });
    },
    { passive: true }
  );

  // ---------- YAML Frontmatter ----------
  function extractFrontmatter(source) {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match || !window.jsyaml?.load) return { meta: null, body: source };
    try {
      const parsed = window.jsyaml.load(match[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { meta: parsed, body: source.slice(match[0].length) };
      }
    } catch {
      // Ignore invalid YAML
    }
    return { meta: null, body: source };
  }

  function renderFrontmatterCard(meta) {
    if (!meta) {
      frontmatterCard.classList.add('hidden');
      frontmatterCard.innerHTML = '';
      return;
    }

    const title = typeof meta.title === 'string' ? meta.title.trim() : '';
    const summary =
      typeof meta.summary === 'string'
        ? meta.summary.trim()
        : typeof meta.description === 'string'
        ? meta.description.trim()
        : '';

    let dateStr = '';
    if (meta.date instanceof Date && !Number.isNaN(meta.date.valueOf())) {
      dateStr = meta.date.toISOString().slice(0, 10);
    } else if (typeof meta.date === 'string' || typeof meta.date === 'number') {
      dateStr = String(meta.date).trim();
    }
    const author = typeof meta.author === 'string' ? meta.author.trim() : '';

    let tags = [];
    if (Array.isArray(meta.tags)) {
      tags = meta.tags.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof meta.tags === 'string') {
      tags = meta.tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    if (!title && !summary && !dateStr && !author && !tags.length) {
      frontmatterCard.classList.add('hidden');
      frontmatterCard.innerHTML = '';
      return;
    }

    frontmatterCard.innerHTML = '';
    if (title) {
      const h = document.createElement('div');
      h.className = 'fm-title';
      h.textContent = title;
      frontmatterCard.appendChild(h);
    }
    if (summary) {
      const p = document.createElement('p');
      p.className = 'fm-summary';
      p.textContent = summary;
      frontmatterCard.appendChild(p);
    }
    if (dateStr || author || tags.length) {
      const footer = document.createElement('div');
      footer.className = 'fm-footer';
      if (dateStr) {
        const span = document.createElement('span');
        span.className = 'fm-meta-item';
        span.textContent = dateStr;
        footer.appendChild(span);
      }
      if (author) {
        const span = document.createElement('span');
        span.className = 'fm-meta-item';
        span.textContent = dateStr ? `· ${author}` : author;
        footer.appendChild(span);
      }
      if (tags.length) {
        const tagList = document.createElement('div');
        tagList.className = 'fm-tags';
        for (const tag of tags) {
          const pill = document.createElement('span');
          pill.className = 'fm-tag';
          pill.textContent = `#${tag}`;
          tagList.appendChild(pill);
        }
        footer.appendChild(tagList);
      }
      frontmatterCard.appendChild(footer);
    }
    frontmatterCard.classList.remove('hidden');
  }

  // ---------- Markdown + KaTeX + Footnotes + Highlights + Callouts + Checklists ----------
  function preprocessMarkdown(source) {
    const codeBlocks = [];
    const inlineCodes = [];
    const mathItems = [];

    let text = source.replace(/(^|\n)([ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\3[ \t]*)(?=\n|$)/g, (m, lead, block) => {
      const idx = codeBlocks.push(block) - 1;
      return `${lead}@@PRETTYMD_CODEBLOCK_${idx}@@`;
    });

    text = text.replace(/(`+)([\s\S]*?)\1/g, (m) => {
      const idx = inlineCodes.push(m) - 1;
      return `@@PRETTYMD_INLINECODE_${idx}@@`;
    });

    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
      const idx = mathItems.push({ expr: expr.trim(), display: true }) - 1;
      return `\n\n@@PRETTYMD_MATHBLOCK_${idx}@@\n\n`;
    });
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, expr) => {
      const idx = mathItems.push({ expr: expr.trim(), display: true }) - 1;
      return `\n\n@@PRETTYMD_MATHBLOCK_${idx}@@\n\n`;
    });

    text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, expr) => {
      const idx = mathItems.push({ expr: expr.trim(), display: false }) - 1;
      return `@@PRETTYMD_MATHINLINE_${idx}@@`;
    });
    text = text.replace(/(^|[^\\$])\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s|\\)\$(?!\d)/g, (m, prefix, expr) => {
      const trimmed = expr.trim();
      if (!trimmed || /^\d+(?:[.,]\d+)?$/.test(trimmed)) return m;
      const idx = mathItems.push({ expr: trimmed, display: false }) - 1;
      return `${prefix}@@PRETTYMD_MATHINLINE_${idx}@@`;
    });

    const footnoteDefs = new Map();
    const lines = text.split(/\r?\n/);
    const keptLines = [];
    for (let i = 0; i < lines.length; i++) {
      const defMatch = lines[i].match(/^\[\^([A-Za-z0-9_-]+)\]:[ \t]*(.*)$/);
      if (defMatch) {
        const id = defMatch[1];
        const parts = [defMatch[2]];
        while (i + 1 < lines.length && /^(?: {2,}|\t)/.test(lines[i + 1])) {
          i++;
          parts.push(lines[i].replace(/^(?: {2,4}|\t)/, ''));
        }
        footnoteDefs.set(id, parts.join('\n').trim());
      } else {
        keptLines.push(lines[i]);
      }
    }
    text = keptLines.join('\n');

    const footnoteOrder = [];
    const footnoteMap = new Map();
    const refCounts = new Map();
    text = text.replace(/\[\^([A-Za-z0-9_-]+)\]/g, (m, id) => {
      if (!footnoteDefs.has(id)) return m;
      if (!footnoteMap.has(id)) {
        const num = footnoteOrder.length + 1;
        footnoteMap.set(id, { num, raw: footnoteDefs.get(id), refs: [] });
        footnoteOrder.push(id);
      }
      const n = (refCounts.get(id) || 0) + 1;
      refCounts.set(id, n);
      const refId = `fnref-${id}-${n}`;
      footnoteMap.get(id).refs.push(refId);
      const entry = footnoteMap.get(id);
      return `<sup class="fn-ref" id="${refId}"><a href="#fn-${id}">[${entry.num}]</a></sup>`;
    });

    for (const [id, raw] of footnoteDefs.entries()) {
      if (!footnoteMap.has(id)) {
        const num = footnoteOrder.length + 1;
        footnoteMap.set(id, { num, raw, refs: [] });
        footnoteOrder.push(id);
      }
    }

    text = text.replace(/(^|[^\\])==([^=\n]+?)==/g, '$1<mark>$2</mark>');

    // Obsidian wikilinks: [[target]] or [[target|label]] or [[target#heading|label]] (ignore ![[embeds]])
    text = text.replace(/(^|[^!\\])\[\[([^\]\n]+?)\]\]/g, (m, prefix, inner) => {
      const pipeIdx = inner.indexOf('|');
      const rawTarget = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
      const rawLabel = (pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : rawTarget).trim();
      if (!rawTarget) return m;
      const escAttr = rawTarget.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const escLabel = rawLabel.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `${prefix}<a href="#" class="wikilink" data-wikilink="${escAttr}">${escLabel}</a>`;
    });

    text = text.replace(/@@PRETTYMD_INLINECODE_(\d+)@@/g, (_, i) => inlineCodes[Number(i)]);
    text = text.replace(/@@PRETTYMD_CODEBLOCK_(\d+)@@/g, (_, i) => codeBlocks[Number(i)]);

    const footnotes = footnoteOrder.map((id) => ({ id, ...footnoteMap.get(id) }));
    return { text, mathItems, footnotes };
  }

  function renderMathWrapper(expr, displayMode) {
    const el = document.createElement(displayMode ? 'div' : 'span');
    el.className = displayMode ? 'math-block' : 'math-inline';
    el.dataset.latex = expr;
    el.title = 'Click to copy LaTeX';
    if (window.katex?.renderToString) {
      try {
        el.innerHTML = window.katex.renderToString(expr, {
          displayMode,
          throwOnError: false,
          output: 'htmlAndMathml',
        });
        return el.outerHTML;
      } catch {
        // fallback below
      }
    }
    el.textContent = displayMode ? `$$${expr}$$` : `$${expr}$`;
    return el.outerHTML;
  }

  docEl.addEventListener('click', async (e) => {
    const linkEl = e.target.closest('a[href]');
    if (linkEl && docEl.contains(linkEl)) {
      const rawHref = (linkEl.getAttribute('href') || '').trim();
      const wikiTarget = linkEl.dataset.wikilink;

      if (wikiTarget) {
        e.preventDefault();
        const hashIdx = wikiTarget.indexOf('#');
        const target = (hashIdx >= 0 ? wikiTarget.slice(0, hashIdx) : wikiTarget).trim();
        const fragment = hashIdx >= 0 ? wikiTarget.slice(hashIdx + 1).trim() : '';
        if (!target && fragment) {
          pushNavHistory();
          scrollToFragment(fragment);
        } else {
          await resolveAndOpenMarkdownLink(target, fragment, true);
        }
        return;
      }

      if (rawHref.startsWith('#')) {
        const frag = rawHref.slice(1);
        if (frag) {
          e.preventDefault();
          pushNavHistory();
          scrollToFragment(frag);
        }
        return;
      }

      if (/^(?:https?:|mailto:|tel:)/i.test(rawHref)) {
        return;
      }

      const hashIdx = rawHref.indexOf('#');
      const pathPart = (hashIdx >= 0 ? rawHref.slice(0, hashIdx) : rawHref).trim();
      const rawFrag = hashIdx >= 0 ? rawHref.slice(hashIdx + 1).trim() : '';
      const fragment = /^L\d+(?:-L\d+)?$/i.test(rawFrag) ? '' : rawFrag;

      if (/^file:\/\//i.test(pathPart) || /\.(?:md|markdown)$/i.test(pathPart)) {
        e.preventDefault();
        await resolveAndOpenMarkdownLink(pathPart, fragment, false);
        return;
      }
    }

    const mathEl = e.target.closest('.math-inline, .math-block');
    if (!mathEl || !mathEl.dataset.latex) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
    try {
      await copyTextToClipboard(mathEl.dataset.latex);
      showToast('LaTeX copied');
    } catch {
      showToast('Could not copy LaTeX');
    }
  });

  function parseMarkdown(mdText) {
    const parser = window.marked;
    if (!parser?.parse) {
      const pre = document.createElement('pre');
      pre.textContent = mdText;
      return pre.outerHTML;
    }
    if (typeof parser.setOptions === 'function') {
      parser.setOptions({ gfm: true, breaks: false });
    }
    return parser.parse(mdText);
  }

  function sanitizeHtml(html) {
    if (window.DOMPurify?.sanitize) {
      return window.DOMPurify.sanitize(html, {
        RETURN_DOM_FRAGMENT: true,
        FORBID_TAGS: ['style', 'form', 'textarea', 'select', 'script', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['style'],
        ADD_ATTR: ['data-latex', 'data-wikilink', 'target'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      });
    }
    const tpl = document.createElement('template');
    tpl.textContent = String(html || '');
    return tpl.content;
  }

  const CALLOUT_ICONS = {
    note: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v3.6M8 5.1h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    tip: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2.2a4.3 4.3 0 0 0-2.5 7.8c.5.4.8.9.9 1.5h3.2c.1-.6.4-1.1.9-1.5A4.3 4.3 0 0 0 8 2.2zM6.5 13.5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    important: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2.3l5.7 9.9a1 1 0 0 1-.87 1.5H3.17a1 1 0 0 1-.87-1.5L8 2.3zM8 6.4v3.2M8 11.4h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warning: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2.3l5.7 9.9a1 1 0 0 1-.87 1.5H3.17a1 1 0 0 1-.87-1.5L8 2.3zM8 6.4v3.2M8 11.4h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    caution: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M5.4 2.2h5.2l3.2 3.2v5.2l-3.2 3.2H5.4l-3.2-3.2V5.4l3.2-3.2zM6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    example: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M3 8h10M3 11.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    question: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5"/><path d="M6.4 6.2a1.7 1.7 0 0 1 3.3.5c0 1.1-1.7 1.3-1.7 2.4M8 11.4h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    theorem: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3h10v2H9.5v8h-3V5H3V3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    lemma: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3.5 3.5h9l-4.5 4.5 4.5 4.5h-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    proof: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>',
  };
  const CHEVRON_SVG = '<svg class="callout-chevron" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function calloutClassFor(kind) {
    const k = kind.toLowerCase();
    if (k === 'info') return 'note';
    if (k === 'hint' || k === 'success') return 'tip';
    if (k === 'abstract' || k === 'summary' || k === 'tldr') return 'important';
    if (k === 'attention') return 'warning';
    if (k === 'danger' || k === 'error') return 'caution';
    if (k === 'faq' || k === 'quote') return 'question';
    if (k === 'proposition') return 'theorem';
    if (k === 'corollary' || k === 'definition') return 'lemma';
    return k;
  }

  function renderRichFragment(rawMd) {
    const { text, mathItems } = preprocessMarkdown(String(rawMd || '').trim());
    let html = parseMarkdown(text);
    html = html.replace(/<p>\s*@@PRETTYMD_MATHBLOCK_(\d+)@@\s*<\/p>/g, (_, i) => {
      const item = mathItems[Number(i)];
      return renderMathWrapper(item.expr, true);
    });
    html = html.replace(/@@PRETTYMD_MATHBLOCK_(\d+)@@/g, (_, i) => {
      const item = mathItems[Number(i)];
      return renderMathWrapper(item.expr, true);
    });
    html = html.replace(/@@PRETTYMD_MATHINLINE_(\d+)@@/g, (_, i) => {
      const item = mathItems[Number(i)];
      return renderMathWrapper(item.expr, false);
    });
    return sanitizeHtml(html);
  }

  function splitLiAtDoubleColon(li) {
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.includes('::')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('.katex, code, pre')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const hit = walker.nextNode();
    if (!hit) return null;
    const idx = hit.nodeValue.indexOf('::');
    const frontRange = document.createRange();
    frontRange.setStart(li, 0);
    frontRange.setEnd(hit, idx);
    const backRange = document.createRange();
    backRange.setStart(hit, idx + 2);
    backRange.setEnd(li, li.childNodes.length);

    const frontWrap = document.createElement('div');
    frontWrap.appendChild(frontRange.cloneContents());
    const backWrap = document.createElement('div');
    backWrap.appendChild(backRange.cloneContents());
    const frontHtml = frontWrap.innerHTML.trim();
    const backHtml = backWrap.innerHTML.trim();
    if (!frontHtml || !backHtml) return null;
    return { frontHtml, backHtml };
  }

  function extractFlashcardsFromCallout(bq) {
    const cards = [];
    for (const li of bq.querySelectorAll('li')) {
      const pair = splitLiAtDoubleColon(li);
      if (pair) cards.push(pair);
    }
    return cards;
  }

  function parseFlashcardsFenced(src) {
    const chunks = String(src || '')
      .replace(/\r\n/g, '\n')
      .split(/^\s*---+\s*$/m)
      .map((c) => c.trim())
      .filter(Boolean);

    let title = '';
    const cards = [];
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      if (lines.length === 1 && /^title\s*:/i.test(lines[0])) {
        title = lines[0].replace(/^title\s*:/i, '').trim();
        continue;
      }
      if (/^title\s*:/i.test(lines[0]) && !lines.some((l) => /^(?:Q|A)\s*:/i.test(l.trim()))) {
        title = lines[0].replace(/^title\s*:/i, '').trim();
        continue;
      }

      let mode = '';
      const qLines = [];
      const aLines = [];
      const inlinePairs = [];
      for (const rawLine of lines) {
        const line = rawLine;
        if (!mode && /^title\s*:/i.test(line.trim())) {
          title = line.trim().replace(/^title\s*:/i, '').trim();
          continue;
        }
        const qm = line.match(/^\s*Q\s*:\s?(.*)$/i);
        const am = line.match(/^\s*A\s*:\s?(.*)$/i);
        if (qm) {
          mode = 'q';
          if (qm[1]) qLines.push(qm[1]);
        } else if (am) {
          mode = 'a';
          if (am[1]) aLines.push(am[1]);
        } else if (mode === 'q') {
          qLines.push(line);
        } else if (mode === 'a') {
          aLines.push(line);
        } else if (line.includes('::')) {
          const clean = line.replace(/^\s*[-*+]\s+/, '');
          const pos = clean.indexOf('::');
          const f = clean.slice(0, pos).trim();
          const b = clean.slice(pos + 2).trim();
          if (f && b) inlinePairs.push({ frontMd: f, backMd: b });
        }
      }
      if (qLines.length && aLines.length) {
        cards.push({ frontMd: qLines.join('\n').trim(), backMd: aLines.join('\n').trim() });
      } else if (inlinePairs.length) {
        cards.push(...inlinePairs);
      }
    }
    return { title, cards };
  }

  function buildFlashcardsWidget(title, cards) {
    const wrap = document.createElement('section');
    wrap.className = 'study-widget fc-widget';

    const header = document.createElement('div');
    header.className = 'study-head';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'study-title-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'study-title';
    titleEl.textContent = title || 'Flashcards';
    const metaEl = document.createElement('span');
    metaEl.className = 'study-meta';
    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(metaEl);

    const actions = document.createElement('div');
    actions.className = 'study-head-actions';
    const shuffleBtn = document.createElement('button');
    shuffleBtn.type = 'button';
    shuffleBtn.className = 'code-copy';
    shuffleBtn.textContent = 'Shuffle';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'code-copy';
    resetBtn.textContent = 'Reset';
    actions.appendChild(shuffleBtn);
    actions.appendChild(resetBtn);
    header.appendChild(titleWrap);
    header.appendChild(actions);

    const progTrack = document.createElement('div');
    progTrack.className = 'study-prog-track';
    const progFill = document.createElement('div');
    progFill.className = 'study-prog-fill';
    progTrack.appendChild(progFill);

    const stage = document.createElement('div');
    stage.className = 'fc-stage';
    stage.tabIndex = 0;

    const foot = document.createElement('div');
    foot.className = 'fc-foot';

    wrap.appendChild(header);
    wrap.appendChild(progTrack);
    wrap.appendChild(stage);
    wrap.appendChild(foot);

    let queue = cards.map((_, i) => i);
    let mastered = 0;
    let flipped = false;

    function fillContent(container, card, side) {
      container.innerHTML = '';
      if (side === 'front') {
        if (card.frontHtml) container.appendChild(sanitizeHtml(card.frontHtml));
        else container.appendChild(renderRichFragment(card.frontMd));
      } else {
        if (card.backHtml) container.appendChild(sanitizeHtml(card.backHtml));
        else container.appendChild(renderRichFragment(card.backMd));
      }
    }

    function render() {
      const total = cards.length;
      const pct = total ? Math.round((mastered / total) * 100) : 0;
      progFill.style.width = `${pct}%`;

      if (!queue.length) {
        metaEl.textContent = `${total} / ${total} mastered`;
        stage.className = 'fc-stage fc-done';
        stage.innerHTML = '';
        const doneMsg = document.createElement('div');
        doneMsg.className = 'fc-done-msg';
        doneMsg.textContent = `Session complete — all ${total} cards reviewed.`;
        stage.appendChild(doneMsg);
        foot.innerHTML = '';
        const restartBtn = document.createElement('button');
        restartBtn.type = 'button';
        restartBtn.className = 'btn btn-primary';
        restartBtn.textContent = 'Study Again';
        restartBtn.addEventListener('click', reset);
        foot.appendChild(restartBtn);
        return;
      }

      const card = cards[queue[0]];
      metaEl.textContent = `${mastered} / ${total} mastered · ${queue.length} left`;
      stage.className = 'fc-stage' + (flipped ? ' is-flipped' : '');
      stage.innerHTML = '';

      const eyebrow = document.createElement('div');
      eyebrow.className = 'fc-eyebrow';
      eyebrow.textContent = flipped ? 'ANSWER' : 'QUESTION';
      const body = document.createElement('div');
      body.className = 'fc-body';
      fillContent(body, card, flipped ? 'back' : 'front');
      stage.appendChild(eyebrow);
      stage.appendChild(body);

      foot.innerHTML = '';
      if (!flipped) {
        const flipBtn = document.createElement('button');
        flipBtn.type = 'button';
        flipBtn.className = 'btn fc-flip-btn';
        flipBtn.textContent = 'Show Answer';
        flipBtn.addEventListener('click', () => {
          flipped = true;
          render();
        });
        foot.appendChild(flipBtn);
      } else {
        const againBtn = document.createElement('button');
        againBtn.type = 'button';
        againBtn.className = 'btn fc-again-btn';
        againBtn.textContent = 'Again';
        againBtn.addEventListener('click', () => {
          const cur = queue.shift();
          queue.push(cur);
          flipped = false;
          render();
        });
        const gotBtn = document.createElement('button');
        gotBtn.type = 'button';
        gotBtn.className = 'btn btn-primary fc-got-btn';
        gotBtn.textContent = 'Got it';
        gotBtn.addEventListener('click', () => {
          queue.shift();
          mastered++;
          flipped = false;
          render();
        });
        foot.appendChild(againBtn);
        foot.appendChild(gotBtn);
      }
    }

    function reset() {
      queue = cards.map((_, i) => i);
      mastered = 0;
      flipped = false;
      render();
    }

    function shuffle() {
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      flipped = false;
      render();
    }

    stage.addEventListener('click', (e) => {
      if (!queue.length) return;
      if (e.target.closest('.math-inline, .math-block, a, button')) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
      flipped = !flipped;
      render();
    });

    stage.addEventListener('keydown', (e) => {
      if (!queue.length) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        flipped = !flipped;
        render();
      }
    });

    shuffleBtn.addEventListener('click', shuffle);
    resetBtn.addEventListener('click', reset);

    render();
    return wrap;
  }

  function parseQuizFenced(src) {
    const chunks = String(src || '')
      .replace(/\r\n/g, '\n')
      .split(/^\s*---+\s*$/m)
      .map((c) => c.trim())
      .filter(Boolean);

    let title = '';
    const questions = [];
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      if (lines.length === 1 && /^title\s*:/i.test(lines[0])) {
        title = lines[0].replace(/^title\s*:/i, '').trim();
        continue;
      }

      const qLines = [];
      const options = [];
      const expLines = [];
      let inOptions = false;

      for (const line of lines) {
        if (!inOptions && !qLines.length && /^title\s*:/i.test(line.trim())) {
          title = line.trim().replace(/^title\s*:/i, '').trim();
          continue;
        }
        const optMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
        if (optMatch) {
          inOptions = true;
          options.push({ correct: optMatch[1].toLowerCase() === 'x', text: optMatch[2].trim() });
          continue;
        }
        const expMatch = line.match(/^\s*>\s?(.*)$/);
        if (inOptions && expMatch) {
          expLines.push(expMatch[1]);
          continue;
        }
        if (!inOptions) {
          const strippedQ = qLines.length === 0 ? line.replace(/^\s*Q\s*:\s?/i, '') : line;
          if (strippedQ.trim() || qLines.length) qLines.push(strippedQ);
        }
      }

      if (qLines.length && options.length >= 2 && options.some((o) => o.correct)) {
        questions.push({
          prompt: qLines.join('\n').trim(),
          options,
          explanation: expLines.join('\n').trim(),
          multi: options.filter((o) => o.correct).length > 1,
        });
      }
    }
    return { title, questions };
  }

  function buildQuizWidget(title, questions) {
    const wrap = document.createElement('section');
    wrap.className = 'study-widget quiz-widget';

    const header = document.createElement('div');
    header.className = 'study-head';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'study-title-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'study-title';
    titleEl.textContent = title || 'Quiz';
    const scoreEl = document.createElement('span');
    scoreEl.className = 'study-meta';
    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(scoreEl);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'code-copy';
    retryBtn.textContent = 'Retry';
    header.appendChild(titleWrap);
    header.appendChild(retryBtn);

    const list = document.createElement('div');
    list.className = 'quiz-list';

    wrap.appendChild(header);
    wrap.appendChild(list);

    let results = questions.map(() => null);

    function updateScore() {
      const answered = results.filter((r) => r !== null).length;
      const correct = results.filter((r) => r === true).length;
      scoreEl.textContent = answered
        ? `Score: ${correct} / ${questions.length}`
        : `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`;
    }

    function renderAll() {
      results = questions.map(() => null);
      list.innerHTML = '';

      questions.forEach((q, qIdx) => {
        const card = document.createElement('div');
        card.className = 'quiz-q';

        const promptEl = document.createElement('div');
        promptEl.className = 'quiz-prompt';
        const numSpan = document.createElement('span');
        numSpan.className = 'quiz-qnum';
        numSpan.textContent = `${qIdx + 1}.`;
        const promptBody = document.createElement('div');
        promptBody.className = 'quiz-prompt-body';
        promptBody.appendChild(renderRichFragment(q.prompt));
        promptEl.appendChild(numSpan);
        promptEl.appendChild(promptBody);
        card.appendChild(promptEl);

        if (q.multi) {
          const hint = document.createElement('div');
          hint.className = 'quiz-hint';
          hint.textContent = 'Select all that apply';
          card.appendChild(hint);
        }

        const optList = document.createElement('div');
        optList.className = 'quiz-options';
        const selected = new Set();
        let locked = false;

        const expEl = document.createElement('div');
        expEl.className = 'quiz-exp hidden';
        if (q.explanation) {
          expEl.appendChild(renderRichFragment(q.explanation));
        }

        const optBtns = q.options.map((opt, oIdx) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'quiz-opt';
          const marker = document.createElement('span');
          marker.className = 'quiz-marker';
          marker.textContent = q.multi ? '☐' : String.fromCharCode(65 + oIdx);
          const label = document.createElement('span');
          label.className = 'quiz-opt-label';
          label.appendChild(renderRichFragment(opt.text));
          btn.appendChild(marker);
          btn.appendChild(label);

          btn.addEventListener('click', (e) => {
            if (e.target.closest('.math-inline, .math-block')) return;
            if (locked) return;
            if (q.multi) {
              if (selected.has(oIdx)) {
                selected.delete(oIdx);
                btn.classList.remove('is-picked');
                marker.textContent = '☐';
              } else {
                selected.add(oIdx);
                btn.classList.add('is-picked');
                marker.textContent = '☑';
              }
            } else {
              selected.clear();
              selected.add(oIdx);
              evaluate();
            }
          });

          optList.appendChild(btn);
          return btn;
        });

        let checkBtn = null;
        if (q.multi) {
          checkBtn = document.createElement('button');
          checkBtn.type = 'button';
          checkBtn.className = 'btn btn-primary quiz-check-btn';
          checkBtn.textContent = 'Check Answer';
          checkBtn.addEventListener('click', () => {
            if (!locked && selected.size) evaluate();
          });
        }

        function evaluate() {
          locked = true;
          let allRight = true;
          q.options.forEach((opt, oIdx) => {
            const picked = selected.has(oIdx);
            const btn = optBtns[oIdx];
            btn.disabled = true;
            if (opt.correct) {
              btn.classList.add('is-correct');
              if (!picked) allRight = false;
            } else if (picked) {
              btn.classList.add('is-wrong');
              allRight = false;
            }
          });
          if (checkBtn) checkBtn.classList.add('hidden');
          if (q.explanation) expEl.classList.remove('hidden');
          results[qIdx] = allRight;
          updateScore();
        }

        card.appendChild(optList);
        if (checkBtn) card.appendChild(checkBtn);
        if (q.explanation) card.appendChild(expEl);
        list.appendChild(card);
      });

      updateScore();
    }

    retryBtn.addEventListener('click', renderAll);
    renderAll();
    return wrap;
  }

  function transformCallouts(root) {
    const quotes = [...root.querySelectorAll('blockquote')];
    for (const bq of quotes) {
      const firstP = bq.firstElementChild;
      if (!firstP || firstP.tagName !== 'P') continue;

      const rawText = firstP.textContent || '';
      const match = rawText.match(
        /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|HINT|SUCCESS|ABSTRACT|SUMMARY|TLDR|ATTENTION|DANGER|ERROR|EXAMPLE|QUESTION|FAQ|QUOTE|THEOREM|PROPOSITION|LEMMA|COROLLARY|DEFINITION|PROOF|FLASHCARDS|CARDS)\]([+-])?(?:[ \t]+([^\n]*))?/i
      );
      if (!match) continue;

      const rawType = match[1].toLowerCase();
      const fold = match[2] || '';
      const normType = calloutClassFor(rawType);
      const customTitle = (match[3] || '').trim();
      const titleText = customTitle || (rawType.charAt(0).toUpperCase() + rawType.slice(1));

      const html = firstP.innerHTML;
      const stripped = html.replace(/^\s*\[![a-z]+\][+-]?[^\n<]*(?:<br\s*\/?>|\n)?/i, '').trim();
      if (stripped) {
        firstP.innerHTML = stripped;
      } else {
        firstP.remove();
      }

      if (rawType === 'flashcards' || rawType === 'cards') {
        const cards = extractFlashcardsFromCallout(bq);
        if (cards.length) {
          bq.replaceWith(buildFlashcardsWidget(customTitle || 'Flashcards', cards));
          continue;
        }
      }

      const isFoldable = fold === '-' || fold === '+';
      const card = document.createElement(isFoldable ? 'details' : 'div');
      card.className = `callout callout-${normType}`;
      if (fold === '+') card.open = true;

      const titleEl = document.createElement(isFoldable ? 'summary' : 'div');
      titleEl.className = 'callout-title';
      titleEl.innerHTML = CALLOUT_ICONS[normType] || CALLOUT_ICONS.note;
      const titleSpan = document.createElement('span');
      titleSpan.textContent = titleText;
      titleEl.appendChild(titleSpan);
      if (isFoldable) {
        titleEl.insertAdjacentHTML('beforeend', CHEVRON_SVG);
      }

      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'callout-body';
      while (bq.firstChild) bodyDiv.appendChild(bq.firstChild);

      card.appendChild(titleEl);
      card.appendChild(bodyDiv);
      bq.replaceWith(card);
    }
  }

  function enhanceChecklists(root, docKey) {
    let savedChecks = {};
    try {
      savedChecks = JSON.parse(localStorage.getItem(CHECK_KEY_PREFIX + docKey) || '{}') || {};
    } catch {
      savedChecks = {};
    }

    const allInputs = [...root.querySelectorAll('li > input[type="checkbox"]')];
    allInputs.forEach((cb, idx) => {
      const li = cb.parentElement;
      li.classList.add('task-item');
      cb.disabled = false;

      if (Object.prototype.hasOwnProperty.call(savedChecks, String(idx))) {
        cb.checked = Boolean(savedChecks[String(idx)]);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'task-label';
      const toMove = [];
      for (const child of [...li.childNodes]) {
        if (child === cb) continue;
        if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === 'UL' || child.tagName === 'OL')) break;
        toMove.push(child);
      }
      if (toMove.length) {
        li.insertBefore(labelSpan, toMove[0]);
        for (const n of toMove) labelSpan.appendChild(n);
      }
      li.classList.toggle('is-checked', cb.checked);
    });

    const taskLists = new Set(allInputs.map((cb) => cb.closest('ul')).filter(Boolean));
    for (const ul of taskLists) {
      const directItems = [...ul.children].filter((c) => c.classList.contains('task-item'));
      if (directItems.length < 2) continue;

      const wrap = document.createElement('div');
      wrap.className = 'checklist-wrap';

      const prog = document.createElement('div');
      prog.className = 'checklist-progress';
      const progLabel = document.createElement('span');
      const track = document.createElement('div');
      track.className = 'checklist-track';
      const fill = document.createElement('div');
      fill.className = 'checklist-fill';
      track.appendChild(fill);
      prog.appendChild(progLabel);
      prog.appendChild(track);

      const updateProgress = () => {
        const boxes = directItems.map((li) => li.querySelector(':scope > input[type="checkbox"]')).filter(Boolean);
        const done = boxes.filter((b) => b.checked).length;
        const pct = boxes.length ? Math.round((done / boxes.length) * 100) : 0;
        progLabel.textContent = `${done} / ${boxes.length} completed`;
        fill.style.width = `${pct}%`;
      };

      updateProgress();
      ul.parentNode.insertBefore(wrap, ul);
      wrap.appendChild(prog);
      wrap.appendChild(ul);

      for (const li of directItems) {
        const cb = li.querySelector(':scope > input[type="checkbox"]');
        if (!cb) continue;
        cb.addEventListener('change', () => {
          li.classList.toggle('is-checked', cb.checked);
          const globalIdx = allInputs.indexOf(cb);
          if (globalIdx >= 0) {
            savedChecks[String(globalIdx)] = cb.checked;
            try {
              localStorage.setItem(CHECK_KEY_PREFIX + docKey, JSON.stringify(savedChecks));
            } catch {
              // ignore storage quota errors
            }
          }
          updateProgress();
        });
      }
    }
  }

  function enhanceTablesAndCode(root) {
    for (const table of [...root.querySelectorAll('table')]) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }

    for (const pre of [...root.querySelectorAll('pre')]) {
      const code = pre.querySelector('code');
      if (!code) continue;

      const langMatch = [...code.classList].find((c) => c.startsWith('language-'));
      const lang = langMatch ? langMatch.slice('language-'.length).toLowerCase() : '';

      if (lang === 'mermaid') {
        const src = code.textContent || '';
        const frame = document.createElement('div');
        frame.className = 'mermaid-frame';
        frame.dataset.mermaidSource = src;

        const header = document.createElement('div');
        header.className = 'mermaid-header';
        const label = document.createElement('span');
        label.textContent = 'Diagram';
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'code-copy';
        expandBtn.textContent = 'Expand';
        header.appendChild(label);
        header.appendChild(expandBtn);

        const stage = document.createElement('div');
        stage.className = 'mermaid-stage';
        stage.title = 'Click to expand diagram';
        const mDiv = document.createElement('div');
        mDiv.className = 'mermaid';
        mDiv.textContent = src;
        stage.appendChild(mDiv);

        const openDiagram = () => openGraphicModal(stage, 'Diagram');
        expandBtn.addEventListener('click', openDiagram);
        stage.addEventListener('click', openDiagram);

        frame.appendChild(header);
        frame.appendChild(stage);
        pre.replaceWith(frame);
        continue;
      }

      if (lang === 'flashcards' || lang === 'cards') {
        const parsed = parseFlashcardsFenced(code.textContent || '');
        if (parsed.cards.length) {
          pre.replaceWith(buildFlashcardsWidget(parsed.title || 'Flashcards', parsed.cards));
          continue;
        }
      }

      if (lang === 'quiz') {
        const parsed = parseQuizFenced(code.textContent || '');
        if (parsed.questions.length) {
          pre.replaceWith(buildQuizWidget(parsed.title || 'Quiz', parsed.questions));
          continue;
        }
      }

      if (lang === 'vega-lite' || lang === 'vl') {
        const src = code.textContent || '';
        const frame = document.createElement('div');
        frame.className = 'plot-frame';
        frame.dataset.vegaSpec = src;

        const header = document.createElement('div');
        header.className = 'plot-header';
        const label = document.createElement('span');
        label.textContent = 'Plot';
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'code-copy';
        expandBtn.textContent = 'Expand';
        header.appendChild(label);
        header.appendChild(expandBtn);

        const stage = document.createElement('div');
        stage.className = 'plot-stage';
        stage.title = 'Click to expand plot';
        const target = document.createElement('div');
        target.className = 'vega-target';
        stage.appendChild(target);

        const openPlot = () => openGraphicModal(stage, 'Interactive Plot');
        expandBtn.addEventListener('click', openPlot);
        stage.addEventListener('click', openPlot);

        frame.appendChild(header);
        frame.appendChild(stage);
        pre.replaceWith(frame);
        continue;
      }

      if (lang === 'diff') {
        const lines = (code.textContent || '').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
        code.innerHTML = '';
        for (const line of lines) {
          const span = document.createElement('span');
          if (line.startsWith('+') && !line.startsWith('+++')) span.className = 'diff-line-add';
          else if (line.startsWith('-') && !line.startsWith('---')) span.className = 'diff-line-del';
          else if (line.startsWith('@@')) span.className = 'diff-line-hunk';
          else span.style.display = 'block';
          span.textContent = line || ' ';
          code.appendChild(span);
        }
      } else if (window.hljs?.highlightElement) {
        try {
          window.hljs.highlightElement(code);
        } catch {
          // ignore unknown grammar
        }
      }

      const frame = document.createElement('div');
      frame.className = 'code-frame';
      const header = document.createElement('div');
      header.className = 'code-header';

      const langLabel = document.createElement('span');
      langLabel.textContent = lang || 'text';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'code-copy';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        try {
          await copyTextToClipboard(code.textContent || '');
          copyBtn.textContent = 'Copied';
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
          }, 1400);
        } catch {
          copyBtn.textContent = 'Failed';
        }
      });

      header.appendChild(langLabel);
      header.appendChild(copyBtn);
      pre.parentNode.insertBefore(frame, pre);
      frame.appendChild(header);
      frame.appendChild(pre);
    }
  }

  function appendFootnotesSection(root, footnotes) {
    if (!footnotes.length) return;
    const sec = document.createElement('section');
    sec.className = 'footnotes';
    const title = document.createElement('div');
    title.className = 'footnotes-title';
    title.textContent = 'Footnotes';
    sec.appendChild(title);

    const ol = document.createElement('ol');
    for (const fn of footnotes) {
      const li = document.createElement('li');
      li.id = `fn-${fn.id}`;
      const bodyHtml = parseMarkdown(fn.raw);
      li.appendChild(sanitizeHtml(bodyHtml));
      const targetP = li.lastElementChild?.tagName === 'P' ? li.lastElementChild : li;
      if (fn.refs.length) {
        const back = document.createElement('a');
        back.className = 'fn-back';
        back.href = `#${fn.refs[0]}`;
        back.textContent = '↩';
        back.title = 'Back to reference';
        targetP.appendChild(document.createTextNode(' '));
        targetP.appendChild(back);
      }
      ol.appendChild(li);
    }
    sec.appendChild(ol);
    root.appendChild(sec);
  }

  function buildOutline(root) {
    tocList.innerHTML = '';
    const seen = new Map();
    const headings = [...root.querySelectorAll('h1, h2, h3')];
    if (!headings.length) {
      const li = document.createElement('li');
      li.className = 'toc-empty';
      li.textContent = 'No headings in this document.';
      tocList.appendChild(li);
      return;
    }

    for (const h of headings) {
      const raw = (h.textContent || '').trim();
      if (!raw) continue;
      const base = raw.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, '-').replace(/^-|-$/g, '') || 'section';
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count}`;
      h.id = id;

      const li = document.createElement('li');
      li.className = `toc-item lvl-${h.tagName[1]}`;
      const a = document.createElement('a');
      a.href = `#${id}`;
      a.textContent = raw;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (h.classList.contains('is-collapsible') && h.classList.contains('is-collapsed')) {
          const body = h.nextElementSibling;
          if (body?.classList.contains('section-body')) {
            setSectionCollapsed(h, body, false);
            saveFoldedIds(state.currentDocKey);
          }
        }
        ensureElementVisible(h);
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.innerWidth < 680) setTocOpen(false);
      });
      li.appendChild(a);
      tocList.appendChild(li);
    }
  }

  // ---------- Mermaid & Vega-Lite Rendering + Zoom Modal ----------
  async function renderMermaidNodes(nodes) {
    if (!window.mermaid || !nodes.length) return;
    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      window.mermaid.initialize(mermaidThemeConfig());
      for (const el of nodes) {
        el.removeAttribute('data-processed');
        el.id = `mermaid-${++state.mermaidCounter}`;
      }
      await window.mermaid.run({ nodes });
    } catch (err) {
      console.warn('Mermaid render error:', err);
    }
  }

  function reRenderMermaidNodes() {
    const frames = [...docEl.querySelectorAll('.mermaid-frame')];
    if (!frames.length) return;
    const nodes = [];
    for (const f of frames) {
      const src = f.dataset.mermaidSource;
      const stage = f.querySelector('.mermaid-stage');
      if (!src || !stage) continue;
      stage.innerHTML = '';
      const mDiv = document.createElement('div');
      mDiv.className = 'mermaid';
      mDiv.textContent = src;
      stage.appendChild(mDiv);
      nodes.push(mDiv);
    }
    renderMermaidNodes(nodes);
  }

  async function renderVegaPlots() {
    const frames = [...docEl.querySelectorAll('.plot-frame')];
    if (!frames.length || !window.vegaEmbed) return;
    const config = vegaThemeConfig();
    for (const frame of frames) {
      const raw = frame.dataset.vegaSpec;
      const target = frame.querySelector('.vega-target');
      if (!raw || !target) continue;
      try {
        const spec = JSON.parse(raw);
        target.innerHTML = '';
        await window.vegaEmbed(target, spec, {
          actions: false,
          renderer: 'svg',
          config,
          loader: {
            load: () => Promise.reject(new Error('External data URLs are disabled for security')),
          },
        });
      } catch (err) {
        target.textContent = `Vega-Lite error: ${err.message || err}`;
      }
    }
  }

  function reRenderVegaPlots() {
    renderVegaPlots();
  }

  function applyModalZoom() {
    mermaidModalInner.style.transform = `scale(${state.modalScale})`;
  }

  function openGraphicModal(stageEl, titleText) {
    const svg = stageEl.querySelector('svg');
    if (!svg) return;
    mermaidModalTitle.textContent = titleText || 'Diagram';
    mermaidModalInner.innerHTML = '';
    mermaidModalInner.appendChild(svg.cloneNode(true));
    state.modalScale = 1.25;
    applyModalZoom();
    mermaidModal.classList.remove('hidden');
  }

  function closeMermaidModal() {
    mermaidModal.classList.add('hidden');
    mermaidModalInner.innerHTML = '';
  }

  mermaidZoomIn.addEventListener('click', () => {
    state.modalScale = Math.min(3.5, +(state.modalScale + 0.25).toFixed(2));
    applyModalZoom();
  });
  mermaidZoomOut.addEventListener('click', () => {
    state.modalScale = Math.max(0.5, +(state.modalScale - 0.25).toFixed(2));
    applyModalZoom();
  });
  mermaidZoomFit.addEventListener('click', () => {
    state.modalScale = 1;
    applyModalZoom();
  });
  mermaidModalClose.addEventListener('click', closeMermaidModal);
  mermaidModal.addEventListener('click', (e) => {
    if (e.target === mermaidModal || e.target === mermaidModalBody) closeMermaidModal();
  });

  // ---------- Find in Document (Ctrl+F) ----------
  function clearFindHighlights() {
    for (const mark of [...docEl.querySelectorAll('mark.find-hit')]) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
    }
    docEl.normalize();
    state.findHits = [];
    state.findIdx = -1;
    findCount.textContent = '0 / 0';
  }

  function focusFindHit(idx) {
    if (!state.findHits.length) {
      state.findIdx = -1;
      findCount.textContent = '0 / 0';
      return;
    }
    const prev = state.findHits[state.findIdx];
    if (prev) prev.classList.remove('is-current');
    state.findIdx = ((idx % state.findHits.length) + state.findHits.length) % state.findHits.length;
    const cur = state.findHits[state.findIdx];
    cur.classList.add('is-current');
    ensureElementVisible(cur);
    cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
    findCount.textContent = `${state.findIdx + 1} / ${state.findHits.length}`;
  }

  function runFind(query) {
    clearFindHighlights();
    const q = query.trim();
    if (!q) return;
    const qLower = q.toLowerCase();

    const walker = document.createTreeWalker(docEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('.katex, svg, .mermaid-frame, .plot-frame, script, style, mark.find-hit')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    for (const textNode of nodes) {
      const val = textNode.nodeValue;
      const lower = val.toLowerCase();
      let start = 0;
      let idx = lower.indexOf(qLower, start);
      if (idx === -1) continue;

      const frag = document.createDocumentFragment();
      while (idx !== -1) {
        if (idx > start) frag.appendChild(document.createTextNode(val.slice(start, idx)));
        const mark = document.createElement('mark');
        mark.className = 'find-hit';
        mark.textContent = val.slice(idx, idx + q.length);
        frag.appendChild(mark);
        state.findHits.push(mark);
        start = idx + q.length;
        idx = lower.indexOf(qLower, start);
      }
      if (start < val.length) frag.appendChild(document.createTextNode(val.slice(start)));
      textNode.parentNode.replaceChild(frag, textNode);
    }

    if (state.findHits.length) focusFindHit(0);
  }

  function openFindBar() {
    setSettingsOpen(false);
    findBar.classList.remove('hidden');
    findInput.focus();
    findInput.select();
    if (findInput.value.trim()) runFind(findInput.value);
  }

  function closeFindBar() {
    findBar.classList.add('hidden');
    clearFindHighlights();
    scheduleHide();
  }

  openFindBtn.addEventListener('click', openFindBar);
  findInput.addEventListener('input', () => runFind(findInput.value));
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusFindHit(state.findIdx + (e.shiftKey ? -1 : 1));
    }
  });
  findPrev.addEventListener('click', () => focusFindHit(state.findIdx - 1));
  findNext.addEventListener('click', () => focusFindHit(state.findIdx + 1));
  findClose.addEventListener('click', closeFindBar);

  // ---------- All-Conversations Doc Library (Ctrl+K) ----------
  function renderLibraryResults() {
    const q = libSearch.value.trim().toLowerCase();
    const filtered = state.libDocs.filter((d) => {
      if (state.libScope === 'current' && !d.isCurrentConv) return false;
      if (state.libScope === 'workspace' && d.group !== 'workspace') return false;
      if (state.libTag && !(d.tags || []).includes(state.libTag)) return false;
      if (!q) return true;
      const hay = `${d.title} ${d.name} ${d.summary || ''} ${(d.tags || []).join(' ')}`.toLowerCase();
      return q.split(/\s+/).every((part) => hay.includes(part));
    });

    state.libFiltered = filtered;
    if (state.libSelectedIdx >= filtered.length) state.libSelectedIdx = 0;

    libList.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'lib-empty';
      empty.textContent = 'No matching Markdown documents.';
      libList.appendChild(empty);
      return;
    }

    filtered.forEach((doc, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lib-item' + (idx === state.libSelectedIdx ? ' is-selected' : '');

      const top = document.createElement('div');
      top.className = 'lib-item-top';
      const title = document.createElement('span');
      title.className = 'lib-item-title';
      title.textContent = doc.title || doc.name;
      const meta = document.createElement('span');
      meta.className = 'lib-item-meta';
      const badge = doc.isCurrentConv ? 'This Chat' : doc.group === 'workspace' ? 'Workspace' : 'Past Chat';
      meta.textContent = `${badge} · ${doc.date || ''}`;
      top.appendChild(title);
      top.appendChild(meta);
      btn.appendChild(top);

      if (doc.summary) {
        const sum = document.createElement('div');
        sum.className = 'lib-item-summary';
        sum.textContent = doc.summary;
        btn.appendChild(sum);
      }
      if (doc.tags?.length) {
        const tagsRow = document.createElement('div');
        tagsRow.className = 'lib-item-tags';
        for (const t of doc.tags.slice(0, 5)) {
          const pill = document.createElement('span');
          pill.className = 'fm-tag';
          pill.textContent = `#${t}`;
          tagsRow.appendChild(pill);
        }
        btn.appendChild(tagsRow);
      }

      btn.addEventListener('click', () => selectLibraryDoc(doc));
      libList.appendChild(btn);
    });
  }

  function renderLibraryTags() {
    const counts = new Map();
    for (const d of state.libDocs) {
      for (const t of d.tags || []) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const topTags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([tag]) => tag);

    libTags.innerHTML = '';
    for (const tag of topTags) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lib-tag-chip' + (state.libTag === tag ? ' active' : '');
      btn.textContent = `#${tag}`;
      btn.addEventListener('click', () => {
        state.libTag = state.libTag === tag ? '' : tag;
        renderLibraryTags();
        renderLibraryResults();
      });
      libTags.appendChild(btn);
    }
  }

  async function selectLibraryDoc(doc) {
    closeLibraryModal();
    if (state.editing) exitEditMode();
    if (state.selectedKey && state.selectedKey !== `disk:${doc.path}`) {
      pushNavHistory();
    }
    if (!state.diskFiles.some((f) => f.path === doc.path) && !state.pinnedLibraryFiles.some((f) => f.path === doc.path)) {
      state.pinnedLibraryFiles.unshift(doc);
    }
    state.selectedKey = `disk:${doc.path}`;
    state.renderedMtime = null;
    syncSelectOptions();
    fileSelect.value = state.selectedKey;
    await openSelectedFile(false);
  }

  async function openLibraryModal() {
    setSettingsOpen(false);
    setTocOpen(false);
    libraryModal.classList.remove('hidden');
    libSearch.focus();
    libSearch.select();
    try {
      const res = await postJson('/api/library', {
        conversationId: conversationId(),
        workspaceUris: state.workspaceUris,
      });
      state.libDocs = Array.isArray(res.docs) ? res.docs : [];
      state.libSelectedIdx = 0;
      renderLibraryTags();
      renderLibraryResults();
    } catch (err) {
      libList.innerHTML = '<div class="lib-empty">Could not load document library.</div>';
      console.warn('Library fetch failed:', err);
    }
  }

  function closeLibraryModal() {
    libraryModal.classList.add('hidden');
  }

  openLibraryBtn.addEventListener('click', openLibraryModal);
  libClose.addEventListener('click', closeLibraryModal);
  libraryModal.addEventListener('click', (e) => {
    if (e.target === libraryModal) closeLibraryModal();
  });
  libSearch.addEventListener('input', () => {
    state.libSelectedIdx = 0;
    renderLibraryResults();
  });
  libSearch.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.libFiltered.length) {
        state.libSelectedIdx = (state.libSelectedIdx + 1) % state.libFiltered.length;
        renderLibraryResults();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.libFiltered.length) {
        state.libSelectedIdx = (state.libSelectedIdx - 1 + state.libFiltered.length) % state.libFiltered.length;
        renderLibraryResults();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const doc = state.libFiltered[state.libSelectedIdx];
      if (doc) selectLibraryDoc(doc);
    }
  });
  for (const btn of libScopeBtns) {
    btn.addEventListener('click', () => {
      state.libScope = btn.dataset.libScope || 'all';
      for (const b of libScopeBtns) b.classList.toggle('active', b === btn);
      state.libSelectedIdx = 0;
      renderLibraryResults();
    });
  }

  // ---------- Help Modal (?) ----------
  function setHelpOpen(open) {
    if (open) setSettingsOpen(false);
    helpModal.classList.toggle('hidden', !open);
  }
  helpBtn.addEventListener('click', () => setHelpOpen(true));
  helpClose.addEventListener('click', () => setHelpOpen(false));
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) setHelpOpen(false);
  });

  // ---------- Export & Archive ----------
  async function loadArchiveSettings() {
    try {
      const data = await postJson('/api/settings-get', {});
      archiveDirInput.value = data.archiveDir || '';
    } catch {
      // ignore
    }
  }

  printBtn.addEventListener('click', () => {
    setSettingsOpen(false);
    setTimeout(() => window.print(), 60);
  });

  copyMdBtn.addEventListener('click', async () => {
    if (!state.renderedContent) return;
    try {
      await copyTextToClipboard(state.renderedContent);
      showToast('Clean Markdown copied');
    } catch {
      showToast('Could not copy Markdown');
    }
  });

  archiveDirSave.addEventListener('click', async () => {
    try {
      const res = await postJson('/api/settings', { archiveDir: archiveDirInput.value });
      archiveDirInput.value = res.archiveDir || '';
      showToast(res.archiveDir ? 'Archive folder saved' : 'Archive folder cleared');
    } catch (err) {
      showToast(err.message.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Invalid folder path');
    }
  });

  archiveSaveBtn.addEventListener('click', async () => {
    if (!state.renderedContent) return;
    try {
      const res = await postJson('/api/archive', {
        filename: state.renderedTitle || 'note.md',
        content: state.renderedContent,
      });
      showToast(`Saved to ${res.savedPath.split(/[/\\]/).pop()}`);
    } catch (err) {
      showToast('Set a valid archive folder first');
      console.warn('Archive failed:', err);
    }
  });

  // ---------- Raw / Quick Edit Mode (#9) ----------
  function enterEditMode() {
    if (!state.renderedContent && !state.selectedKey) {
      showToast('Open a Markdown file first');
      return;
    }
    setSettingsOpen(false);
    state.editing = true;
    const isDisk = state.selectedKey.startsWith('disk:');
    editFileLabel.textContent = state.renderedTitle || 'Markdown Source';
    editStatus.textContent = isDisk ? 'Editing file on disk' : 'Local dropped file (read-only)';
    editSaveBtn.disabled = !isDisk;
    sourceTextarea.value = state.renderedContent;
    sourceTextarea.readOnly = !isDisk;
    docEl.classList.add('hidden');
    frontmatterCard.classList.add('hidden');
    editorShell.classList.remove('hidden');
    sourceTextarea.focus();
  }

  function exitEditMode() {
    state.editing = false;
    editorShell.classList.add('hidden');
    docEl.classList.remove('hidden');
    if (frontmatterCard.innerHTML) frontmatterCard.classList.remove('hidden');
  }

  async function saveEditedSource() {
    if (!state.editing || !state.selectedKey.startsWith('disk:')) return;
    const path = state.selectedKey.slice('disk:'.length);
    const nextContent = sourceTextarea.value;
    try {
      const res = await postJson('/api/write', {
        conversationId: conversationId(),
        workspaceUris: state.workspaceUris,
        path,
        content: nextContent,
      });
      state.renderedMtime = res.mtime;
      exitEditMode();
      renderDocument({
        title: state.renderedTitle,
        badge: state.renderedBadge,
        content: nextContent,
        docKey: state.currentDocKey,
        preserveScroll: false,
      });
      showToast('Saved changes');
    } catch (err) {
      showToast('Failed to save changes');
      console.warn('Write failed:', err);
    }
  }

  editModeBtn.addEventListener('click', enterEditMode);
  editCancelBtn.addEventListener('click', exitEditMode);
  editSaveBtn.addEventListener('click', saveEditedSource);

  // ---------- Global Keyboard Shortcuts ----------
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (libraryModal.classList.contains('hidden')) openLibraryModal();
      else closeLibraryModal();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      if (state.editing) return;
      e.preventDefault();
      openFindBar();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      if (state.editing) {
        e.preventDefault();
        saveEditedSource();
      }
      return;
    }

    const activeTag = document.activeElement?.tagName;
    const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || document.activeElement?.isContentEditable;
    if (!isTyping && e.key === '?') {
      e.preventDefault();
      setHelpOpen(helpModal.classList.contains('hidden'));
      return;
    }

    if (e.key !== 'Escape') return;
    if (!helpModal.classList.contains('hidden')) {
      setHelpOpen(false);
    } else if (!libraryModal.classList.contains('hidden')) {
      closeLibraryModal();
    } else if (!mermaidModal.classList.contains('hidden')) {
      closeMermaidModal();
    } else if (!findBar.classList.contains('hidden')) {
      closeFindBar();
    } else if (!settingsPopover.classList.contains('hidden')) {
      setSettingsOpen(false);
    } else if (!tocDrawer.classList.contains('hidden')) {
      setTocOpen(false);
    }
  });

  function computeReadingStats(mdText) {
    const words = mdText.trim() ? mdText.trim().split(/\s+/).length : 0;
    const mins = Math.max(1, Math.round(words / 220));
    return `${words.toLocaleString()} words · ${mins} min read`;
  }

  function renderDocument({ title, badge, content, docKey, preserveScroll = false }) {
    const scrollY = preserveScroll ? window.scrollY : 0;
    if (state.editing) exitEditMode();
    clearFindHighlights();
    emptyState.classList.add('hidden');
    state.currentDocKey = docKey || title;

    const { meta, body } = extractFrontmatter(content);
    renderFrontmatterCard(meta);

    docMeta.classList.remove('hidden');
    metaBadge.textContent = badge;
    metaName.textContent = title;
    metaStats.textContent = computeReadingStats(body);

    const { text: protectedMd, mathItems, footnotes } = preprocessMarkdown(body);
    let html = parseMarkdown(protectedMd);

    html = html.replace(/<p>\s*@@PRETTYMD_MATHBLOCK_(\d+)@@\s*<\/p>/g, (_, i) => {
      const item = mathItems[Number(i)];
      return renderMathWrapper(item.expr, true);
    });
    html = html.replace(/@@PRETTYMD_MATHBLOCK_(\d+)@@/g, (_, i) => {
      const item = mathItems[Number(i)];
      return renderMathWrapper(item.expr, true);
    });
    html = html.replace(/@@PRETTYMD_MATHINLINE_(\d+)@@/g, (_, i) => {
      const item = mathItems[Number(i)];
      return renderMathWrapper(item.expr, false);
    });

    const fragment = sanitizeHtml(html);
    docEl.innerHTML = '';
    docEl.appendChild(fragment);

    appendFootnotesSection(docEl, footnotes);
    transformCallouts(docEl);
    enhanceChecklists(docEl, state.currentDocKey);
    enhanceTablesAndCode(docEl);
    buildOutline(docEl);
    enhanceCollapsibleSections(docEl, state.currentDocKey);

    const mermaidNodes = [...docEl.querySelectorAll('.mermaid')];
    if (mermaidNodes.length) {
      renderMermaidNodes(mermaidNodes);
    }
    renderVegaPlots();

    state.renderedContent = content;
    state.renderedTitle = title;
    state.renderedBadge = badge;
    window.scrollTo(0, scrollY);
    updateScrollUi();
  }

  function showEmptyState() {
    docMeta.classList.add('hidden');
    frontmatterCard.classList.add('hidden');
    docEl.innerHTML = '';
    tocList.innerHTML = '<li class="toc-empty">No headings in this document.</li>';
    emptyState.classList.remove('hidden');
    readProgress.style.width = '0%';
  }

  // ---------- File Selector & Loading ----------
  function syncSelectOptions() {
    const prev = state.selectedKey;
    fileSelect.innerHTML = '';

    const artifacts = state.diskFiles.filter((f) => f.group === 'artifact');
    const workspace = state.diskFiles.filter((f) => f.group === 'workspace');
    const extraLib = state.pinnedLibraryFiles.filter((f) => !state.diskFiles.some((d) => d.path === f.path));

    const appendGroup = (label, items, keyFn, textFn) => {
      if (!items.length) return;
      const grp = document.createElement('optgroup');
      grp.label = label;
      for (const item of items) {
        const opt = document.createElement('option');
        opt.value = keyFn(item);
        opt.textContent = textFn(item);
        grp.appendChild(opt);
      }
      fileSelect.appendChild(grp);
    };

    appendGroup('Conversation Artifacts', artifacts, (f) => `disk:${f.path}`, (f) => f.relPath || f.name);
    appendGroup('Workspace Markdown', workspace, (f) => `disk:${f.path}`, (f) =>
      f.workspaceName ? `${f.workspaceName}/${f.relPath}` : f.relPath
    );
    appendGroup('Opened from Library', extraLib, (f) => `disk:${f.path}`, (f) => f.title || f.name);
    appendGroup('Opened / Dropped Files', state.droppedFiles, (f) => `local:${f.id}`, (f) => f.name);

    if (!fileSelect.options.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No .md files found';
      fileSelect.appendChild(opt);
      fileSelect.value = '';
      return;
    }

    const exists = [...fileSelect.options].some((o) => o.value === prev);
    if (exists) {
      fileSelect.value = prev;
    } else {
      fileSelect.value = fileSelect.options[0].value;
      state.selectedKey = fileSelect.value;
    }
  }

  async function openSelectedFile(preserveScroll = false) {
    const key = state.selectedKey;
    if (!key) {
      showEmptyState();
      return;
    }

    if (key.startsWith('local:')) {
      const id = key.slice('local:'.length);
      const local = state.droppedFiles.find((f) => f.id === id);
      if (!local) {
        showEmptyState();
        return;
      }
      state.renderedMtime = null;
      renderDocument({
        title: local.name,
        badge: 'Local File',
        content: local.content,
        docKey: `local:${local.name}`,
        preserveScroll,
      });
      return;
    }

    if (key.startsWith('disk:')) {
      const path = key.slice('disk:'.length);
      const meta =
        state.diskFiles.find((f) => f.path === path) ||
        state.pinnedLibraryFiles.find((f) => f.path === path);
      try {
        const data = await postJson('/api/read', {
          conversationId: conversationId(),
          workspaceUris: state.workspaceUris,
          path,
        });
        state.renderedMtime = data.mtime;
        const badge =
          meta?.group === 'artifact' ? 'Artifact' : meta?.group === 'workspace' ? 'Workspace' : 'Library';
        renderDocument({
          title: meta?.relPath || data.name,
          badge,
          content: data.content,
          docKey: path,
          preserveScroll,
        });
      } catch (err) {
        console.warn('Failed to read file:', err);
      }
    }
  }

  // ---------- Cross-Markdown Linking & Navigation History (Alt+Left / Alt+Right) ----------
  function pushNavHistory() {
    if (!state.selectedKey) return;
    const prev = state.navBack[state.navBack.length - 1];
    const scrollY = Math.round(window.scrollY);
    if (prev && prev.key === state.selectedKey && Math.abs(prev.scrollY - scrollY) < 24) return;
    state.navBack.push({ key: state.selectedKey, scrollY });
    if (state.navBack.length > 50) state.navBack.shift();
    state.navForward = [];
  }

  function slugifyFragment(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  function scrollToFragment(rawFragment) {
    if (!rawFragment) return false;
    let decoded = rawFragment;
    try {
      decoded = decodeURIComponent(rawFragment);
    } catch {
      // keep raw
    }
    let target = document.getElementById(decoded) || document.getElementById(rawFragment);
    if (!target) {
      const wantSlug = slugifyFragment(decoded);
      const wantLower = decoded.trim().toLowerCase();
      for (const h of docEl.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        const text = (h.textContent || '').trim();
        if (
          h.id === wantSlug ||
          slugifyFragment(text) === wantSlug ||
          text.toLowerCase() === wantLower
        ) {
          target = h;
          break;
        }
      }
    }
    if (!target) return false;
    ensureElementVisible(target);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  async function openResolvedDiskPath(resolvedPath, resolvedName, fragment = '') {
    const nextKey = `disk:${resolvedPath}`;
    if (state.selectedKey && state.selectedKey !== nextKey) {
      pushNavHistory();
    } else if (state.selectedKey === nextKey && fragment) {
      pushNavHistory();
      scrollToFragment(fragment);
      return;
    }

    if (
      !state.diskFiles.some((f) => f.path === resolvedPath) &&
      !state.pinnedLibraryFiles.some((f) => f.path === resolvedPath)
    ) {
      state.pinnedLibraryFiles.unshift({
        path: resolvedPath,
        name: resolvedName || resolvedPath.split(/[/\\]/).pop(),
        title: resolvedName || resolvedPath.split(/[/\\]/).pop(),
        group: 'archive',
      });
    }
    state.selectedKey = nextKey;
    state.renderedMtime = null;
    syncSelectOptions();
    fileSelect.value = state.selectedKey;
    await openSelectedFile(false);
    if (fragment) {
      requestAnimationFrame(() => scrollToFragment(fragment));
    }
  }

  async function resolveLinkFallback(target) {
    let decoded = target;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      // keep raw
    }
    const clean = decoded.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
    const stem = clean.replace(/\.(?:md|markdown)$/i, '');

    // If file:/// URI, preserve leading "/" on POSIX and strip leading "/" before Windows drive letters
    let filePathNorm = '';
    if (/^file:\/\//i.test(decoded)) {
      filePathNorm = decoded
        .replace(/^file:\/\//i, '')
        .replace(/^\/([a-zA-Z]:\/)/, '$1')
        .replace(/\\/g, '/')
        .toLowerCase();
    }

    let pool = [...state.diskFiles, ...state.pinnedLibraryFiles];
    try {
      const res = await postJson('/api/library', {
        conversationId: conversationId(),
        workspaceUris: state.workspaceUris,
      });
      if (Array.isArray(res.docs)) pool = [...pool, ...res.docs];
    } catch {
      // ignore
    }

    for (const item of pool) {
      const pNorm = (item.path || '').replace(/\\/g, '/').toLowerCase();
      if (filePathNorm && pNorm === filePathNorm) return item;
      const rel = (item.relPath || item.name || '').replace(/\\/g, '/').toLowerCase();
      const relStem = rel.replace(/\.(?:md|markdown)$/i, '');
      const name = (item.name || '').toLowerCase();
      const nameStem = name.replace(/\.(?:md|markdown)$/i, '');
      if (rel === clean || relStem === stem || name === clean || nameStem === stem || rel.endsWith('/' + clean)) {
        return item;
      }
    }
    return null;
  }

  async function resolveAndOpenMarkdownLink(target, fragment, isWikilink) {
    const currentPath = state.selectedKey.startsWith('disk:') ? state.selectedKey.slice('disk:'.length) : '';
    try {
      const res = await postJson('/api/resolve-link', {
        target,
        currentPath,
        isWikilink,
        conversationId: conversationId(),
        workspaceUris: state.workspaceUris,
      });
      if (res?.ok && res.path) {
        await openResolvedDiskPath(res.path, res.name, fragment);
        return;
      }
    } catch {
      // Fallback for running sidecar before restart or if route returned 404
    }

    const fallbackHit = await resolveLinkFallback(target);
    if (fallbackHit?.path) {
      await openResolvedDiskPath(fallbackHit.path, fallbackHit.name, fragment);
      return;
    }
    showToast(`Linked file not found: ${target}`);
  }

  async function restoreNavEntry(entry, directionLabel) {
    if (!entry) return;
    if (state.editing) exitEditMode();
    const sameDoc = entry.key === state.selectedKey;
    if (!sameDoc) {
      if (entry.key.startsWith('disk:')) {
        const p = entry.key.slice('disk:'.length);
        if (!state.diskFiles.some((f) => f.path === p) && !state.pinnedLibraryFiles.some((f) => f.path === p)) {
          const name = p.split(/[/\\]/).pop();
          state.pinnedLibraryFiles.unshift({ path: p, name, title: name, group: 'archive' });
        }
      }
      state.selectedKey = entry.key;
      state.renderedMtime = null;
      syncSelectOptions();
      fileSelect.value = state.selectedKey;
      await openSelectedFile(false);
    }
    window.scrollTo({ top: entry.scrollY || 0, behavior: sameDoc ? 'smooth' : 'auto' });
    showToast(`${directionLabel}: ${state.renderedTitle || 'Previous view'}`);
  }

  async function navigateBack() {
    if (!state.navBack.length) return;
    const target = state.navBack.pop();
    if (state.selectedKey) {
      state.navForward.push({ key: state.selectedKey, scrollY: Math.round(window.scrollY) });
    }
    await restoreNavEntry(target, 'Back');
  }

  async function navigateForward() {
    if (!state.navForward.length) return;
    const target = state.navForward.pop();
    if (state.selectedKey) {
      state.navBack.push({ key: state.selectedKey, scrollY: Math.round(window.scrollY) });
    }
    await restoreNavEntry(target, 'Forward');
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 'ArrowLeft') {
        if (state.navBack.length) {
          e.preventDefault();
          e.stopPropagation();
          navigateBack();
        }
      } else if (e.key === 'ArrowRight') {
        if (state.navForward.length) {
          e.preventDefault();
          e.stopPropagation();
          navigateForward();
        }
      }
    },
    true
  );

  window.addEventListener('mouseup', (e) => {
    if (e.button === 3 && state.navBack.length) {
      e.preventDefault();
      navigateBack();
    } else if (e.button === 4 && state.navForward.length) {
      e.preventDefault();
      navigateForward();
    }
  });

  fileSelect.addEventListener('change', () => {
    if (state.selectedKey && state.selectedKey !== fileSelect.value) {
      pushNavHistory();
    }
    state.selectedKey = fileSelect.value;
    state.renderedMtime = null;
    openSelectedFile(false);
    fileSelect.blur();
    scheduleHide();
  });

  // ---------- Local File Picker & Drag-and-Drop ----------
  function loadLocalFileObject(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const existing = state.droppedFiles.find((f) => f.name === file.name);
      let id;
      if (existing) {
        existing.content = content;
        existing.size = file.size;
        id = existing.id;
      } else {
        id = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7);
        state.droppedFiles.unshift({ id, name: file.name, content, size: file.size });
      }
      state.selectedKey = `local:${id}`;
      syncSelectOptions();
      fileSelect.value = state.selectedKey;
      openSelectedFile(false);
    };
    reader.readAsText(file);
  }

  openBtn.addEventListener('click', (e) => {
    setSettingsOpen(false);
    fileInput.click();
    if (e.detail > 0) openBtn.blur();
  });
  emptyOpenBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) loadLocalFileObject(file);
    fileInput.value = '';
  });

  window.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      state.dragDepth++;
      appEl.classList.add('is-dragging');
    }
  });
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (state.dragDepth === 0) appEl.classList.remove('is-dragging');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    state.dragDepth = 0;
    appEl.classList.remove('is-dragging');
    const file = e.dataTransfer?.files?.[0];
    if (file) loadLocalFileObject(file);
  });

  // ---------- Polling & Sidecar Workspace Sync ----------
  async function refreshFiles() {
    try {
      const res = await postJson('/api/files', {
        conversationId: conversationId(),
        workspaceUris: state.workspaceUris,
      });
      state.diskFiles = Array.isArray(res.files) ? res.files : [];

      const artifacts = state.diskFiles.filter((f) => f.group === 'artifact');
      let newestNewArtifact = null;
      for (const art of artifacts) {
        if (!state.knownArtifactPaths.has(art.path)) {
          state.knownArtifactPaths.add(art.path);
          if (state.hasInitializedPoll && (!newestNewArtifact || art.mtime > newestNewArtifact.mtime)) {
            newestNewArtifact = art;
          }
        }
      }
      state.hasInitializedPoll = true;

      const prevSelected = state.selectedKey;
      if (newestNewArtifact) {
        if (state.editing) {
          showToast('New artifact ready — save or exit Edit mode to view');
        } else {
          state.selectedKey = `disk:${newestNewArtifact.path}`;
        }
      }

      syncSelectOptions();

      if (!state.selectedKey && fileSelect.options.length && fileSelect.options[0].value) {
        state.selectedKey = fileSelect.options[0].value;
      }

      if (state.selectedKey && state.selectedKey !== prevSelected) {
        fileSelect.value = state.selectedKey;
        await openSelectedFile(false);
      } else if (state.selectedKey.startsWith('disk:') && !state.editing) {
        const path = state.selectedKey.slice('disk:'.length);
        const match =
          state.diskFiles.find((f) => f.path === path) ||
          state.pinnedLibraryFiles.find((f) => f.path === path);
        if (match && match.mtime !== state.renderedMtime) {
          await openSelectedFile(true);
        }
      } else if (!state.selectedKey && !state.droppedFiles.length) {
        showEmptyState();
      }
    } catch (err) {
      console.warn('Poll /api/files failed:', err);
    }
  }

  async function init() {
    refreshThemes()
      .then(() => applyTheme(state.theme))
      .catch(() => {});
    loadArchiveSettings();

    if (window.sidecar?.onWorkspaceChange) {
      window.sidecar.onWorkspaceChange((uris) => {
        state.workspaceUris = Array.isArray(uris) ? uris : [];
        refreshFiles();
      });
    }
    if (window.sidecar?.getWorkspaceUris) {
      window.sidecar
        .getWorkspaceUris()
        .then((uris) => {
          state.workspaceUris = Array.isArray(uris) ? uris : [];
          refreshFiles();
        })
        .catch(() => {});
    }

    await refreshFiles();
    state.pollTimer = setInterval(() => {
      if (!document.hidden) refreshFiles();
    }, POLL_MS);
  }

  init();
})();
