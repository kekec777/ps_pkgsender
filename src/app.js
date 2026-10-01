const express = require('express');
const morgan = require('morgan');
const mustacheExpress = require('mustache-express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const { execFile } = require('child_process');
const filesizeModule = require('filesize');
const formatFileSize = typeof filesizeModule === 'function' ? filesizeModule : filesizeModule.filesize;

function formatDashboardSize(bytes) {
  const value = Number(bytes || 0);
  const abs = Math.abs(value);
  const units = [
    { label: 'TB', size: 1024 ** 4 },
    { label: 'GB', size: 1024 ** 3 },
    { label: 'MB', size: 1024 ** 2 },
    { label: 'KB', size: 1024 }
  ];

  const unit = units.find((item) => abs >= item.size) || { label: 'B', size: 1 };

  if (unit.label === 'B') {
    return `${value} B`;
  }

  const amount = value / unit.size;
  return `${amount.toFixed(2)} ${unit.label}`;
}


const port = Number(process.env.PORT || 7777);
const ps4PkgPath = path.resolve(
  process.env.PS4_PKG_DIR || process.env.PKG_DIR || process.env.STATIC_FILES || './PS4Games'
);
const ps5PkgPath = path.resolve(
  process.env.PS5_PKG_DIR || './PS5Games'
);

// Backward-compatible name used by old helper functions and logs.
const staticFilesPath = ps4PkgPath;
const localIp = process.env.LOCALIP || 'localhost';
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || `http://${localIp}:${port}`).replace(/\/$/, '');
let currentPS5ipadr = process.env.PS5IP || process.env.PS5_HOST || '';
const ps5ElfPort = Number.parseInt(process.env.PS5_ELF_PORT || '9021', 10);
const ps5DpiPort = Number.parseInt(process.env.PS5_DPI_PORT || '9090', 10);
const ps5DpiWebPort = Number.parseInt(process.env.PS5_DPI_WEB_PORT || '12800', 10);
const ps5TcpTimeoutMs = Number.parseInt(process.env.PS5_TCP_TIMEOUT_MS || '30000', 10);
const installQueueDelayMs = Number.parseInt(process.env.INSTALL_QUEUE_DELAY_MS || '5000', 10);

let installQueue = [];
let installQueueProcessing = false;
let installQueueSeq = 0;

const ps5RelapseDir = path.resolve(
  process.env.PS5_RELAPSE_DIR || path.join(__dirname, 'public', 'ps5-relapse')
);
const coverImagesPath = path.join(__dirname, 'public', 'images');
const thumbnailImagesPath = path.join(__dirname, 'public', 'thumbnail');
const coverMapUrl = process.env.COVER_MAP_URL || 'https://raw.githubusercontent.com/hmn/ps4-imagemap/master/games.json';
const coverStoreRegions = (process.env.COVER_STORE_REGIONS || 'DK/da,GB/en,US/en,DE/de,SE/sv,NO/no')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const coverSearchRegions = (process.env.COVER_SEARCH_REGIONS || process.env.COVER_STORE_REGIONS || 'DK/da,GB/en,US/en,DE/de,SE/sv,NO/no')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const coverEnableOrbisPatches = String(process.env.COVER_ENABLE_ORBISPATCHES || 'true').toLowerCase() === 'true';

function encodePublicImageUrl(folder, filename) {
  return `/public/${encodeURIComponent(folder)}/${String(filename)
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function safeFileBase(value) {
  return String(value || 'folder')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180) || 'folder';
}

function cleanGameTitle(value) {
  return String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(CUSA\d{5}|SLUS\d{5}|SCUS\d{5}|SCES\d{5}|SLES\d{5})\b/gi, ' ')
    .replace(/\b[A-Z]{2}\d{4}-[A-Z0-9_-]+_00-[A-Z0-9_]+\b/gi, ' ')
    .replace(/\b(v|ver|version)?\s*\d+(\.\d+)+\b/gi, ' ')
    .replace(/\b(BACKPORT|OPOISSO\d+|DUPLEX|FUGAZI|PS4|PKG|A0100|V0100|STORE|TOOLS)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function normalizeSearchTitle(value) {
  const words = String(value || '')
    .replace(/[-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const normalized = [];
  const seen = new Set();

  for (const word of words) {
    const key = word.toLowerCase();

    if (!seen.has(key)) {
      normalized.push(word);
      seen.add(key);
    }
  }

  return normalized.join(' ');
}


const coverTitleAliases = {
  CUSA00667: 'SingStar Mega Hits',
  CUSA00501: 'SingStar Ultimate Party',
  SCUS97399: 'God of War',
  SCES54206: 'God of War II',
  SLUS22184: 'Resident Evil Code Veronica X',
  CUSA00667: 'SingStar Mega Hits',
  CUSA00501: 'SingStar Ultimate Party'
};

function romanizeTitleNumber(value) {
  return String(value || '')
    .replace(/\bGod\s*Of\s*War\s*2\b/gi, 'God of War II')
    .replace(/\bGod\s*Of\s*War2\b/gi, 'God of War II')
    .replace(/\bGOW2\b/gi, 'God of War II')
    .replace(/\bGOW\b/gi, 'God of War')
    .replace(/\bVeronicaX\b/gi, 'Code Veronica X');
}

function getBestAliasTitle(value) {
  const ids = extractAllTitleIds(value);

  for (const id of ids) {
    if (coverTitleAliases[id]) {
      return coverTitleAliases[id];
    }
  }

  return null;
}

function cleanCoverSearchTitle(value) {
  const alias = getBestAliasTitle(value);
  if (alias) return alias;

  let text = String(value || '');

  // Remove filename extension and common scene/update/version/FW noise.
  text = text
    .replace(/\.pkg$/i, ' ')
    .replace(/\bUPDATE\b/gi, ' ')
    .replace(/\bBACKPORT\b/gi, ' ')
    .replace(/\bDUPLEX\b/gi, ' ')
    .replace(/\bOPOISSO893\b/gi, ' ')
    .replace(/\bDLPSGAME\.COM\b/gi, ' ')
    .replace(/\bFXD(?:v)?\d+(?:\.\d+)?\b/gi, ' ')
    .replace(/\bFW\d+\b/gi, ' ')
    .replace(/\bV(?:ersion)?\s*\d+(?:[._]\d+)?\b/gi, ' ')
    .replace(/\bv\d+(?:[._]\d+)?\b/gi, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\([^\)]*Sporty[^\)]*\)/gi, ' ');

  // Remove content IDs like UP9000-SCUS97399_00-SCUS973990000001-A0100-V0100.
  text = text.replace(/[A-Z]{2}\d{4}-[A-Z0-9]{4,10}\d{5}_00-[A-Z0-9_]+(?:-[A-Z]\d{4}-V\d{4})?/gi, ' ');

  // Remove title IDs after they were used for direct lookup.
  text = text.replace(/\b(CUSA|PPSA)\d{5}\b/gi, ' ');
  text = text.replace(/\b(SLUS|SCUS|SCES|SLES|SLPS|SLPM|NPUJ|NPUI|NPEF|NPUG|NPEG|NPUB|NPEB|NPHG|ULUS|ULES|UCUS|UCES)[\s._-]*\d{5}\b/gi, ' ');

  // Turn separators into spaces, then apply common short-name expansions.
  text = text.replace(/[._-]+/g, ' ');
  text = romanizeTitleNumber(text);

  // Remove duplicate words caused by filenames like GOW__... after GOW expansion.
  text = text
    .replace(/\b(God of War)(\s+\1)+\b/gi, '$1')
    .replace(/\b(Resident Evil)(\s+\1)+\b/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}




function toPublicImageUrl(folder, filename, fallback = 'folder.png') {
  const safeFolder = String(folder || '').replace(/^\/+|\/+$/g, '');
  const rawName = String(filename || fallback);
  const cleanName = rawName.replace(/^\/+/, '');
  return `/public/${safeFolder}/${encodeURIComponent(cleanName)}`;
}

function getPkgDisplayName(pkg) {
  const raw = String((pkg && (pkg.displayName || pkg.shortDisplayName || pkg.fileName || pkg.filename || pkg.name)) || 'Unknown.pkg');
  return raw.toLowerCase().endsWith('.pkg') ? raw : `${raw}.pkg`;
}

function buildSearchTitle(root, pkgName = '') {
  const alias = getBestAliasTitle(`${root} ${pkgName}`);
  if (alias) return alias;

  const cleanedPkg = cleanCoverSearchTitle(pkgName);
  const cleanedRoot = cleanCoverSearchTitle(root);

  // Prefer the package name when it has useful text. Otherwise use folder/root.
  const candidate = cleanedPkg.length >= 3 ? cleanedPkg : cleanedRoot;

  return candidate || cleanGameTitle(`${root} ${pkgName}`);
}


function safeLocalImageFilename(value) {
  const filename = path.basename(String(value || 'cover.jpg'));

  if (!filename || filename === '.' || filename === '..') {
    return 'cover.jpg';
  }

  // Keep the original filename so the missing-file check matches exactly.
  // Only remove characters that are unsafe for local files.
  return filename
    .replace(/[\/\\:*?"<>|]/g, '_')
    .slice(0, 220);
}

function imageExists(targetDir, filename) {
  return fs.existsSync(path.join(targetDir, safeLocalImageFilename(filename)));
}


function imageExistsWithLegacyAlias(targetDir, filename) {
  if (imageExists(targetDir, filename)) {
    return true;
  }

  const parsed = path.parse(String(filename || ''));
  const legacyName = `${safeFileBase(parsed.name)}${parsed.ext || '.jpg'}`;

  return fs.existsSync(path.join(targetDir, legacyName));
}


function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x3D;/g, '=')
    .replace(/&#x3F;/g, '?')
    .replace(/&#x26;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}


const app = express();
let currentPS4ipadr = process.env.PS4IP || 'localhost';

app.use(morgan('combined'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/css', express.static(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free/css')));
app.use('/webfonts', express.static(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free/webfonts')));
app.use('/css', express.static(path.join(__dirname, '../node_modules/bootstrap/dist/css')));
app.use('/js', express.static(path.join(__dirname, '../node_modules/bootstrap/dist/js')));
app.use('/css', express.static(path.join(__dirname, 'views/css')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/ps5/relapse', express.static(ps5RelapseDir, { extensions: ['html'] }));
app.use('/pkgfiles/ps4', express.static(ps4PkgPath, { dotfiles: 'deny', fallthrough: false }));
app.use('/pkgfiles/ps5', express.static(ps5PkgPath, { dotfiles: 'deny', fallthrough: false }));

// Legacy PS4 URL support. Existing PS4 installs using /pkgfiles/<file>.pkg still work.
app.use('/pkgfiles', express.static(ps4PkgPath, { dotfiles: 'deny', fallthrough: false }));

app.engine('html', mustacheExpress());
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views'));


const coverFetchTimeoutMs = Number.parseInt(process.env.COVER_FETCH_TIMEOUT_MS || '7000', 10);
const coverItemTimeoutMs = Number.parseInt(process.env.COVER_ITEM_TIMEOUT_MS || '45000', 10);
const originalFetch = globalThis.fetch.bind(globalThis);

async function fetchWithTimeout(url, options = {}, timeoutMs = coverFetchTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await originalFetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;

  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}



function makeSafeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function getConsoleViewData(consoleType = 'ps4') {
  const isPs5 = String(consoleType).toLowerCase() === 'ps5';
  const label = isPs5 ? 'PS5' : 'PS4';

  const config = {
    type: isPs5 ? 'ps5' : 'ps4',
    label,
    ipApi: isPs5 ? '/api/ps5ip' : '/api/ps4ip',
    ipFieldName: isPs5 ? 'newPS5ipadr' : 'newPS4ipadr',
    installApi: isPs5 ? '/api/ps5/install' : '/install',
    installLabel: isPs5 ? 'Install to PS5' : 'Install to PS4'
  };

  return {
    isPs4: !isPs5,
    isPs5,
    pageTitle: `${label} PKG Sender`,
    consoleBadge: `${label} PKG Sender`,
    consoleTitle: `${label} package library`,
    consoleDescription: isPs5
      ? 'Browse PS4-compatible packages plus native PS5 packages, and send install URLs to your PS5 with etaHEN Direct PKG Installer.'
      : 'Browse only PS4-compatible packages and send install requests to your PS4 without leaving the page.',
    consoleTargetLabel: 'Target console',
    consoleIpTitle: `${label} IP address`,
    consoleIpPlaceholder: isPs5 ? '192.168.1.110' : '192.168.1.50',
    currentConsoleLabel: label,
    ipInputName: config.ipFieldName,
    ipApi: config.ipApi,
    installAction: config.installApi,
    installButtonLabel: config.installLabel,
    otherConsoleUrl: isPs5 ? '/ps4' : '/ps5',
    otherConsoleLabel: isPs5 ? 'Open PS4 library' : 'Open PS5 library',
    consoleSelectUrl: '/',
    consoleToolsUrl: isPs5 ? '/ps5/tools' : '',
    libraryModeLabel: isPs5 ? 'PS5 view: PS4 + PS5 packages' : 'PS4 view: PS4 packages only',
    consoleConfigJson: makeSafeScriptJson(config),
    ps5Host: currentPS5ipadr,
    ps5RelapseUrl: '/ps5/relapse/',
    ps5ToolsUrl: '/ps5/tools'
  };
}


function getRequestedConsoleType(req) {
  const value = String(req.query?.console || req.body?.console || req.query?.platform || req.body?.platform || 'ps4').toLowerCase();
  return value === 'ps5' ? 'ps5' : 'ps4';
}

function renderPackageLibrary(req, res, next, consoleType = 'ps4') {
  try {
    const isPs5View = String(consoleType).toLowerCase() === 'ps5';

    const dirs = flattenPkgs(getPkgsForConsole(consoleType));
    const ps4Dirs = flattenPkgs(getPkgsFromRoot(ps4PkgPath, 'PS4', false));
    const ps5Dirs = flattenPkgs(getPkgsFromRoot(ps5PkgPath, 'PS5', false));

    const totalPkgs = dirs.reduce((sum, dir) => sum + dir.count, 0);
    const ps4PackageCount = ps4Dirs.reduce((sum, dir) => sum + dir.count, 0);
    const ps5PackageCount = ps5Dirs.reduce((sum, dir) => sum + dir.count, 0);

    const totalBytes = dirs.reduce((sum, dir) => sum + dir.bytes, 0);
    const ps4Bytes = ps4Dirs.reduce((sum, dir) => sum + dir.bytes, 0);
    const ps5Bytes = ps5Dirs.reduce((sum, dir) => sum + dir.bytes, 0);

    res.render('index', {
      ...getConsoleViewData(consoleType),
      dirs,
      hasDirs: dirs.length > 0,
      totalDirs: dirs.length,
      totalPkgs,
      ps4PackageCount,
      ps5PackageCount,
      showPs5PackageCount: isPs5View,
      showPs5Size: isPs5View,
      ps4Size: formatDashboardSize(ps4Bytes),
      ps5Size: formatDashboardSize(ps5Bytes),
      totalSize: formatDashboardSize(totalBytes)
    });
  } catch (error) {
    next(error);
  }
}

function getInstallQueuePosition(jobId) {
  const active = installQueue.filter((job) => ['queued', 'running'].includes(job.status));
  const index = active.findIndex((job) => job.id === jobId);
  return index === -1 ? 0 : index + 1;
}

function getPublicInstallJob(job) {
  return {
    id: job.id,
    consoleType: job.consoleType,
    title: job.title,
    platformLabel: job.platformLabel,
    status: job.status,
    message: job.message || '',
    error: job.error || '',
    url: job.url || '',
    position: getInstallQueuePosition(job.id),
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null
  };
}

function getInstallQueueSnapshot() {
  const active = installQueue
    .filter((job) => ['queued', 'running'].includes(job.status))
    .map(getPublicInstallJob);

  const recent = installQueue
    .filter((job) => ['done', 'error'].includes(job.status))
    .slice(-10)
    .reverse()
    .map(getPublicInstallJob);

  return {
    ok: true,
    processing: installQueueProcessing,
    active,
    recent,
    activeCount: active.length,
    recentCount: recent.length
  };
}

function trimInstallQueueHistory() {
  const active = installQueue.filter((job) => ['queued', 'running'].includes(job.status));
  const recent = installQueue.filter((job) => ['done', 'error'].includes(job.status)).slice(-50);
  installQueue = [...recent, ...active];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueInstallJob(jobInput) {
  const job = {
    id: `job-${Date.now()}-${installQueueSeq += 1}`,
    consoleType: jobInput.consoleType,
    filepath: jobInput.filepath,
    title: jobInput.title || path.basename(jobInput.filepath || 'Package'),
    platformLabel: jobInput.platformLabel || String(jobInput.consoleType || '').toUpperCase(),
    host: jobInput.host || '',
    port: jobInput.port || null,
    status: 'queued',
    message: 'Queued',
    error: '',
    url: '',
    result: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null
  };

  installQueue.push(job);
  processInstallQueue().catch((error) => {
    console.error('Install queue processor failed:', error);
  });

  return job;
}

async function runInstallQueueJob(job) {
  if (job.consoleType === 'ps5') {
    const pkgUrl = buildPublicPkgUrl(job.filepath);
    job.url = pkgUrl;
    return ps5InstallUrl(job.host || currentPS5ipadr, pkgUrl, job.port || ps5DpiPort);
  }

  const result = await ps4Install(job.filepath);
  job.url = result.url || '';
  return result;
}

async function processInstallQueue() {
  if (installQueueProcessing) return;

  installQueueProcessing = true;

  try {
    while (true) {
      const job = installQueue.find((item) => item.status === 'queued');
      if (!job) break;

      job.status = 'running';
      job.startedAt = new Date().toISOString();
      job.message = `Sending ${job.title} to ${String(job.consoleType || '').toUpperCase()}`;

      try {
        const result = await runInstallQueueJob(job);
        job.status = 'done';
        job.result = result;
        job.message = result.message || `Install request sent for ${job.title}`;
      } catch (error) {
        job.status = 'error';
        job.error = error.message;
        job.message = error.message;
      } finally {
        job.finishedAt = new Date().toISOString();
      }

      trimInstallQueueHistory();

      if (installQueueDelayMs > 0 && installQueue.some((item) => item.status === 'queued')) {
        await wait(installQueueDelayMs);
      }
    }
  } finally {
    installQueueProcessing = false;
  }
}



app.get('/', (req, res) => {
  res.type('html').send(renderConsoleSelectPage());
});

app.get('/ps4', (req, res, next) => {
  renderPackageLibrary(req, res, next, 'ps4');
});

app.get('/ps5', (req, res, next) => {
  renderPackageLibrary(req, res, next, 'ps5');
});

app.get('/api/ps4ip', (req, res) => {
  res.json({ variable: currentPS4ipadr });
});

app.post('/api/ps4ip', (req, res) => {
  const newPS4ipadr = String(req.body.newPS4ipadr || '').trim();

  if (!isValidHost(newPS4ipadr)) {
    return res.status(400).json({ message: 'Invalid PS4 IP/host' });
  }

  currentPS4ipadr = newPS4ipadr;
  res.json({ message: 'PS4 IP address updated', variable: currentPS4ipadr });
});


app.get('/api/ps5/info', (req, res) => {
  res.json({
    ok: true,
    ps5Host: currentPS5ipadr,
    ps5ElfPort,
    ps5DpiPort,
    ps5DpiWebPort,
    publicBaseUrl,
    relapseUrl: '/ps5/relapse/',
    relapsePath: ps5RelapseDir,
    relapseExists: fs.existsSync(ps5RelapseDir)
  });
});

app.get('/api/ps5ip', (req, res) => {
  res.json({ variable: currentPS5ipadr });
});

app.post('/api/ps5ip', (req, res) => {
  const newPS5ipadr = String(req.body.newPS5ipadr || req.body.ps5Host || req.body.host || '').trim();

  if (!isValidHost(newPS5ipadr)) {
    return res.status(400).json({ message: 'Invalid PS5 IP/host' });
  }

  currentPS5ipadr = newPS5ipadr;
  res.json({ message: 'PS5 IP address updated', variable: currentPS5ipadr });
});

app.post(
  '/api/ps5/send-elf',
  express.raw({ type: () => true, limit: process.env.PS5_PAYLOAD_LIMIT || '200mb' }),
  async (req, res) => {
    try {
      const host = getRequiredPs5Host(req);
      const portToUse = Number.parseInt(String(req.query.port || req.body?.port || ps5ElfPort), 10);

      if (!Number.isInteger(portToUse) || portToUse <= 0 || portToUse > 65535) {
        return res.status(400).json({ ok: false, message: 'Invalid PS5 ELF loader port' });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ ok: false, message: 'Missing ELF/BIN payload body' });
      }

      const response = await sendTcpBuffer(host, portToUse, req.body, ps5TcpTimeoutMs);

      res.json({
        ok: true,
        message: `Payload sent to ${host}:${portToUse}`,
        bytes: req.body.length,
        response
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }
);

app.post('/api/ps5/install-url', async (req, res) => {
  try {
    const host = getRequiredPs5Host(req);
    const portToUse = Number.parseInt(String(req.body?.port || req.query.port || ps5DpiPort), 10);
    const url = String(req.body?.url || '').trim();

    if (!Number.isInteger(portToUse) || portToUse <= 0 || portToUse > 65535) {
      return res.status(400).json({ ok: false, message: 'Invalid PS5 Direct PKG Installer port' });
    }

    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, message: 'Missing or invalid PKG URL' });
    }

    const result = await ps5InstallUrl(host, url, portToUse);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/ps5/install', async (req, res) => {
  try {
    const filepath = resolvePkgPathForConsole(req.body.filepath, 'ps5');
    const host = getRequiredPs5Host(req);
    const portToUse = Number.parseInt(String(req.body?.port || req.query.port || ps5DpiPort), 10);

    if (!Number.isInteger(portToUse) || portToUse <= 0 || portToUse > 65535) {
      return res.status(400).json({ ok: false, message: 'Invalid PS5 Direct PKG Installer port' });
    }

    const info = getPkgLibraryInfo(filepath);
    const job = enqueueInstallJob({
      consoleType: 'ps5',
      filepath,
      host,
      port: portToUse,
      title: path.basename(filepath),
      platformLabel: info?.platformLabel || 'PS5'
    });

    const position = getInstallQueuePosition(job.id);

    res.status(202).json({
      ok: true,
      queued: true,
      job: getPublicInstallJob(job),
      queue: getInstallQueueSnapshot(),
      message: position > 1
        ? `Queued for PS5 at position ${position}`
        : `Queued for PS5 and starting now`
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.get('/ps5/tools', (req, res) => {
  res.type('html').send(renderPs5SupportPage());
});

app.get('/ps5/helper', (req, res) => {
  res.redirect('/ps5/tools');
});

app.get('/api/covers/missing', (req, res, next) => {
  try {
    const consoleType = getRequestedConsoleType(req);
    const dirs = flattenPkgs(getPkgsForConsole(consoleType));
    const missing = getMissingCovers(dirs);

    res.json({
      console: consoleType,
      missingCount: missing.length,
      missing
    });
  } catch (error) {
    next(error);
  }
});

function getCoverResultCounts(results = []) {
  return {
    downloaded: results.filter((item) => item.status === 'downloaded').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
    failed: results.filter((item) => item.status === 'failed').length,
    info: results.filter((item) => item.status === 'info').length
  };
}

function buildCoverDownloadResponse(checked, results = []) {
  const counts = getCoverResultCounts(results);

  return {
    message: checked === 0
      ? 'No missing covers or thumbnails found'
      : `Cover download finished: ${counts.downloaded} downloaded, ${counts.skipped} skipped, ${counts.failed} failed`,
    checked,
    downloaded: counts.downloaded,
    skipped: counts.skipped,
    failed: counts.failed,
    info: counts.info,
    results
  };
}

async function runMissingCoverDownload(onProgress = null, consoleType = 'ps4') {
  const emit = (payload) => {
    if (typeof onProgress === 'function') {
      onProgress(payload);
    }
  };

  const dirs = flattenPkgs(getPkgsForConsole(consoleType));
  const missing = getMissingCovers(dirs);

  emit({
    kind: 'start',
    checked: missing.length,
    counts: { downloaded: 0, skipped: 0, failed: 0, info: 0 }
  });

  if (missing.length === 0) {
    const emptyResult = buildCoverDownloadResponse(0, []);
    emit({ kind: 'done', result: emptyResult });
    return emptyResult;
  }

  let coverMap = {};
  const results = [];

  try {
    coverMap = await loadCoverMap();
  } catch (error) {
    const infoItem = {
      package: 'cover-map',
      type: 'info',
      status: 'info',
      reason: `Could not load GitHub cover map, trying fallback searches only: ${error.message}`
    };

    results.push(infoItem);
    emit({
      kind: 'item-result',
      index: 0,
      total: missing.length,
      item: infoItem,
      counts: getCoverResultCounts(results)
    });
  }

  for (let i = 0; i < missing.length; i += 1) {
    const item = missing[i];
    const titleId = extractTitleId(item.lookupText);

    emit({
      kind: 'item-start',
      index: i + 1,
      total: missing.length,
      item: {
        package: item.package || item.name,
        type: item.type,
        titleId,
        searchTitle: item.searchTitle
      },
      counts: getCoverResultCounts(results)
    });

    let resultItem = null;
    let lookup = null;

    try {
      lookup = await withTimeout(
        findCoverUrl(titleId, coverMap, item),
        coverItemTimeoutMs,
        `Timed out after ${coverItemTimeoutMs}ms while searching ${item.type} - ${item.package || item.name}`
      );
    } catch (error) {
      let timeoutRecovered = false;

      if (titleId && isCusaTitleId(titleId) && coverEnableOrbisPatches) {
        try {
          emit({
            kind: 'item-start',
            index: i + 1,
            total: missing.length,
            item: {
              package: item.package || item.name,
              type: item.type,
              titleId,
              searchTitle: item.searchTitle,
              fallback: 'Trying ORBISPatches after timeout'
            },
            counts: getCoverResultCounts(results)
          });

          const orbisLookup = await withTimeout(
            findCoverUrlFromOrbisPatches(titleId),
            Math.min(coverItemTimeoutMs, 15000),
            `ORBISPatches fallback timed out for ${titleId}`
          );

          if (orbisLookup.url) {
            const targetDir = item.type === 'thumbnail' ? thumbnailImagesPath : coverImagesPath;
            const savedAs = await downloadImageToFolder(orbisLookup.url, item.targetName, targetDir);

            resultItem = {
              package: item.package || item.name,
              type: item.type,
              titleId,
              searchTitle: item.searchTitle,
              status: 'downloaded',
              source: `${orbisLookup.source} after item timeout`,
              savedAs,
              savedTo: item.type === 'thumbnail' ? 'thumbnail' : 'images'
            };

            results.push(resultItem);
            timeoutRecovered = true;
          }
        } catch (orbisError) {
          // Fall through to skipped item below.
        }
      }

      if (!timeoutRecovered) {
        resultItem = {
          package: item.package || item.name,
          type: item.type,
          targetName: item.targetName,
          titleId,
          searchTitle: item.searchTitle,
          status: 'skipped',
          shortReason: 'Timed out. Moving to next item.',
          reason: `${error.message}. Moving to next item.`
        };

        results.push(resultItem);
      }

      emit({
        kind: 'item-result',
        index: i + 1,
        total: missing.length,
        item: resultItem,
        counts: getCoverResultCounts(results)
      });
      continue;
    }

    if (!lookup.url) {
      resultItem = {
        package: item.package || item.name,
        type: item.type,
        targetName: item.targetName,
        titleId,
        searchTitle: item.searchTitle,
        status: 'skipped',
        shortReason: 'No usable cover found after all sources',
        reason: lookup.reason || 'No cover URL found'
      };
      results.push(resultItem);
      emit({
        kind: 'item-result',
        index: i + 1,
        total: missing.length,
        item: resultItem,
        counts: getCoverResultCounts(results)
      });
      continue;
    }

    try {
      const targetDir = item.type === 'thumbnail' ? thumbnailImagesPath : coverImagesPath;
      const savedAs = await downloadImageToFolder(lookup.url, item.targetName, targetDir);

      resultItem = {
        package: item.package || item.name,
        type: item.type,
        titleId,
        searchTitle: item.searchTitle,
        status: 'downloaded',
        source: lookup.source,
        savedAs,
        savedTo: item.type === 'thumbnail' ? 'thumbnail' : 'images'
      };

      results.push(resultItem);
    } catch (error) {
      let fallbackSaved = false;

      if (item.searchTitle && !String(lookup.source || '').includes('playstation-store-search')) {
        const fallbackLookup = await findCoverUrlByStoreSearch(item.searchTitle);

        if (fallbackLookup.url) {
          try {
            const targetDir = item.type === 'thumbnail' ? thumbnailImagesPath : coverImagesPath;
            const savedAs = await downloadImageToFolder(fallbackLookup.url, item.targetName, targetDir);

            resultItem = {
              package: item.package || item.name,
              type: item.type,
              titleId,
              searchTitle: item.searchTitle,
              status: 'downloaded',
              source: `${fallbackLookup.source} after ${lookup.source} failed`,
              savedAs,
              savedTo: item.type === 'thumbnail' ? 'thumbnail' : 'images'
            };

            results.push(resultItem);
            fallbackSaved = true;
          } catch (fallbackError) {
            // Continue to ORBISPatches final fallback below.
          }
        }
      }

      if (!fallbackSaved && titleId && coverEnableOrbisPatches && !String(lookup.source || '').includes('orbispatches')) {
        const orbisLookup = await findCoverUrlFromOrbisPatches(titleId);

        if (orbisLookup.url) {
          try {
            const targetDir = item.type === 'thumbnail' ? thumbnailImagesPath : coverImagesPath;
            const savedAs = await downloadImageToFolder(orbisLookup.url, item.targetName, targetDir);

            resultItem = {
              package: item.package || item.name,
              type: item.type,
              titleId,
              searchTitle: item.searchTitle,
              status: 'downloaded',
              source: `${orbisLookup.source} after ${lookup.source} failed`,
              savedAs,
              savedTo: item.type === 'thumbnail' ? 'thumbnail' : 'images'
            };

            results.push(resultItem);
            fallbackSaved = true;
          } catch (orbisError) {
            resultItem = {
              package: item.package || item.name,
              type: item.type,
              targetName: item.targetName,
              titleId,
              searchTitle: item.searchTitle,
              status: 'failed',
              source: `${lookup.source}; final fallback ${orbisLookup.source}`,
              reason: `${error.message}; final fallback failed: ${orbisError.message}`
            };

            results.push(resultItem);
            fallbackSaved = true;
          }
        }
      }

      if (!fallbackSaved) {
        resultItem = {
          package: item.package || item.name,
          type: item.type,
          targetName: item.targetName,
          titleId,
          searchTitle: item.searchTitle,
          status: 'failed',
          source: lookup.source,
          reason: error.message
        };

        results.push(resultItem);
      }
    }

    emit({
      kind: 'item-result',
      index: i + 1,
      total: missing.length,
      item: resultItem,
      counts: getCoverResultCounts(results)
    });
  }

  const finalResult = buildCoverDownloadResponse(missing.length, results);
  emit({ kind: 'done', result: finalResult });
  return finalResult;
}

app.post('/api/covers/download-missing', async (req, res) => {
  try {
    const consoleType = getRequestedConsoleType(req);
    const result = await runMissingCoverDownload(null, consoleType);
    res.json({ ...result, console: consoleType });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/covers/download-missing/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let closed = false;
  const keepAlive = setInterval(() => {
    if (!closed) {
      res.write(': ping\n\n');
    }
  }, 15000);

  req.on('close', () => {
    closed = true;
  });

  const send = (payload) => {
    if (!closed) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  };

  try {
    const consoleType = getRequestedConsoleType(req);
    await runMissingCoverDownload(send, consoleType);
  } catch (error) {
    send({ kind: 'error', message: error.message });
  } finally {
    clearInterval(keepAlive);
    if (!closed) {
      res.end();
    }
  }
});


app.get('/api/install-queue', (req, res) => {
  res.json(getInstallQueueSnapshot());
});

app.post('/api/install-queue/clear-completed', (req, res) => {
  installQueue = installQueue.filter((job) => ['queued', 'running'].includes(job.status));
  res.json(getInstallQueueSnapshot());
});

app.post('/install', async (req, res) => {
  try {
    const filepath = resolvePkgPath(req.body.filepath);
    const info = getPkgLibraryInfo(filepath);
    const job = enqueueInstallJob({
      consoleType: 'ps4',
      filepath,
      title: path.basename(filepath),
      platformLabel: info?.platformLabel || 'PS4'
    });

    const position = getInstallQueuePosition(job.id);

    res.status(202).json({
      ok: true,
      queued: true,
      job: getPublicInstallJob(job),
      queue: getInstallQueueSnapshot(),
      message: position > 1
        ? `Queued for PS4 at position ${position}`
        : `Queued for PS4 and starting now`
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Server error');
});

app.listen(port, () => {
  console.log(`PS4/PS5 PKG sender listening on port ${port} serving files from ${staticFilesPath}`);
  console.log(`PS5 Relapse static path: ${ps5RelapseDir}`);
});

function flattenPkgs(pkgs) {
  return Object.keys(pkgs)
    .sort((a, b) => a.localeCompare(b))
    .map((root) => {
      const rootPkgs = pkgs[root].sort((a, b) => a.name.localeCompare(b.name));
      rootPkgs.forEach((pkg) => {
        pkg.displayName = getPkgDisplayName(pkg);
        pkg.shortDisplayName = pkg.shortDisplayName || pkg.displayName;
        pkg.platformLabel = pkg.platformLabel || 'PS4';
        pkg.platform = String(pkg.platform || pkg.platformLabel).toLowerCase();
      });
      const bytes = rootPkgs.reduce((sum, pkg) => sum + pkg.bytes, 0);
      const firstPkg = rootPkgs[0] || { imgname: 'folder.png', platformLabel: 'PS4', root };
      const folderThumbBase = firstPkg.root || root;
      const folderThumbname = `${safeFileBase(folderThumbBase)}.jpg`;

      return {
        id: crypto.randomUUID(),
        root,
        count: rootPkgs.length,
        platformLabel: firstPkg.platformLabel || 'PS4',
        platform: String(firstPkg.platform || firstPkg.platformLabel || 'ps4').toLowerCase(),
        bytes,
        folderImgname: firstPkg.imgname,
        folderThumbname,
        folderThumbUrl: encodePublicImageUrl('thumbnail', folderThumbname),
        folderFallbackThumbUrl: firstPkg.imgUrl || encodePublicImageUrl('images', firstPkg.imgname || 'folder.png'),
        pkgs: rootPkgs
      };
    });
}


function getPkgsForConsole(consoleType = 'ps4') {
  const isPs5 = String(consoleType).toLowerCase() === 'ps5';

  if (isPs5) {
    return mergePkgMaps(
      getPkgsFromRoot(ps4PkgPath, 'PS4', true),
      getPkgsFromRoot(ps5PkgPath, 'PS5', true)
    );
  }

  return getPkgsFromRoot(ps4PkgPath, 'PS4', false);
}

function mergePkgMaps(...maps) {
  const merged = {};

  maps.forEach((map) => {
    Object.entries(map || {}).forEach(([root, pkgs]) => {
      if (!merged[root]) merged[root] = [];
      merged[root].push(...pkgs);
    });
  });

  return merged;
}

function getPkgs() {
  return getPkgsFromRoot(ps4PkgPath, 'PS4', false);
}

function getPkgsFromRoot(rootPath, platform = 'PS4', prefixRoot = false) {
  const filelist = {};
  const basePath = path.resolve(rootPath);
  const platformLabel = String(platform || 'PS4').toUpperCase();

  if (!fs.existsSync(basePath)) {
    return filelist;
  }

  function walkSync(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    files.forEach((file) => {
      const filepath = path.join(dir, file.name);

      if (file.isDirectory()) {
        walkSync(filepath);
        return;
      }

      if (!file.isFile() || path.extname(file.name).toLowerCase() !== '.pkg') {
        return;
      }

      const stat = fs.statSync(filepath);
      const relativePath = path.relative(basePath, filepath);
      const relativeDir = path.dirname(relativePath);
      const name = path.basename(filepath);
      const fileBaseName = path.parse(name).name;

      // If a PKG is placed directly in PS4Games/PS5Games, do not show it as "Root".
      // Use the PKG filename without .pkg as the virtual folder name instead.
      const dirname = relativeDir === '.' ? fileBaseName : relativeDir;
      const rawRoot = relativeDir === '.' ? fileBaseName : (dirname.split(path.sep)[0] || fileBaseName || 'Root');
      const root = prefixRoot ? `${platformLabel} / ${rawRoot}` : rawRoot;

      if (!filelist[root]) filelist[root] = [];

      filelist[root].push({
        filepath,
        relativePath,
        dir: dirname,
        root: rawRoot,
        displayRoot: root,
        name,
        platform: platformLabel.toLowerCase(),
        platformLabel,
        libraryRoot: basePath,
        pkgUrlPrefix: platformLabel.toLowerCase(),
        imgname: `${path.parse(filepath).name}.jpg`,
        imgUrl: encodePublicImageUrl('images', `${path.parse(filepath).name}.jpg`),
        size: formatFileSize(stat.size),
        bytes: stat.size,
        searchText: `${platformLabel} ${root} ${dirname} ${name}`.toLowerCase()
      });
    });
  }

  walkSync(basePath);
  return filelist;
}

function getPkgLibraryInfo(filepath) {
  const requestedPath = path.resolve(String(filepath || ''));
  const candidates = [
    { root: ps4PkgPath, platform: 'ps4', platformLabel: 'PS4' },
    { root: ps5PkgPath, platform: 'ps5', platformLabel: 'PS5' }
  ];

  for (const candidate of candidates) {
    const rootPath = path.resolve(candidate.root);
    const relative = path.relative(rootPath, requestedPath);

    if (requestedPath && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return {
        ...candidate,
        root: rootPath,
        relative
      };
    }
  }

  return null;
}

function resolvePkgPathForConsole(filepath, consoleType = 'ps4') {
  const requestedPath = path.resolve(String(filepath || ''));
  const info = getPkgLibraryInfo(requestedPath);
  const targetConsole = String(consoleType || 'ps4').toLowerCase();

  if (!info) {
    throw new Error('Invalid package path');
  }

  if (targetConsole === 'ps4' && info.platform !== 'ps4') {
    throw new Error('PS4 view can only install packages from PS4Games');
  }

  if (targetConsole === 'ps5' && !['ps4', 'ps5'].includes(info.platform)) {
    throw new Error('PS5 view can only install packages from PS4Games or PS5Games');
  }

  if (path.extname(requestedPath).toLowerCase() !== '.pkg' || !fs.existsSync(requestedPath)) {
    throw new Error('Package not found');
  }

  return requestedPath;
}

function resolvePkgPath(filepath) {
  return resolvePkgPathForConsole(filepath, 'ps4');
}

function encodeRelativeUrlForRoot(rootPath, filepath) {
  return path.relative(rootPath, filepath)
    .split(path.sep)
    .map(encodeURIComponent)
    .join('/');
}

function encodeRelativeUrl(filepath) {
  return encodeRelativeUrlForRoot(ps4PkgPath, filepath);
}

function buildPublicPkgUrl(filepath) {
  const info = getPkgLibraryInfo(filepath);

  if (!info) {
    throw new Error('Invalid package path');
  }

  return `${publicBaseUrl}/pkgfiles/${info.platform}/${encodeRelativeUrlForRoot(info.root, filepath)}`;
}

function ps4Install(filepath) {
  return new Promise((resolve, reject) => {
    const pkgUri = buildPublicPkgUrl(filepath);
    const ps4ApiUri = `http://${currentPS4ipadr}:12800/api/install`;
    const payload = JSON.stringify({ type: 'direct', packages: [pkgUri] });

    execFile('curl', ['-sS', '-v', ps4ApiUri, '--data', payload], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`Install request failed: ${stderr || err.message}`));
      }

      resolve({
        message: `Install request sent for ${path.basename(filepath)}`,
        package: path.basename(filepath),
        url: pkgUri,
        stdout,
        stderr
      });
    });
  });
}

function getRequiredPs5Host(req) {
  const host = String(req.body?.host || req.query?.host || currentPS5ipadr || '').trim();

  if (!host) {
    throw new Error('Missing PS5 host/IP. Set PS5IP/PS5_HOST, update /api/ps5ip, or pass host.');
  }

  if (!isValidHost(host)) {
    throw new Error('Invalid PS5 IP/host');
  }

  return host;
}

function sendTcpBuffer(host, portNumber, buffer, timeoutMs = ps5TcpTimeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = Buffer.alloc(0);
    let finished = false;

    const done = (error, result = '') => {
      if (finished) return;
      finished = true;
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);

    socket.on('data', (chunk) => {
      response = Buffer.concat([response, chunk]);
    });

    socket.on('timeout', () => {
      done(new Error(`TCP timeout connecting to ${host}:${portNumber}`));
    });

    socket.on('error', done);

    socket.on('close', () => {
      done(null, response.toString('utf8').trim());
    });

    socket.connect(portNumber, host, () => {
      socket.write(buffer);
      socket.end();
    });
  });
}

async function ps5InstallUrl(host, url, portToUse = ps5DpiPort) {
  const payload = Buffer.from(JSON.stringify({ url }), 'utf8');
  const response = await sendTcpBuffer(host, portToUse, payload, ps5TcpTimeoutMs);

  return {
    ok: true,
    message: `Install URL sent to PS5 ${host}:${portToUse}`,
    url,
    response
  };
}


function renderConsoleSelectPage() {
  const ps5RelapseAvailable = fs.existsSync(ps5RelapseDir);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PKG Sender</title>
  <link rel="stylesheet" href="/css/fontawesome.min.css">
  <link rel="stylesheet" href="/css/solid.min.css">
  <style>
    :root {
      --bg: #07111f;
      --panel: rgba(15, 23, 42, 0.86);
      --border: rgba(255,255,255,0.14);
      --text: #eef3ff;
      --muted: #a9b8d4;
      --blue: #3b82f6;
      --cyan: #06b6d4;
      --green: #22c55e;
      --shadow: 0 30px 100px rgba(0,0,0,.45);
    }

    * { box-sizing: border-box; }

    body {
      min-height: 100vh;
      margin: 0;
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 16% 12%, rgba(59,130,246,.28), transparent 34rem),
        radial-gradient(circle at 84% 16%, rgba(34,197,94,.18), transparent 32rem),
        linear-gradient(135deg, #050914, var(--bg));
    }

    main {
      min-height: 100vh;
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      display: grid;
      place-items: center;
      padding: 32px 0;
    }

    .landing-wrap {
      width: 100%;
    }

    .landing-hero {
      margin-bottom: 22px;
      text-align: center;
    }

    .eyebrow {
      margin: 0 0 12px;
      color: #7dd3fc;
      font-size: .78rem;
      font-weight: 950;
      letter-spacing: .18em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0 0 14px;
      font-size: clamp(3.4rem, 9vw, 7.6rem);
      line-height: .9;
      letter-spacing: -.07em;
      text-shadow: 0 16px 58px rgba(0,0,0,.48);
    }

    .landing-hero p {
      max-width: 760px;
      margin: 0 auto;
      color: var(--muted);
      font-size: clamp(1rem, 1.7vw, 1.25rem);
      line-height: 1.6;
    }

    .console-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 22px;
      margin-top: 32px;
    }

    .console-button {
      position: relative;
      min-height: 330px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      padding: 28px;
      color: var(--text);
      text-decoration: none;
      border: 1px solid var(--border);
      border-radius: 30px;
      background: var(--panel);
      box-shadow: var(--shadow);
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
      isolation: isolate;
    }

    .console-button::before {
      content: "";
      position: absolute;
      inset: -40%;
      z-index: -1;
      opacity: .72;
      background:
        radial-gradient(circle at 20% 22%, rgba(59,130,246,.42), transparent 35%),
        radial-gradient(circle at 80% 78%, rgba(14,165,233,.28), transparent 36%);
      transition: transform .25s ease, opacity .18s ease;
    }

    .console-button.ps5::before {
      background:
        radial-gradient(circle at 20% 22%, rgba(34,197,94,.34), transparent 35%),
        radial-gradient(circle at 80% 78%, rgba(6,182,212,.28), transparent 36%);
    }

    .console-button:hover {
      transform: translateY(-5px);
      border-color: rgba(125,211,252,.42);
      background: rgba(15, 23, 42, .94);
    }

    .console-button:hover::before {
      opacity: 1;
      transform: scale(1.05);
    }

    .console-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: min(100%, 380px);
      min-height: 130px;
      color: #fff;
      font-size: clamp(5rem, 14vw, 8.6rem);
      font-weight: 1000;
      letter-spacing: -.12em;
      line-height: .85;
      text-shadow: 0 18px 58px rgba(0,0,0,.54);
    }

    .console-logo span {
      letter-spacing: -.04em;
    }

    .console-title {
      margin-top: 20px;
    }

    .console-title h2 {
      margin: 0 0 10px;
      font-size: clamp(1.8rem, 4vw, 2.8rem);
      line-height: 1;
    }

    .console-title p {
      margin: 0;
      color: var(--muted);
      font-size: 1rem;
      line-height: 1.55;
    }

    .console-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 20px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      color: #e0f2fe;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      font-size: .86rem;
      font-weight: 850;
    }

    .landing-footer {
      margin-top: 20px;
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .small-link {
      color: #bae6fd;
      text-decoration: none;
      font-weight: 800;
    }

    .small-link:hover { text-decoration: underline; }

    @media (max-width: 820px) {
      .console-grid {
        grid-template-columns: 1fr;
      }

      .console-button {
        min-height: 260px;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="landing-wrap">
      <div class="landing-hero">
        <p class="eyebrow">PKG Sender</p>
        <h1>Choose console</h1>
        <p>Select the console you want to manage. PS4 shows only PS4Games. PS5 shows PS4Games plus PS5Games and sends install URLs through etaHEN Direct PKG Installer.</p>
      </div>

      <div class="console-grid">
        <a class="console-button ps4" href="/ps4" aria-label="Open PS4 package library">
          <div>
            <div class="console-logo">PS<span>4</span></div>
            <div class="console-title">
              <h2>PS4 library</h2>
              <p>Browse your packages and send install requests to your PS4.</p>
            </div>
          </div>
          <div class="console-meta">
            <span class="pill"><i class="fa-solid fa-cloud-arrow-down"></i> Port 12800</span>
            <span class="pill">Package installer</span>
          </div>
        </a>

        <a class="console-button ps5" href="/ps5" aria-label="Open PS5 package library">
          <div>
            <div class="console-logo">PS<span>5</span></div>
            <div class="console-title">
              <h2>PS5 library</h2>
              <p>Browse PS4-compatible packages and native PS5 packages, then send install URLs with etaHEN DPI.</p>
            </div>
          </div>
          <div class="console-meta">
            <span class="pill"><i class="fa-solid fa-bolt"></i> Relapse ${ps5RelapseAvailable ? 'ready' : 'missing'}</span>
            <span class="pill">DPI ${ps5DpiPort}</span>
          </div>
        </a>
      </div>

      <div class="landing-footer">
        <a class="small-link" href="/ps5/tools">PS5 Relapse tools</a>
        <span style="color:rgba(255,255,255,.24)">•</span>
        <a class="small-link" href="/ps5/relapse/">Open Relapse host</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}


function renderPs5SupportPage() {
  const escapedHost = escapeHtml(currentPS5ipadr || '');
  const relapseAvailable = fs.existsSync(ps5RelapseDir);
  const etaHenWebUrl = currentPS5ipadr ? `http://${escapeHtml(currentPS5ipadr)}:${ps5DpiWebPort}` : '#';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PS5 Relapse Support - PKG Sender</title>
  <style>
    body { margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #eef3ff; background: radial-gradient(circle at top left, rgba(59,130,246,.28), transparent 32rem), #07111f; }
    main { width: min(980px, calc(100% - 28px)); margin: 0 auto; padding: 28px 0 60px; }
    .card { margin: 0 0 18px; padding: 22px; border: 1px solid rgba(255,255,255,.14); border-radius: 20px; background: rgba(15,23,42,.88); box-shadow: 0 22px 80px rgba(0,0,0,.35); }
    h1 { margin: 0 0 10px; font-size: clamp(2.2rem, 6vw, 4rem); line-height: .95; }
    h2 { margin: 0 0 14px; }
    p { color: #a9b8d4; line-height: 1.55; }
    label { display: grid; gap: 8px; margin: 12px 0; font-weight: 800; color: #cbd5e1; }
    input { min-height: 46px; padding: 8px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.18); color: #fff; background: rgba(255,255,255,.08); }
    button, a.button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px; border: 0; border-radius: 12px; color: #fff; background: #2563eb; font-weight: 900; text-decoration: none; cursor: pointer; }
    button.secondary, a.secondary { background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.16); }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .status { min-height: 24px; color: #7dd3fc; font-weight: 800; }
    code { color: #93c5fd; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>PS5 Relapse Support</h1>
      <p>Host the Relapse page locally, send ELF/BIN payloads to the PS5 ELF loader, and send PKG URLs to etaHEN Direct PKG Installer.</p>
      <p>Relapse folder: <code>${escapeHtml(ps5RelapseDir)}</code> ${relapseAvailable ? '✅ found' : '⚠️ not found yet'}</p>
    </section>

    <section class="card">
      <h2>PS5 connection</h2>
      <label>PS5 IP / host
        <input id="ps5Host" value="${escapedHost}" placeholder="192.168.1.110">
      </label>
      <div class="row">
        <button id="saveHost">Save PS5 IP</button>
        <a class="button secondary" href="/ps5/relapse/" target="_blank" rel="noopener">Open Relapse host</a>
        <a id="etaHenWeb" class="button secondary" href="${etaHenWebUrl}" target="_blank" rel="noopener">Open etaHEN WebUI</a>
      </div>
      <p id="hostStatus" class="status"></p>
    </section>

    <section class="card">
      <h2>Send ELF payload</h2>
      <p>Run Relapse on the PS5 first. After the ELF loader is listening, send a payload to port ${ps5ElfPort}.</p>
      <label>ELF/BIN payload
        <input id="elfFile" type="file" accept=".elf,.bin,application/octet-stream">
      </label>
      <button id="sendElf">Send payload</button>
      <p id="elfStatus" class="status"></p>
    </section>

    <section class="card">
      <h2>etaHEN Direct PKG Installer</h2>
      <p>Send any HTTP/HTTPS PKG URL to etaHEN on port ${ps5DpiPort}.</p>
      <label>PKG URL
        <input id="pkgUrl" placeholder="${escapeHtml(publicBaseUrl)}/pkgfiles/Game.pkg">
      </label>
      <button id="sendPkgUrl">Send install URL</button>
      <p id="pkgStatus" class="status"></p>
    </section>
  </main>

  <script>
    const qs = (id) => document.getElementById(id);

    function host() { return qs('ps5Host').value.trim(); }

    function updateEtaHenLink() {
      const value = host();
      qs('etaHenWeb').href = value ? 'http://' + value + ':${ps5DpiWebPort}' : '#';
    }

    qs('ps5Host').addEventListener('input', updateEtaHenLink);

    qs('saveHost').addEventListener('click', async () => {
      qs('hostStatus').textContent = 'Saving...';
      const res = await fetch('/api/ps5ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPS5ipadr: host() })
      });
      const data = await res.json();
      qs('hostStatus').textContent = data.message || data.error || data.message || (res.ok ? 'Saved' : 'Failed');
      updateEtaHenLink();
    });

    qs('sendElf').addEventListener('click', async () => {
      const file = qs('elfFile').files[0];
      if (!host()) { qs('elfStatus').textContent = 'Missing PS5 IP.'; return; }
      if (!file) { qs('elfStatus').textContent = 'Choose an ELF/BIN file first.'; return; }

      qs('elfStatus').textContent = 'Sending ' + file.name + '...';
      try {
        const res = await fetch('/api/ps5/send-elf?host=' + encodeURIComponent(host()), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: await file.arrayBuffer()
        });
        const data = await res.json();
        qs('elfStatus').textContent = data.message || (res.ok ? 'Payload sent.' : 'Failed.');
      } catch (error) {
        qs('elfStatus').textContent = error.message;
      }
    });

    qs('sendPkgUrl').addEventListener('click', async () => {
      if (!host()) { qs('pkgStatus').textContent = 'Missing PS5 IP.'; return; }
      const url = qs('pkgUrl').value.trim();
      if (!url) { qs('pkgStatus').textContent = 'Missing PKG URL.'; return; }

      qs('pkgStatus').textContent = 'Sending install URL...';
      try {
        const res = await fetch('/api/ps5/install-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: host(), url })
        });
        const data = await res.json();
        qs('pkgStatus').textContent = data.message || (res.ok ? 'Install URL sent.' : 'Failed.');
      } catch (error) {
        qs('pkgStatus').textContent = error.message;
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function getMissingCovers(dirs) {
  const missing = [];
  const addedFolderThumbs = new Set();

  dirs.forEach((dir) => {
    const firstPkg = dir.pkgs[0];

    if (!imageExistsWithLegacyAlias(thumbnailImagesPath, dir.folderThumbname) && firstPkg && !addedFolderThumbs.has(dir.root)) {
      missing.push({
        type: 'thumbnail',
        root: dir.root,
        dir: firstPkg.dir,
        name: `${dir.root} folder thumbnail`,
        package: firstPkg.name,
        targetName: dir.folderThumbname,
        lookupText: `${dir.root} ${firstPkg.dir} ${firstPkg.name}`,
        searchTitle: buildSearchTitle(dir.root, firstPkg.name)
      });

      addedFolderThumbs.add(dir.root);
    }

    dir.pkgs.forEach((pkg) => {
      if (!imageExistsWithLegacyAlias(coverImagesPath, pkg.imgname)) {
        missing.push({
          type: 'image',
          root: dir.root,
          dir: pkg.dir,
          name: pkg.name,
          package: pkg.name,
          targetName: pkg.imgname,
          lookupText: `${dir.root} ${pkg.root || ''} ${pkg.dir} ${pkg.name}`,
          searchTitle: buildSearchTitle(pkg.root || dir.root, pkg.name)
        });
      }
    });
  });

  return missing;
}


function isBadSerialStationImageUrl(imageUrl) {
  const value = String(imageUrl || '').toLowerCase();

  return (
    !value ||
    value.includes('/favicon') ||
    value.includes('apple-touch-icon') ||
    value.includes('android-chrome') ||
    value.includes('mstile') ||
    value.includes('/logo') ||
    value.includes('playstation.svg') ||
    value.includes('ps.svg') ||
    value.includes('xbox.svg') ||
    value.includes('nintendo.svg')
  );
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x3D;/g, '=')
    .replace(/&#x3F;/g, '?')
    .replace(/&#x26;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeImageUrl(imageUrl, baseUrl = 'https://serialstation.com') {
  let value = decodeHtmlEntities(String(imageUrl || '').trim());

  if (value.startsWith('//')) {
    value = `https:${value}`;
  } else if (value.startsWith('/')) {
    value = `${baseUrl}${value}`;
  }

  return value;
}

function isProbablyImageUrl(imageUrl) {
  const value = normalizeImageUrl(imageUrl).toLowerCase();

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  if (isBadSerialStationImageUrl(value)) {
    return false;
  }

  if (
    value.includes('/store/api/') ||
    value.includes('/chihiro-api/') ||
    value.includes('/container/') ||
    value.includes('/titlecontainer/') ||
    value.includes('/concept/')
  ) {
    return false;
  }

  return (
    /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(value) ||
    value.includes('image.api.playstation.com') ||
    value.includes('store.playstation.com/store/api/chihiro/00_09_000/image') ||
    value.includes('/media/') ||
    value.includes('/images/')
  );
}

function absolutizeUrl(url, baseUrl = 'https://serialstation.com') {
  return normalizeImageUrl(url, baseUrl);
}

function extractSerialStationLinks(html) {
  const links = [];
  const source = String(html || '');
  const regex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const url = absolutizeUrl(match[1]);

    if (url.includes('serialstation.com/titles/') || url.includes('serialstation.com/games/')) {
      links.push(url);
    }
  }

  return [...new Set(links)];
}

function extractContentIdsFromHtml(html) {
  return [...new Set(
    Array.from(
      String(html || '').matchAll(/\b[A-Z]{2}\d{4}-[A-Z0-9_-]+_00-[A-Z0-9_]+\b/gi)
    ).map((match) => match[0].toUpperCase())
  )];
}

function getObjectKeyScore(key) {
  const normalized = String(key || '').toLowerCase();

  if (['url', 'src', 'imageurl', 'thumbnailurl', 'previewurl'].includes(normalized)) return 5;
  if (normalized.includes('image')) return 4;
  if (normalized.includes('thumbnail')) return 4;
  if (normalized.includes('cover')) return 4;
  if (normalized.includes('poster')) return 3;
  if (normalized.includes('media')) return 2;

  return 0;
}


function extractAllTitleIds(value) {
  const text = String(value || '');
  const ids = [];

  // PS4 CUSA and PS5 PPSA IDs. Use custom boundaries so IDs after underscores are detected.
  for (const match of text.matchAll(/(^|[^A-Z0-9])((?:CUSA|PPSA)\d{5})(?=$|[^A-Z0-9])/gi)) {
    ids.push(match[2].toUpperCase());
  }

  // PS1/PS2/PSP/PSN style SerialStation IDs.
  // This also matches filenames like Castlevania_SLUS00067.pkg and Metal_Gear_Solid_2_SLUS20144.pkg.
  for (const match of text.matchAll(/(^|[^A-Z0-9])(SLUS|SCUS|SCES|SLES|SLPS|SLPM|NPUJ|NPUI|NPEF|NPUG|NPEG|NPUB|NPEB|NPHG|ULUS|ULES|UCUS|UCES)[\s._-]*(\d{5})(?=$|[^A-Z0-9])/gi)) {
    ids.push(`${match[2].toUpperCase()}${match[3]}`);
  }

  return [...new Set(ids)];
}


function isCusaTitleId(titleId) {
  return /^CUSA\d{5}$/i.test(String(titleId || ''));
}

function isPpsaTitleId(titleId) {
  return /^PPSA\d{5}$/i.test(String(titleId || ''));
}

function isPlayStationStoreTitleId(titleId) {
  return /^(CUSA|PPSA)\d{5}$/i.test(String(titleId || ''));
}

function isSerialStationTitleId(titleId) {
  return /^(CUSA|SLUS|SCUS|SCES|SLES|SLPS|SLPM|NPUJ|NPUI|NPEF|NPUG|NPEG|NPUB|NPEB|NPHG|ULUS|ULES|UCUS|UCES)\d{5}$/i.test(String(titleId || ''));
}


function extractTitleId(value) {
  const ids = extractAllTitleIds(value);
  return ids.find((id) => isPlayStationStoreTitleId(id)) || ids[0] || null;
}

function extractLegacyTitleId(value) {
  const ids = extractAllTitleIds(value);
  return ids.find((id) => !isCusaTitleId(id)) || null;
}

function extractContentId(value) {
  const match = String(value || '').match(/\b[A-Z]{2}\d{4}-[A-Z0-9_-]+_00-[A-Z0-9_]+\b/i);
  return match ? match[0].toUpperCase() : null;
}


async function loadCoverMap() {
  const response = await fetchWithTimeout(coverMapUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ps4-pkg-sender'
    }
  });

  if (!response.ok) {
    throw new Error(`Could not download cover map: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Cover map is not a valid JSON object');
  }

  return data;
}

async function findCoverUrl(titleId, coverMap, item = {}) {
  const lookupText = item.lookupText || '';
  const allTitleIds = extractAllTitleIds(lookupText);
  const playStationStoreTitleIds = allTitleIds.filter((id) => isPlayStationStoreTitleId(id));
  const cusaTitleIds = allTitleIds.filter((id) => isCusaTitleId(id));
  const serialTitleIds = allTitleIds.filter((id) => isSerialStationTitleId(id));
  const contentId = extractContentId(lookupText);
  const searchTitle = item.searchTitle || cleanGameTitle(lookupText);
  const tried = [];

  // 1. GitHub cover map for CUSA IDs and PlayStation Store for CUSA/PPSA IDs.
  for (const storeTitleId of playStationStoreTitleIds) {
    if (isCusaTitleId(storeTitleId) && coverMap && coverMap[storeTitleId]) {
      return {
        url: coverMap[storeTitleId],
        source: 'github-cover-map'
      };
    }

    const storeResult = await findCoverUrlFromPlayStationStore(storeTitleId);
    tried.push(`PlayStation Store ${storeTitleId}: ${storeResult.reason || (storeResult.url ? 'ok' : 'no result')}`);

    if (storeResult.url) {
      return storeResult;
    }
  }

  // 2. SerialStation by any supported title ID, not only CUSA.
  for (const serialId of serialTitleIds) {
    const serialTitleResult = await findCoverUrlFromSerialStationTitleId(serialId);
    tried.push(`SerialStation ${serialId}: ${serialTitleResult.reason || (serialTitleResult.url ? 'ok' : 'no result')}`);

    if (serialTitleResult.url) {
      return serialTitleResult;
    }
  }

  // 3. ORBISPatches early fallback for CUSA IDs.
  // Some titles are found quickly in ORBISPatches, while generic title searches can be slow.
  // Trying ORBIS here prevents CUSA items from timing out before ORBIS is reached.
  if (coverEnableOrbisPatches) {
    for (const cusaId of cusaTitleIds) {
      const orbisResult = await findCoverUrlFromOrbisPatches(cusaId);
      tried.push(`ORBISPatches early ${cusaId}: ${orbisResult.reason || (orbisResult.url ? 'ok' : 'no result')}`);

      if (orbisResult.url) {
        return orbisResult;
      }
    }
  }

  // 4. Content ID lookup, if the filename includes one.
  if (contentId) {
    const contentResult = await findCoverUrlFromContentId(contentId);
    tried.push(`Content ID ${contentId}: ${contentResult.reason || (contentResult.url ? 'ok' : 'no result')}`);

    if (contentResult.url) {
      return contentResult;
    }
  }

  // 4. If this is an old PS1/PS2/PSP ID, try the clean alias title before the noisy filename title.
  const aliasSearchTitle = cleanCoverSearchTitle(lookupText);

  if (aliasSearchTitle && aliasSearchTitle !== searchTitle) {
    const aliasSerialSearchResult = await findCoverUrlFromSerialStationSearch(aliasSearchTitle);
    tried.push(`SerialStation alias search "${aliasSearchTitle}": ${aliasSerialSearchResult.reason || (aliasSerialSearchResult.url ? 'ok' : 'no result')}`);

    if (aliasSerialSearchResult.url) {
      return aliasSerialSearchResult;
    }

    const aliasStoreSearchResult = await findCoverUrlByStoreSearch(aliasSearchTitle);
    tried.push(`PlayStation alias search "${aliasSearchTitle}": ${aliasStoreSearchResult.reason || (aliasStoreSearchResult.url ? 'ok' : 'no result')}`);

    if (aliasStoreSearchResult.url) {
      return aliasStoreSearchResult;
    }
  }

  // 5. SerialStation title search, then PlayStation Store title search.
  if (searchTitle) {
    const serialSearchResult = await findCoverUrlFromSerialStationSearch(searchTitle);
    tried.push(`SerialStation title search "${searchTitle}": ${serialSearchResult.reason || (serialSearchResult.url ? 'ok' : 'no result')}`);

    if (serialSearchResult.url) {
      return serialSearchResult;
    }

    const storeSearchResult = await findCoverUrlByStoreSearch(searchTitle);
    tried.push(`PlayStation title search "${searchTitle}": ${storeSearchResult.reason || (storeSearchResult.url ? 'ok' : 'no result')}`);

    if (storeSearchResult.url) {
      return storeSearchResult;
    }

    const cleanerSearchTitle = cleanCoverSearchTitle(searchTitle);

    if (cleanerSearchTitle && cleanerSearchTitle !== searchTitle) {
      const cleanerStoreResult = await findCoverUrlByStoreSearch(cleanerSearchTitle);
      tried.push(`PlayStation clean title search "${cleanerSearchTitle}": ${cleanerStoreResult.reason || (cleanerStoreResult.url ? 'ok' : 'no result')}`);

      if (cleanerStoreResult.url) {
        return cleanerStoreResult;
      }
    }
  }

  return {
    url: null,
    reason: [
      allTitleIds.length ? `title IDs checked: ${allTitleIds.join(', ')}` : 'No title ID found',
      searchTitle ? `search title: "${searchTitle}"` : 'no usable title text',
      tried.length ? tried.join('; ') : null
    ].filter(Boolean).join('; ')
  };
}


async function findCoverUrlFromPlayStationStore(titleId) {
  const errors = [];

  for (const region of coverStoreRegions) {
    const [country, language] = region.split('/');
    if (!country || !language) continue;

    const url = `https://store.playstation.com/store/api/chihiro/00_09_000/titlecontainer/${encodeURIComponent(country)}/${encodeURIComponent(language)}/999/${encodeURIComponent(titleId)}_00`;

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ps4-pkg-sender'
        }
      });

      if (!response.ok) {
        errors.push(`${country}/${language}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const imageUrl = findImageUrlInObject(data);

      if (imageUrl) {
        return {
          url: imageUrl,
          source: `playstation-store-${country}-${language}`
        };
      }

      errors.push(`${country}/${language}: no image`);
    } catch (error) {
      errors.push(`${country}/${language}: ${error.message}`);
    }
  }

  return {
    url: null,
    reason: errors.join('; ')
  };
}

async function findCoverUrlFromContentId(contentId) {
  const errors = [];

  for (const region of coverStoreRegions) {
    const [country, language] = region.split('/');
    if (!country || !language) continue;

    const url = `https://store.playstation.com/store/api/chihiro/00_09_000/container/${encodeURIComponent(country)}/${encodeURIComponent(language)}/999/${encodeURIComponent(contentId)}`;

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ps4-pkg-sender'
        }
      });

      if (!response.ok) {
        errors.push(`${country}/${language}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const imageUrl = findImageUrlInObject(data);

      if (imageUrl) {
        return {
          url: imageUrl,
          source: `playstation-store-content-${country}-${language}`
        };
      }

      errors.push(`${country}/${language}: no image`);
    } catch (error) {
      errors.push(`${country}/${language}: ${error.message}`);
    }
  }

  return {
    url: null,
    reason: errors.join('; ')
  };
}

async function findCoverUrlFromOrbisPatches(titleId) {
  try {
    const response = await fetchWithTimeout(`https://orbispatches.com/${encodeURIComponent(titleId)}`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'ps4-pkg-sender'
      }
    });

    if (!response.ok) {
      return { url: null, reason: `orbispatches HTTP ${response.status}` };
    }

    const html = await response.text();

    // Best source from ORBISPatches is the Content ID because it can be used
    // against PlayStation/Sony metadata endpoints.
    const contentMatch = html.match(/\b[A-Z]{2}\d{4}-CUSA\d{5}_00-[A-Z0-9_]+\b/i);

    if (contentMatch) {
      const contentResult = await findCoverUrlFromContentId(contentMatch[0].toUpperCase());

      if (contentResult.url) {
        return {
          ...contentResult,
          source: `orbispatches-content-id-${contentResult.source}`
        };
      }
    }

    // If PlayStation Store metadata fails, use the visible ORBISPatches image.
    // ORBISPatches often uses webp CDN images and may not always return a useful
    // content-type header, so downloadImageToFolder validates the actual bytes too.
    const imageUrl = findImageUrlInHtml(html);

    if (imageUrl) {
      return {
        url: imageUrl,
        source: 'orbispatches-direct-image'
      };
    }

    return { url: null, reason: 'orbispatches had no usable content ID or image' };
  } catch (error) {
    return { url: null, reason: `orbispatches: ${error.message}` };
  }
}


async function findCoverUrlFromSerialStationTitleId(titleId, visited = new Set()) {
  const match = String(titleId || '').match(/^([A-Z]{4})(\d{5})$/i);
  if (!match) return { url: null, reason: 'invalid SerialStation title ID' };

  const normalizedTitleId = `${match[1].toUpperCase()}${match[2]}`;
  const url = `https://serialstation.com/titles/${match[1].toUpperCase()}/${match[2]}`;

  if (visited.has(url)) {
    return { url: null, reason: 'serialstation title already checked' };
  }

  visited.add(url);

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'ps4-pkg-sender'
      }
    });

    if (!response.ok) {
      return { url: null, reason: `serialstation title HTTP ${response.status}` };
    }

    const html = await response.text();

    const imageUrl = findImageUrlInHtml(html);
    if (imageUrl) {
      return {
        url: imageUrl,
        source: `serialstation-title-image-${normalizedTitleId}`
      };
    }

    const contentIds = extractContentIdsFromHtml(html);

    for (const contentId of contentIds) {
      const contentResult = await findCoverUrlFromContentId(contentId);

      if (contentResult.url) {
        return {
          ...contentResult,
          source: `serialstation-content-id-${normalizedTitleId}-${contentResult.source}`
        };
      }
    }

    const links = extractSerialStationLinks(html);

    for (const link of links) {
      if (link.includes('/games/')) {
        const gameResult = await findCoverUrlFromSerialStationGamePage(link, normalizedTitleId, visited);

        if (gameResult.url) {
          return gameResult;
        }
      }
    }

    return { url: null, reason: `serialstation title ${normalizedTitleId} had no usable image/content ID/game image` };
  } catch (error) {
    return { url: null, reason: `serialstation title ${normalizedTitleId}: ${error.message}` };
  }
}


async function findCoverUrlFromSerialStationGamePage(gameUrl, originalTitleId, visited = new Set()) {
  if (visited.has(gameUrl)) {
    return { url: null, reason: 'serialstation game already checked' };
  }

  visited.add(gameUrl);

  try {
    const response = await fetchWithTimeout(gameUrl, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'ps4-pkg-sender'
      }
    });

    if (!response.ok) {
      return { url: null, reason: `serialstation game HTTP ${response.status}` };
    }

    const html = await response.text();

    const imageUrl = findImageUrlInHtml(html);
    if (imageUrl) {
      return {
        url: imageUrl,
        source: 'serialstation-game-image'
      };
    }

    const contentIds = extractContentIdsFromHtml(html);

    for (const contentId of contentIds) {
      const contentResult = await findCoverUrlFromContentId(contentId);

      if (contentResult.url) {
        return {
          ...contentResult,
          source: `serialstation-game-content-id-${contentResult.source}`
        };
      }
    }

    const originalNumber = String(originalTitleId || '').replace(/^[A-Z]+/i, '');
    const titleLinks = extractSerialStationLinks(html)
      .filter((link) => link.includes('/titles/'))
      .filter((link) => !originalNumber || link.includes(originalNumber));

    for (const titleLink of titleLinks) {
      const titleMatch = titleLink.match(/\/titles\/([A-Z]{4})\/(\d{5})/i);

      if (!titleMatch) continue;

      const linkedTitleId = `${titleMatch[1].toUpperCase()}${titleMatch[2]}`;

      if (linkedTitleId === originalTitleId) continue;

      const titleResult = await findCoverUrlFromSerialStationTitleId(linkedTitleId, visited);

      if (titleResult.url) {
        return {
          ...titleResult,
          source: `serialstation-linked-title-${linkedTitleId}-${titleResult.source}`
        };
      }
    }

    return { url: null, reason: 'serialstation game page had no usable image/content ID/title image' };
  } catch (error) {
    return { url: null, reason: `serialstation game: ${error.message}` };
  }
}

async function findCoverUrlFromSerialStationSearch(searchTitle) {
  try {
    const response = await fetchWithTimeout(`https://serialstation.com/titles/?name=${encodeURIComponent(searchTitle)}`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'ps4-pkg-sender'
      }
    });

    if (!response.ok) {
      return { url: null, reason: `serialstation search HTTP ${response.status}` };
    }

    const html = await response.text();
    const links = extractSerialStationLinks(html);

    for (const link of links) {
      const titleMatch = link.match(/\/titles\/([A-Z]{4})\/(\d{5})/i);

      if (titleMatch) {
        const titleId = `${titleMatch[1].toUpperCase()}${titleMatch[2]}`;
        const result = await findCoverUrlFromSerialStationTitleId(titleId);

        if (result.url) {
          return {
            ...result,
            source: `serialstation-search-${result.source}`
          };
        }
      }
    }

    for (const link of links) {
      if (link.includes('/games/')) {
        const result = await findCoverUrlFromSerialStationGamePage(link, '', new Set());

        if (result.url) {
          return {
            ...result,
            source: `serialstation-search-${result.source}`
          };
        }
      }
    }

    return { url: null, reason: 'serialstation search had no usable title/game result' };
  } catch (error) {
    return { url: null, reason: `serialstation search: ${error.message}` };
  }
}


async function findCoverUrlByStoreSearch(searchTitle) {
  const errors = [];

  for (const region of coverSearchRegions) {
    const [country, language] = region.split('/');
    if (!country || !language) continue;

    const urls = [
      `https://store.playstation.com/store/api/chihiro/00_09_000/search/${encodeURIComponent(country)}/${encodeURIComponent(language)}/999/${encodeURIComponent(searchTitle)}`,
      `https://store.playstation.com/chihiro-api/search/${encodeURIComponent(country)}/${encodeURIComponent(language)}/999/${encodeURIComponent(searchTitle)}`
    ];

    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'ps4-pkg-sender'
          }
        });

        if (!response.ok) {
          errors.push(`${country}/${language}: HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();
        const imageUrl = findImageUrlInObject(data);

        if (imageUrl) {
          return {
            url: imageUrl,
            source: `playstation-store-search-${country}-${language}`
          };
        }

        errors.push(`${country}/${language}: search returned no usable image URL`);
      } catch (error) {
        errors.push(`${country}/${language}: ${error.message}`);
      }
    }
  }

  return {
    url: null,
    reason: errors.join('; ')
  };
}

function normalizeImageUrl(imageUrl, baseUrl = 'https://serialstation.com') {
  let value = decodeHtmlEntities(String(imageUrl || '').trim());

  if (value.startsWith('//')) {
    value = `https:${value}`;
  } else if (value.startsWith('/')) {
    value = `${baseUrl}${value}`;
  }

  return value;
}

function isProbablyImageUrl(imageUrl) {
  const value = normalizeImageUrl(imageUrl).toLowerCase();

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  if (isBadSerialStationImageUrl(value)) {
    return false;
  }

  // Do not treat PlayStation Store API/product JSON URLs as images.
  if (
    value.includes('/store/api/') ||
    value.includes('/chihiro-api/') ||
    value.includes('/container/') ||
    value.includes('/titlecontainer/') ||
    value.includes('/concept/')
  ) {
    return false;
  }

  return (
    /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(value) ||
    value.includes('image.api.playstation.com') ||
    value.includes('store.playstation.com/store/api/chihiro/00_09_000/image') ||
    value.includes('/media/') ||
    value.includes('/images/')
  );
}

function getObjectKeyScore(key) {
  const normalized = String(key || '').toLowerCase();

  if (['url', 'src', 'imageurl', 'thumbnailurl', 'previewurl'].includes(normalized)) return 5;
  if (normalized.includes('image')) return 4;
  if (normalized.includes('thumbnail')) return 4;
  if (normalized.includes('cover')) return 4;
  if (normalized.includes('poster')) return 3;
  if (normalized.includes('media')) return 2;

  return 0;
}


function findImageUrlInObject(value, keyHint = '') {
  if (!value) return null;

  if (typeof value === 'string') {
    return isProbablyImageUrl(value) ? normalizeImageUrl(value) : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrlInObject(item, keyHint);
      if (found) return found;
    }

    return null;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([keyA], [keyB]) => getObjectKeyScore(keyB) - getObjectKeyScore(keyA));

    for (const [key, item] of entries) {
      if (typeof item === 'string' && getObjectKeyScore(key) > 0 && isProbablyImageUrl(item)) {
        return normalizeImageUrl(item);
      }
    }

    const preferredKeys = [
      'images',
      'image',
      'media',
      'cover',
      'thumbnail',
      'thumbnailUrl',
      'imageUrl',
      'previewUrl',
      'gameContentTypesList',
      'included'
    ];

    for (const key of preferredKeys) {
      if (value[key]) {
        const found = findImageUrlInObject(value[key], key);
        if (found) return found;
      }
    }

    for (const [key, item] of entries) {
      const found = findImageUrlInObject(item, key);
      if (found) return found;
    }
  }

  return null;
}


function findImageUrlInHtml(html) {
  const source = String(html || '');

  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
    /<a[^>]+href=["']([^"']*(?:serialstation\/media|linodeobjects\.com|\.jpg|\.jpeg|\.png|\.webp)[^"']*)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
    /(?:href|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi,
    /(https?:\/\/[^"'<> ]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'<> ]*)?)/gi
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(source)) !== null) {
      if (!match[1]) continue;

      const imageUrl = normalizeImageUrl(match[1]);

      if (isProbablyImageUrl(imageUrl)) {
        return imageUrl;
      }
    }
  }

  return null;
}


function looksLikeImageBuffer(buffer) {
  if (!buffer || buffer.length < 12) return false;

  // JPG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }

  // WebP: RIFF....WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }

  return false;
}

function urlLooksLikeImage(imageUrl) {
  return /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(String(imageUrl || ''));
}


async function downloadImageToFolder(imageUrl, imgname, targetDir) {
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error('Cover URL is not http/https');
  }

  const response = await fetchWithTimeout(imageUrl, {
    headers: {
      'User-Agent': 'ps4-pkg-sender'
    }
  });

  if (!response.ok) {
    throw new Error(`Image download failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.toLowerCase().includes('application/json')) {
    const data = await response.json();
    const nestedImageUrl = findImageUrlInObject(data);

    if (nestedImageUrl && nestedImageUrl !== imageUrl) {
      return downloadImageToFolder(nestedImageUrl, imgname, targetDir);
    }

    throw new Error(`URL returned JSON but no usable image URL was found (${contentType})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const maxBytes = 10 * 1024 * 1024;

  if (buffer.length > maxBytes) {
    throw new Error('Image is larger than 10 MB');
  }

  const isImageContentType = contentType.toLowerCase().startsWith('image/');
  const isImageByUrl = urlLooksLikeImage(imageUrl);
  const isImageByBytes = looksLikeImageBuffer(buffer);

  if (!isImageContentType && !isImageByUrl && !isImageByBytes) {
    throw new Error(`URL did not return an image (${contentType || 'unknown content type'})`);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const safeImgname = safeLocalImageFilename(imgname);
  const targetPath = path.join(targetDir, safeImgname);

  fs.writeFileSync(targetPath, buffer);

  return safeImgname;
}

async function downloadCoverImage(imageUrl, imgname) {
  return downloadImageToFolder(imageUrl, imgname, coverImagesPath);
}


function isValidHost(value) {
  if (!value || value.length > 253) return false;
  return /^(localhost|[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]|[a-fA-F0-9:]+)$/.test(value);
}
