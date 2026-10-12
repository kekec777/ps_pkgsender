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
const ps2GamePath = path.resolve(
  process.env.PS2_GAME_DIR || process.env.PS2_GAMES_DIR || './PS2Games'
);
const ps1GamePath = path.resolve(
  process.env.PS1_GAME_DIR || process.env.PS1_GAMES_DIR || './PS1Games'
);
const retroGamePath = path.resolve(
  process.env.RETRO_GAME_DIR || process.env.RETRO_GAMES_DIR || './Retro'
);
const retroRemoteRoot = String(process.env.RETRO_REMOTE_ROOT || '/data/homebrew/PPSA99169/ROMS').replace(/\/+$/, '') || '/data/homebrew/PPSA99169/ROMS';
const ps2GameRemoteRoot = String(process.env.PS2_GAME_REMOTE_ROOT || '/data/PCSX2/games').replace(/\/+$/, '') || '/data/PCSX2/games';
const pcsx2BiosRemoteDir = String(process.env.PCSX2_BIOS_REMOTE_DIR || '/data/PCSX2/bios').replace(/\/+$/, '') || '/data/PCSX2/bios';
const ps5sx2UploadLimit = process.env.PS5SX2_UPLOAD_LIMIT || process.env.PCSX2_UPLOAD_LIMIT || '2gb';
const ps5sx2UploadTempDir = path.resolve(
  process.env.PS5SX2_UPLOAD_TMP || path.join(__dirname, 'public', 'ps5sx2-upload-tmp')
);
const pcsx2BiosExtensions = (process.env.PCSX2_BIOS_EXTENSIONS || '.bin,.rom,.erom,.nvm,.mec,.zip,.txt')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const ps2GameExtensions = (process.env.PS2_GAME_EXTENSIONS || '.iso,.chd,.cso,.bin,.img,.mdf,.nrg,.gz')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const ps1GameExtensions = (process.env.PS1_GAME_EXTENSIONS || '.cue,.chd,.pbp,.iso,.bin,.img,.mdf,.ccd,.m3u,.toc,.ecm,.zip,.7z')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const retroGameExtensions = (process.env.RETRO_GAME_EXTENSIONS || '.zip,.7z,.nes,.fds,.sfc,.smc,.fig,.gb,.gbc,.gba,.n64,.z64,.v64,.md,.smd,.gen,.sms,.gg,.32x,.pce,.sgx,.ws,.wsc,.ngp,.ngc,.a26,.a52,.a78,.lnx,.j64,.rom,.col,.int,.vec,.dsk,.tap,.tzx,.z80,.uae,.adf,.ipf,.lha,.cue,.chd,.iso,.cso,.pbp,.bin,.img,.m3u,.nds,.3ds,.cia,.dol,.gcm,.rvz,.wad,.wbfs,.cdi,.gdi,.elf,.doom,.p8,.tic')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const switchGamePath = path.resolve(
  process.env.SWITCH_GAME_DIR || process.env.NINTENDO_SWITCH_GAME_DIR || './SwitchGames'
);
const switchGameRemoteRoot = String(process.env.SWITCH_GAME_REMOTE_ROOT || process.env.PROSPEROEDEN_ROMS_DIR || '/data/prosperoeden/roms').replace(/\/+$/, '') || '/data/prosperoeden/roms';
const switchGameExtensions = (process.env.SWITCH_GAME_EXTENSIONS || '.nsp,.xci,.nsz,.xcz')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const prosperoEdenRoot = String(process.env.PROSPEROEDEN_ROOT || '/data/prosperoeden').replace(/\/+$/, '') || '/data/prosperoeden';
const prosperoEdenUploadLimit = process.env.PROSPEROEDEN_UPLOAD_LIMIT || '8gb';
const prosperoEdenUploadTempDir = path.resolve(
  process.env.PROSPEROEDEN_UPLOAD_TMP || path.join(__dirname, 'public', 'prosperoeden-upload-tmp')
);
const prosperoEdenFolders = {
  keys: String(process.env.PROSPEROEDEN_KEYS_DIR || `${prosperoEdenRoot}/keys`).replace(/\/+$/, ''),
  firmware: String(process.env.PROSPEROEDEN_FIRMWARE_DIR || `${prosperoEdenRoot}/firmware`).replace(/\/+$/, ''),
  updates: String(process.env.PROSPEROEDEN_UPDATES_DIR || `${prosperoEdenRoot}/updates`).replace(/\/+$/, ''),
  mods: String(process.env.PROSPEROEDEN_MODS_DIR || `${prosperoEdenRoot}/mods`).replace(/\/+$/, '')
};

// Backward-compatible name used by old helper functions and logs.
const staticFilesPath = ps4PkgPath;
const localIp = process.env.LOCALIP || 'localhost';
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || `http://${localIp}:${port}`).replace(/\/$/, '');
const ps5UploadPort = Number.parseInt(process.env.PS5UPLOAD_WEB_PORT || '19113', 10);
const ps5UploadWebUrl = String(process.env.PS5UPLOAD_WEB_URL || `http://${localIp}:${ps5UploadPort}`).replace(/\/$/, '');
const ps5UploadInternalUrl = String(process.env.PS5UPLOAD_INTERNAL_URL || `http://127.0.0.1:${ps5UploadPort}`).replace(/\/$/, '');
const ps5UploadPkgHostIp = process.env.PS5UPLOAD_PKG_HOST_IP || localIp;
const ps5InstallMode = String(process.env.PS5_INSTALL_MODE || 'ps5upload').toLowerCase();
const ps5UploadRuntimePort = Number.parseInt(process.env.PS5UPLOAD_RUNTIME_PORT || '9113', 10);
const ps5UploadInstallPollMs = Number.parseInt(process.env.PS5UPLOAD_INSTALL_POLL_MS || '2500', 10);
const ps5UploadInstallTimeoutMs = Number.parseInt(process.env.PS5UPLOAD_INSTALL_TIMEOUT_MS || String(12 * 60 * 60 * 1000), 10);


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
const ps5PayloadDir = path.resolve(
  process.env.PS5_PAYLOAD_DIR || path.join(__dirname, 'public', 'ps5-payloads')
);
const ps5HomebrewDir = path.resolve(
  process.env.PS5_HOMEBREW_DIR || path.join(__dirname, 'public', 'ps5-homebrew')
);
const ps5HomebrewArchiveDir = path.join(ps5HomebrewDir, 'archives');
const ps5HomebrewAppsDir = path.join(ps5HomebrewDir, 'apps');
const ps5HomebrewTmpDir = path.join(ps5HomebrewDir, 'tmp');
const ps5FtpPort = Number.parseInt(process.env.PS5_FTP_PORT || '1337', 10);
const ps5HomebrewRemoteRoot = process.env.PS5_HOMEBREW_REMOTE_ROOT || '/data/homebrew';
const ps5HomebrewDeployMethod = String(process.env.PS5_HOMEBREW_DEPLOY_METHOD || 'ps5upload').toLowerCase();
const ps5PayloadManagerPort = Number.parseInt(process.env.PS5_PAYLOAD_MANAGER_PORT || '8084', 10);
const ps5PayloadManagerRemoteDir = process.env.PS5_PAYLOAD_MANAGER_REMOTE_DIR || '/data/pldmgr/payloads';
const ps5PayloadManagerAutoSync = String(process.env.PS5_PAYLOAD_MANAGER_AUTO_SYNC || 'true').toLowerCase() !== 'false';

const ps5FtpTimeoutMs = Number.parseInt(process.env.PS5_FTP_TIMEOUT_MS || '120000', 10);
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
  const raw = String((pkg && (pkg.displayName || pkg.shortDisplayName || pkg.fileName || pkg.filename || pkg.name)) || 'Unknown');
  const platform = String((pkg && (pkg.platform || pkg.platformLabel)) || '').toLowerCase();

  if (['ps2', 'switch', 'retro'].includes(platform)) {
    return raw;
  }

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
app.use('/ps5/payload-files', express.static(ps5PayloadDir, { dotfiles: 'deny', fallthrough: false }));
app.use('/ps5/homebrew-files', express.static(ps5HomebrewAppsDir, { dotfiles: 'deny', fallthrough: false }));
app.use('/pkgfiles/ps4', express.static(ps4PkgPath, { dotfiles: 'deny', fallthrough: false }));
app.use('/pkgfiles/ps5', express.static(ps5PkgPath, { dotfiles: 'deny', fallthrough: false }));
app.use('/pkgfiles/ps2', express.static(ps2GamePath, { dotfiles: 'deny', fallthrough: false }));

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
      ? 'Browse PS4-compatible packages, native PS5 packages, PS2 games for PCSX2, Nintendo Switch games for ProsperoEden, and Retro games for RetroArch.'
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
    ps4LibraryUrl: '/ps4',
    ps5LibraryUrl: '/ps5',
    consoleToolsUrl: '/ps5/tools',
    libraryModeLabel: isPs5 ? 'PS5 view: PS4 + PS5 packages + PS2 + Nintendo Switch + Retro games' : 'PS4 view: PS4 packages only',
    consoleConfigJson: makeSafeScriptJson(config),
    ps5Host: currentPS5ipadr,
    ps5RelapseUrl: '/ps5/relapse/',
    ps5ToolsUrl: '/ps5/tools',
    ps5PayloadsUrl: '/ps5/payloads',
    ps5HomebrewUrl: '/ps5/homebrew',
    nintendoSwitchUrl: '/ps5/nintendoswitch',
    ps5sx2Url: '/ps5/ps5sx2',
    ps5LinksUrl: '/ps5/links',
    ps5UploadUrl: '/ps5upload'
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
    const ps2Dirs = isPs5View ? flattenPkgs(getPs2GamesFromRoot(ps2GamePath, true)) : [];
    const switchDirs = isPs5View ? flattenPkgs(getSwitchGamesFromRoot(switchGamePath, true)) : [];
    const retroDirs = isPs5View ? flattenPkgs(getRetroGamesForLibrary(true)) : [];

    const totalPkgs = dirs.reduce((sum, dir) => sum + dir.count, 0);
    const ps4PackageCount = ps4Dirs.reduce((sum, dir) => sum + dir.count, 0);
    const ps5PackageCount = ps5Dirs.reduce((sum, dir) => sum + dir.count, 0);
    const ps2GameCount = ps2Dirs.reduce((sum, dir) => sum + dir.count, 0);
    const switchGameCount = switchDirs.reduce((sum, dir) => sum + dir.count, 0);
    const retroGameCount = retroDirs.reduce((sum, dir) => sum + dir.count, 0);

    const totalBytes = dirs.reduce((sum, dir) => sum + dir.bytes, 0);
    const ps4Bytes = ps4Dirs.reduce((sum, dir) => sum + dir.bytes, 0);
    const ps5Bytes = ps5Dirs.reduce((sum, dir) => sum + dir.bytes, 0);
    const ps2Bytes = ps2Dirs.reduce((sum, dir) => sum + dir.bytes, 0);
    const switchBytes = switchDirs.reduce((sum, dir) => sum + dir.bytes, 0);
    const retroBytes = retroDirs.reduce((sum, dir) => sum + dir.bytes, 0);

    res.render('index', {
      ...getConsoleViewData(consoleType),
      dirs,
      hasDirs: dirs.length > 0,
      totalDirs: dirs.length,
      totalPkgs,
      ps4PackageCount,
      ps5PackageCount,
      ps2GameCount,
      switchGameCount,
      retroGameCount,
      showPs5PackageCount: isPs5View,
      showPs2GameCount: isPs5View,
      showSwitchGameCount: isPs5View,
      showRetroGameCount: isPs5View,
      showPs5Size: isPs5View,
      showPs2Size: isPs5View,
      showSwitchSize: isPs5View,
      showRetroSize: isPs5View,
      ps4Size: formatDashboardSize(ps4Bytes),
      ps5Size: formatDashboardSize(ps5Bytes),
      ps2Size: formatDashboardSize(ps2Bytes),
      switchSize: formatDashboardSize(switchBytes),
      retroSize: formatDashboardSize(retroBytes),
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
  if (job.consoleType === 'switch') {
    const result = await ps5UploadUploadSwitchGame(job.filepath, job.host || currentPS5ipadr, (status, message) => {
      job.message = message;
      job.result = status;
    });
    job.url = result.remotePath || '';
    return result;
  }

  if (job.consoleType === 'retro') {
    const result = await ps5UploadUploadRetroGame(job.filepath, job.host || currentPS5ipadr, (status, message) => {
      job.message = message;
      job.result = status;
    });
    job.url = result.remotePath || '';
    return result;
  }

  if (job.consoleType === 'ps2') {
    const result = await ps5UploadUploadPs2Game(job.filepath, job.host || currentPS5ipadr, (status, message) => {
      job.message = message;
      job.result = status;
    });
    job.url = result.remotePath || '';
    return result;
  }

  if (job.consoleType === 'ps5') {
    if (ps5InstallMode !== 'etahen') {
      const result = await ps5UploadInstall(job.filepath, job.host || currentPS5ipadr, (status, message) => {
        job.message = message;
        job.result = status;
      });
      job.url = result.source || '';
      return result;
    }

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
      job.message = job.consoleType === 'switch'
        ? `Uploading ${job.title} to ProsperoEden roms`
        : (job.consoleType === 'retro'
          ? `Uploading ${job.title} to RetroArch ROMs`
          : (job.consoleType === 'ps2' ? `Uploading ${job.title} to PCSX2 games` : `Sending ${job.title} to ${String(job.consoleType || '').toUpperCase()}`));

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




app.get('/ps5/homebrew', (req, res) => {
  res.type('html').send(renderPs5HomebrewPage());
});

app.get('/api/ps5/homebrew/apps', (req, res) => {
  try {
    res.json({
      ok: true,
      homebrewDir: ps5HomebrewDir,
      remoteRoot: ps5HomebrewRemoteRoot,
      ftpPort: ps5FtpPort,
      apps: getPs5HomebrewApps()
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post(
  '/api/ps5/homebrew/upload',
  express.raw({ type: () => true, limit: process.env.PS5_HOMEBREW_UPLOAD_LIMIT || '2gb' }),
  async (req, res) => {
    try {
      const rawName = req.headers['x-homebrew-filename'] || req.query.filename || '';
      const decodedName = decodeURIComponent(String(rawName || 'homebrew.zip'));
      const filename = safePs5HomebrewName(decodedName);
      const archivePath = resolvePs5HomebrewArchivePath(filename);

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ ok: false, message: 'Missing ZIP body' });
      }

      fs.writeFileSync(archivePath, req.body);

      const appInfo = await extractPs5HomebrewArchive(archivePath);

      res.json({
        ok: true,
        message: `Uploaded and extracted ${filename} as ${appInfo.name}`,
        app: appInfo,
        apps: getPs5HomebrewApps()
      });
    } catch (error) {
      console.error('[homebrew-upload] failed:', error);
      res.status(400).json({ ok: false, message: error.message });
    }
  }
);

app.delete('/api/ps5/homebrew/apps/:folder', (req, res) => {
  try {
    const appPath = resolvePs5HomebrewAppPath(req.params.folder);

    if (!fs.existsSync(appPath)) {
      return res.status(404).json({ ok: false, message: 'Homebrew app not found' });
    }

    fs.rmSync(appPath, { recursive: true, force: true });

    res.json({
      ok: true,
      message: `Deleted ${path.basename(appPath)} from Docker storage`,
      apps: getPs5HomebrewApps()
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.post('/api/ps5/homebrew/apps/:folder/deploy', async (req, res) => {
  try {
    const result = await deployPs5HomebrewApp(req.params.folder, {
      host: req.body?.host,
      port: req.body?.port,
      remoteRoot: req.body?.remoteRoot,
      username: req.body?.username,
      password: req.body?.password,
      method: req.body?.method
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.post('/api/ps5/homebrew/apps/:folder/delete-remote', async (req, res) => {
  try {
    const result = await deletePs5HomebrewRemote(req.params.folder, {
      host: req.body?.host,
      remoteRoot: req.body?.remoteRoot
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});


app.get('/ps5/nintendoswitch', (req, res) => {
  res.type('html').send(renderProsperoEdenPage());
});

app.get('/ps5/switch', (req, res) => {
  res.redirect('/ps5/nintendoswitch');
});

app.get('/ps5/ps5sx2', (req, res) => {
  res.type('html').send(renderPs5sx2Page());
});

app.get('/ps5/pcsx2', (req, res) => {
  res.redirect('/ps5/ps5sx2');
});

app.post(
  '/api/ps5/ps5sx2/bios/upload',
  express.raw({ type: () => true, limit: ps5sx2UploadLimit }),
  async (req, res) => {
    try {
      const result = await uploadPs5sx2BiosFile({
        filename: decodeURIComponent(String(req.headers['x-ps5sx2-filename'] || req.query.filename || 'bios.bin')),
        relativePath: decodeURIComponent(String(req.headers['x-ps5sx2-relative-path'] || req.query.relativePath || req.headers['x-ps5sx2-filename'] || req.query.filename || 'bios.bin')),
        host: req.headers['x-ps5-host'] || req.query.host || req.body?.host,
        buffer: req.body
      });

      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  }
);

app.post(
  '/api/ps5/prosperoeden/upload',
  express.raw({ type: () => true, limit: prosperoEdenUploadLimit }),
  async (req, res) => {
    try {
      const result = await uploadProsperoEdenFile({
        target: req.headers['x-prospero-target'] || req.query.target,
        filename: decodeURIComponent(String(req.headers['x-prospero-filename'] || req.query.filename || 'upload.bin')),
        relativePath: decodeURIComponent(String(req.headers['x-prospero-relative-path'] || req.query.relativePath || req.headers['x-prospero-filename'] || req.query.filename || 'upload.bin')),
        host: req.headers['x-ps5-host'] || req.query.host || req.body?.host,
        buffer: req.body
      });

      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  }
);

app.get('/api/ps5/prosperoeden/roms', async (req, res) => {
  try {
    const result = await getProsperoEdenRemoteRoms({
      host: req.query.host || req.headers['x-ps5-host']
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.post('/api/ps5/prosperoeden/roms/delete', express.json(), async (req, res) => {
  try {
    const result = await deleteProsperoEdenRemoteRom(req.body?.path || req.body?.remotePath, {
      host: req.body?.host || req.query.host || req.headers['x-ps5-host']
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.get('/api/ps5/ps5sx2/games', async (req, res) => {
  try {
    const result = await getPs5sx2RemoteGames({
      host: req.query.host || req.headers['x-ps5-host']
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.post('/api/ps5/ps5sx2/games/delete', express.json(), async (req, res) => {
  try {
    const result = await deletePs5sx2RemoteGame(req.body?.path || req.body?.remotePath, {
      host: req.body?.host || req.query.host || req.headers['x-ps5-host']
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.get('/ps5/payloads', (req, res) => {
  res.type('html').send(renderPs5PayloadPage());
});

app.get('/ps5/links', (req, res) => {
  res.type('html').send(renderPs5LinksPage());
});

app.get('/api/ps5/payloads', (req, res) => {
  try {
    res.json({
      ok: true,
      payloadDir: ps5PayloadDir,
      payloads: getPs5Payloads()
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post(
  '/api/ps5/payloads/upload',
  express.raw({ type: () => true, limit: process.env.PS5_PAYLOAD_LIMIT || '200mb' }),
  (req, res) => {
    try {
      const rawName = req.headers['x-payload-filename'] || req.query.filename || '';
      const decodedName = decodeURIComponent(String(rawName || 'payload.elf'));
      const filename = safePs5PayloadFilename(decodedName);
      const filepath = resolvePs5PayloadPath(filename);

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ ok: false, message: 'Missing payload body' });
      }

      fs.writeFileSync(filepath, req.body);

      res.json({
        ok: true,
        message: `Uploaded ${filename}`,
        payload: {
          name: filename,
          size: req.body.length,
          sizeLabel: formatDashboardSize(req.body.length),
          downloadUrl: `/ps5/payload-files/${encodeURIComponent(filename)}`
        }
      });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  }
);

app.delete('/api/ps5/payloads/:filename', (req, res) => {
  try {
    const filepath = resolvePs5PayloadPath(req.params.filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ ok: false, message: 'Payload not found' });
    }

    fs.unlinkSync(filepath);

    res.json({
      ok: true,
      message: `Deleted ${path.basename(filepath)}`,
      payloads: getPs5Payloads()
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.post('/api/ps5/payloads/:filename/send', async (req, res) => {
  try {
    const result = await sendPs5PayloadFile(req.params.filename, req);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.post('/api/ps5/payloads/:filename/sync-manager', async (req, res) => {
  try {
    const result = await syncPs5PayloadToPayloadManager(req.params.filename, {
      host: req.body?.host || req.query?.host,
      ps5uploadAddr: req.body?.ps5uploadAddr || req.query?.ps5uploadAddr,
      remoteRoot: req.body?.remoteRoot || req.query?.remoteRoot
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.get('/api/ps5/payload-manager/list', async (req, res) => {
  try {
    const host = getPs5PayloadManagerHost(req.query?.host || req.body?.host);
    const result = await getPs5PayloadManagerList(host);

    res.json({
      ok: true,
      managerUrl: getPs5PayloadManagerUrl(host),
      payloads: result
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
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
    relapseExists: fs.existsSync(ps5RelapseDir),
    payloadManagerUrl: getPs5PayloadManagerUrl(currentPS5ipadr || process.env.PS5IP || process.env.PS5_HOST || '127.0.0.1'),
    payloadManagerRemoteDir: ps5PayloadManagerRemoteDir,
    payloadManagerAutoSync: ps5PayloadManagerAutoSync
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
    const info = getPkgLibraryInfo(filepath);
    const isPs2Game = info?.platform === 'ps2';
    const isSwitchGame = info?.platform === 'switch';
    const isRetroGame = info?.platform === 'retro';
    const isTransferOnlyGame = isPs2Game || isSwitchGame || isRetroGame;
    const host = ps5InstallMode === 'etahen' && !isTransferOnlyGame
      ? getRequiredPs5Host(req)
      : String(req.body?.host || req.body?.ps5Host || req.query.host || process.env.PS5_ADDR || currentPS5ipadr || '').trim();

    const portToUse = Number.parseInt(String(req.body?.port || req.query.port || ps5DpiPort), 10);

    if (!isTransferOnlyGame && ps5InstallMode === 'etahen' && (!Number.isInteger(portToUse) || portToUse <= 0 || portToUse > 65535)) {
      return res.status(400).json({ ok: false, message: 'Invalid PS5 Direct PKG Installer port' });
    }

    const job = enqueueInstallJob({
      consoleType: isSwitchGame ? 'switch' : (isRetroGame ? 'retro' : (isPs2Game ? 'ps2' : 'ps5')),
      filepath,
      host,
      port: portToUse,
      title: path.basename(filepath),
      platformLabel: info?.platformLabel || (isSwitchGame ? 'Switch' : (isRetroGame ? 'Retro' : (isPs2Game ? 'PS2' : 'PS5')))
    });

    const position = getInstallQueuePosition(job.id);

    res.status(202).json({
      ok: true,
      queued: true,
      installMode: isSwitchGame ? 'switchupload' : (isRetroGame ? 'retroupload' : (isPs2Game ? 'ps2upload' : (ps5InstallMode === 'etahen' ? 'etahen' : 'ps5upload'))),
      job: getPublicInstallJob(job),
      queue: getInstallQueueSnapshot(),
      message: position > 1
        ? `Queued for ${isSwitchGame ? 'Nintendo Switch upload' : (isRetroGame ? 'Retro upload' : (isPs2Game ? 'PS2 upload' : 'PS5'))} at position ${position}`
        : `Queued for ${isSwitchGame ? 'Nintendo Switch upload' : (isRetroGame ? 'Retro upload' : (isPs2Game ? 'PS2 upload' : 'PS5'))} and starting now`
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});


app.get('/ps5upload', (req, res) => {
  res.redirect(ps5UploadWebUrl);
});

app.get('/api/ps5upload/info', async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`${ps5UploadInternalUrl}/api/jobs`, {
      signal: controller.signal
    });

    res.json({
      ok: response.ok,
      webUrl: ps5UploadWebUrl,
      internalUrl: ps5UploadInternalUrl,
      pkgHostIp: ps5UploadPkgHostIp,
      installMode: ps5InstallMode,
      status: response.status
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      webUrl: ps5UploadWebUrl,
      internalUrl: ps5UploadInternalUrl,
      pkgHostIp: ps5UploadPkgHostIp,
      installMode: ps5InstallMode,
      message: error.message
    });
  } finally {
    clearTimeout(timeout);
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
  console.log(`PS5 payload directory: ${ps5PayloadDir}`);
  console.log(`PS5 homebrew directory: ${ps5HomebrewDir}`);
  console.log(`PS2 games directory: ${ps2GamePath}`);
  console.log(`PS2 games remote root: ${ps2GameRemoteRoot}`);
  console.log(`PCSX2 BIOS remote dir: ${pcsx2BiosRemoteDir}`);
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
        pkg.actionType = pkg.actionType || (pkg.platform === 'ps2' ? 'ps2-upload' : (pkg.platform === 'switch' ? 'switch-upload' : (pkg.platform === 'retro' ? 'retro-upload' : 'pkg-install')));
        pkg.actionLabel = pkg.actionLabel || (pkg.platform === 'ps2' ? 'Upload to PCSX2' : (pkg.platform === 'switch' ? 'Upload to ProsperoEden' : (pkg.platform === 'retro' ? 'Upload to RetroArch' : 'Install')));
        pkg.actionIcon = pkg.actionIcon || ((pkg.platform === 'ps2' || pkg.platform === 'switch' || pkg.platform === 'retro') ? 'fa-upload' : 'fa-cloud-arrow-down');
      });
      const bytes = rootPkgs.reduce((sum, pkg) => sum + pkg.bytes, 0);
      const firstPkg = rootPkgs[0] || { imgname: 'folder.png', platformLabel: 'PS4', root };
      const folderThumbBase = firstPkg.root || root;
      const folderThumbname = `${safeFileBase(folderThumbBase)}.jpg`;

      return {
        id: crypto.randomUUID(),
        root,
        count: rootPkgs.length,
        unitLabel: ['ps2', 'switch', 'retro'].includes(String(firstPkg.platform || firstPkg.platformLabel || '').toLowerCase()) ? 'game' : 'pkg',
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
      getPkgsFromRoot(ps5PkgPath, 'PS5', true),
      getPs2GamesFromRoot(ps2GamePath, true),
      getSwitchGamesFromRoot(switchGamePath, true),
      getRetroGamesForLibrary(true)
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

function isPs2GameFile(filename) {
  return ps2GameExtensions.includes(path.extname(String(filename || '')).toLowerCase());
}

function getPs2GamesFromRoot(rootPath, prefixRoot = false) {
  const filelist = {};
  const basePath = path.resolve(rootPath);
  const platformLabel = 'PS2';

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

      if (!file.isFile() || !isPs2GameFile(file.name)) {
        return;
      }

      const stat = fs.statSync(filepath);
      const relativePath = path.relative(basePath, filepath);
      const relativeDir = path.dirname(relativePath);
      const name = path.basename(filepath);
      const fileBaseName = path.parse(name).name;
      const dirname = relativeDir === '.' ? fileBaseName : relativeDir;
      const rawRoot = relativeDir === '.' ? fileBaseName : (dirname.split(path.sep)[0] || fileBaseName || 'PS2');
      const root = prefixRoot ? `${platformLabel} / ${rawRoot}` : rawRoot;

      if (!filelist[root]) filelist[root] = [];

      filelist[root].push({
        filepath,
        relativePath,
        dir: dirname,
        root: rawRoot,
        displayRoot: root,
        name,
        platform: 'ps2',
        platformLabel,
        libraryRoot: basePath,
        pkgUrlPrefix: 'ps2',
        imgname: `${path.parse(filepath).name}.jpg`,
        imgUrl: encodePublicImageUrl('images', `${path.parse(filepath).name}.jpg`),
        size: formatFileSize(stat.size),
        bytes: stat.size,
        actionType: 'ps2-upload',
        actionLabel: 'Upload to PCSX2',
        actionIcon: 'fa-upload',
        searchText: `${platformLabel} ${root} ${dirname} ${name}`.toLowerCase()
      });
    });
  }

  walkSync(basePath);
  return filelist;
}

function isSwitchGameFile(filename) {
  return switchGameExtensions.includes(path.extname(String(filename || '')).toLowerCase());
}

function getSwitchGamesFromRoot(rootPath, prefixRoot = false) {
  const filelist = {};
  const basePath = path.resolve(rootPath);
  const platformLabel = 'Switch';

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

      if (!file.isFile() || !isSwitchGameFile(file.name)) {
        return;
      }

      const stat = fs.statSync(filepath);
      const relativePath = path.relative(basePath, filepath);
      const relativeDir = path.dirname(relativePath);
      const name = path.basename(filepath);
      const fileBaseName = path.parse(name).name;
      const dirname = relativeDir === '.' ? fileBaseName : relativeDir;
      const rawRoot = relativeDir === '.' ? fileBaseName : (dirname.split(path.sep)[0] || fileBaseName || 'Switch');
      const root = prefixRoot ? `${platformLabel} / ${rawRoot}` : rawRoot;

      if (!filelist[root]) filelist[root] = [];

      filelist[root].push({
        filepath,
        relativePath,
        dir: dirname,
        root: rawRoot,
        displayRoot: root,
        name,
        platform: 'switch',
        platformLabel,
        libraryRoot: basePath,
        pkgUrlPrefix: 'switch',
        imgname: `${path.parse(filepath).name}.jpg`,
        imgUrl: encodePublicImageUrl('images', `${path.parse(filepath).name}.jpg`),
        size: formatFileSize(stat.size),
        bytes: stat.size,
        actionType: 'switch-upload',
        actionLabel: 'Upload to ProsperoEden',
        actionIcon: 'fa-upload',
        searchText: `${platformLabel} Nintendo Switch ${root} ${dirname} ${name}`.toLowerCase()
      });
    });
  }

  walkSync(basePath);
  return filelist;
}


function isPs1GameFile(filename) {
  return ps1GameExtensions.includes(path.extname(String(filename || '')).toLowerCase());
}

function isRetroGameFile(filename) {
  return retroGameExtensions.includes(path.extname(String(filename || '')).toLowerCase());
}

const retroSystemFolderAliases = new Map(Object.entries({
  '3do': '3do',
  'the 3do company - 3do': '3do',
  'amiga': 'amiga',
  'commodore - amiga': 'amiga',
  'amstrad cpc': 'amstradcpc',
  'amstrad - cpc': 'amstradcpc',
  'arcade': 'arcade',
  'mame': 'mame',
  'fbneo': 'fbneo',
  'finalburn neo': 'fbneo',
  'finalburnneo': 'fbneo',
  'atomiswave': 'atomiswave',
  'naomi': 'naomi',
  'naomi2': 'naomi2',
  'nes': 'nes',
  'famicom': 'nes',
  'nintendo - nintendo entertainment system': 'nes',
  'snes': 'snes',
  'super nintendo': 'snes',
  'super nintendo entertainment system': 'snes',
  'nintendo - super nintendo entertainment system': 'snes',
  'n64': 'n64',
  'nintendo 64': 'n64',
  'nintendo - nintendo 64': 'n64',
  'gb': 'gb',
  'game boy': 'gb',
  'gameboy': 'gb',
  'nintendo - game boy': 'gb',
  'gbc': 'gbc',
  'game boy color': 'gbc',
  'gameboy color': 'gbc',
  'nintendo - game boy color': 'gbc',
  'gba': 'gba',
  'game boy advance': 'gba',
  'gameboy advance': 'gba',
  'nintendo - game boy advance': 'gba',
  'nds': 'nds',
  'ds': 'nds',
  'nintendo ds': 'nds',
  'nintendo - nintendo ds': 'nds',
  '3ds': 'n3ds',
  'nintendo 3ds': 'n3ds',
  'nintendo - nintendo 3ds': 'n3ds',
  'gc': 'gc',
  'gamecube': 'gc',
  'nintendo gamecube': 'gc',
  'wii': 'wii',
  'wiiu': 'wiiu',
  'wii u': 'wiiu',
  'virtualboy': 'virtualboy',
  'virtual boy': 'virtualboy',
  'megadrive': 'megadrive',
  'mega drive': 'megadrive',
  'genesis': 'megadrive',
  'sega genesis': 'megadrive',
  'sega - mega drive - genesis': 'megadrive',
  'mastersystem': 'mastersystem',
  'master system': 'mastersystem',
  'sega master system': 'mastersystem',
  'gamegear': 'gamegear',
  'game gear': 'gamegear',
  'sega game gear': 'gamegear',
  '32x': 'sega32x',
  'sega 32x': 'sega32x',
  'segacd': 'segacd',
  'sega cd': 'segacd',
  'mega cd': 'segacd',
  'saturn': 'saturn',
  'sega saturn': 'saturn',
  'sega - saturn': 'saturn',
  'dreamcast': 'dreamcast',
  'sega dreamcast': 'dreamcast',
  'sega - dreamcast': 'dreamcast',
  'sg1000': 'sg1000',
  'sg-1000': 'sg1000',
  'psx': 'psx',
  'ps1': 'psx',
  'playstation': 'psx',
  'playstation 1': 'psx',
  'sony playstation': 'psx',
  'sony - playstation': 'psx',
  'psp': 'psp',
  'playstation portable': 'psp',
  'sony - playstation portable': 'psp',
  'pcengine': 'pcengine',
  'pc engine': 'pcengine',
  'turbografx': 'pcengine',
  'turbografx 16': 'pcengine',
  'nec - pc engine - turbografx 16': 'pcengine',
  'pcenginecd': 'pcenginecd',
  'pc engine cd': 'pcenginecd',
  'turbografx cd': 'pcenginecd',
  'neogeo': 'neogeo',
  'neo geo': 'neogeo',
  'neogeocd': 'neogeocd',
  'neo geo cd': 'neogeocd',
  'ngp': 'ngp',
  'neo geo pocket': 'ngp',
  'ngpc': 'ngpc',
  'neo geo pocket color': 'ngpc',
  'wonderswan': 'wonderswan',
  'wonderswancolor': 'wonderswancolor',
  'wonderswan color': 'wonderswancolor',
  'atari2600': 'atari2600',
  'atari 2600': 'atari2600',
  'atari - 2600': 'atari2600',
  'atari5200': 'atari5200',
  'atari 5200': 'atari5200',
  'atari7800': 'atari7800',
  'atari 7800': 'atari7800',
  'atarilynx': 'atarilynx',
  'atari lynx': 'atarilynx',
  'atarijaguar': 'atarijaguar',
  'atari jaguar': 'atarijaguar',
  'atarist': 'atarist',
  'atari st': 'atarist',
  'colecovision': 'colecovision',
  'coleco colecovision': 'colecovision',
  'coleco - colecovision': 'colecovision',
  'intellivision': 'intellivision',
  'vectrex': 'vectrex',
  'c64': 'c64',
  'commodore 64': 'c64',
  'commodore - 64': 'c64',
  'dos': 'dos',
  'msdos': 'dos',
  'ms-dos': 'dos',
  'doom': 'doom',
  'quake': 'quake',
  'scummvm': 'scummvm',
  'zxspectrum': 'zxspectrum',
  'zx spectrum': 'zxspectrum',
  'sinclair - zx spectrum': 'zxspectrum',
  'tic80': 'tic80',
  'tic-80': 'tic80',
  'pico8': 'pico8',
  'pico-8': 'pico8'
}));

function normalizeRetroSystemKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRetroSystemRemoteFolder(systemFolder) {
  const key = normalizeRetroSystemKey(systemFolder);
  const alias = retroSystemFolderAliases.get(key);

  if (alias) {
    return alias;
  }

  return key.replace(/[^a-z0-9]+/g, '') || 'roms';
}

function safeRetroRemoteFolderName(value) {
  return String(value || 'Retro')
    .replace(/[\\/\x00-\x1F]/g, '_')
    .replace(/^[.]+$/, 'Retro')
    .trim()
    .slice(0, 120) || 'Retro';
}

function getPs1GamesFromRoot(rootPath, prefixRoot = false) {
  const filelist = {};
  const basePath = path.resolve(rootPath);
  const platformLabel = 'PS1 Retro';

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

      if (!file.isFile() || !isPs1GameFile(file.name)) {
        return;
      }

      const stat = fs.statSync(filepath);
      const relativePath = path.relative(basePath, filepath);
      const relativeDir = path.dirname(relativePath);
      const name = path.basename(filepath);
      const fileBaseName = path.parse(name).name;
      const dirname = relativeDir === '.' ? fileBaseName : relativeDir;
      const rawRoot = relativeDir === '.' ? fileBaseName : (dirname.split(path.sep)[0] || fileBaseName || 'PS1');
      const root = prefixRoot ? `Retro / PS1 / ${rawRoot}` : rawRoot;

      if (!filelist[root]) filelist[root] = [];

      filelist[root].push({
        filepath,
        relativePath,
        dir: dirname,
        root: rawRoot,
        displayRoot: root,
        name,
        platform: 'retro',
        platformLabel,
        libraryRoot: basePath,
        pkgUrlPrefix: 'ps1',
        imgname: `${path.parse(filepath).name}.jpg`,
        imgUrl: encodePublicImageUrl('images', `${path.parse(filepath).name}.jpg`),
        size: formatFileSize(stat.size),
        bytes: stat.size,
        actionType: 'retro-upload',
        actionLabel: 'Upload to RetroArch',
        actionIcon: 'fa-upload',
        retroSystem: 'psx',
        searchText: `Retro PS1 PlayStation psx ${root} ${dirname} ${name}`.toLowerCase()
      });
    });
  }

  walkSync(basePath);
  return filelist;
}

function getRetroGamesFromRoot(rootPath, prefixRoot = false) {
  const filelist = {};
  const basePath = path.resolve(rootPath);
  const platformLabel = 'Retro';

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

      if (!file.isFile() || !isRetroGameFile(file.name)) {
        return;
      }

      const stat = fs.statSync(filepath);
      const relativePath = path.relative(basePath, filepath);
      const relativeParts = relativePath.split(path.sep).filter(Boolean);
      const sourceSystem = relativeParts.length > 1 ? relativeParts[0] : 'Retro';
      const retroSystem = safeRetroRemoteFolderName(sourceSystem);
      const relativeDir = path.dirname(relativePath);
      const name = path.basename(filepath);
      const fileBaseName = path.parse(name).name;
      const dirname = relativeDir === '.' ? fileBaseName : relativeDir;
      const rawRoot = relativeDir === '.' ? fileBaseName : (dirname.split(path.sep)[0] || fileBaseName || 'Retro');
      const root = prefixRoot ? `Retro / ${rawRoot}` : rawRoot;

      if (!filelist[root]) filelist[root] = [];

      filelist[root].push({
        filepath,
        relativePath,
        dir: dirname,
        root: rawRoot,
        displayRoot: root,
        name,
        platform: 'retro',
        platformLabel,
        libraryRoot: basePath,
        pkgUrlPrefix: 'retro',
        imgname: `${path.parse(filepath).name}.jpg`,
        imgUrl: encodePublicImageUrl('images', `${path.parse(filepath).name}.jpg`),
        size: formatFileSize(stat.size),
        bytes: stat.size,
        actionType: 'retro-upload',
        actionLabel: `Upload to ${retroSystem}`,
        actionIcon: 'fa-upload',
        retroSystem,
        searchText: `Retro ${retroSystem} ${sourceSystem} ${root} ${dirname} ${name}`.toLowerCase()
      });
    });
  }

  walkSync(basePath);
  return filelist;
}

function getRetroGamesForLibrary(prefixRoot = false) {
  return mergePkgMaps(
    getPs1GamesFromRoot(ps1GamePath, prefixRoot),
    getRetroGamesFromRoot(retroGamePath, prefixRoot)
  );
}

function getPkgLibraryInfo(filepath) {
  const requestedPath = path.resolve(String(filepath || ''));
  const candidates = [
    { root: ps4PkgPath, platform: 'ps4', platformLabel: 'PS4' },
    { root: ps5PkgPath, platform: 'ps5', platformLabel: 'PS5' },
    { root: ps2GamePath, platform: 'ps2', platformLabel: 'PS2' },
    { root: switchGamePath, platform: 'switch', platformLabel: 'Switch' },
    { root: ps1GamePath, platform: 'retro', platformLabel: 'PS1 Retro', retroType: 'ps1' },
    { root: retroGamePath, platform: 'retro', platformLabel: 'Retro', retroType: 'retro' }
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

  if (targetConsole === 'ps5' && !['ps4', 'ps5', 'ps2', 'switch', 'retro'].includes(info.platform)) {
    throw new Error('PS5 view can only use packages from PS4Games/PS5Games, PS2 games from PS2Games, Switch games from SwitchGames, or Retro games from PS1Games/Retro');
  }

  if (!fs.existsSync(requestedPath)) {
    throw new Error(info.platform === 'ps2' ? 'PS2 game not found' : (info.platform === 'retro' ? 'Retro game not found' : 'Package not found'));
  }

  if (info.platform === 'ps2') {
    if (!isPs2GameFile(requestedPath)) {
      throw new Error(`Unsupported PS2 game file type. Allowed: ${ps2GameExtensions.join(', ')}`);
    }
  } else if (info.platform === 'switch') {
    if (!isSwitchGameFile(requestedPath)) {
      throw new Error(`Unsupported Nintendo Switch game file type. Allowed: ${switchGameExtensions.join(', ')}`);
    }
  } else if (info.platform === 'retro') {
    if (info.retroType === 'ps1') {
      if (!isPs1GameFile(requestedPath)) {
        throw new Error(`Unsupported PS1 game file type. Allowed: ${ps1GameExtensions.join(', ')}`);
      }
    } else if (!isRetroGameFile(requestedPath)) {
      throw new Error(`Unsupported Retro game file type. Allowed: ${retroGameExtensions.join(', ')}`);
    }
  } else if (path.extname(requestedPath).toLowerCase() !== '.pkg') {
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

function buildPs5UploadEnginePath(filepath) {
  const info = getPkgLibraryInfo(filepath);

  if (!info) {
    throw new Error('Invalid package path');
  }

  const folder = info.platform === 'ps5' ? 'PS5' : 'PS4';
  const relative = info.relative
    .split(path.sep)
    .filter(Boolean)
    .join('/');

  return `/pkgs/${folder}/${relative}`;
}

function buildPs5UploadOpenResponse(filepath) {
  const info = getPkgLibraryInfo(filepath);
  const packageName = path.basename(filepath);
  const enginePath = buildPs5UploadEnginePath(filepath);

  return {
    ok: true,
    ps5upload: true,
    installMode: 'ps5upload',
    message: `Open PS5Upload to install ${packageName}`,
    package: packageName,
    platform: info?.platformLabel || 'PS5',
    packagePath: enginePath,
    openUrl: ps5UploadWebUrl,
    webUrl: ps5UploadWebUrl,
    internalUrl: ps5UploadInternalUrl,
    note: 'PS5Upload is used because the active PS5 payload listens on 9113/9114, not etaHEN DPI 9090.'
  };
}

function normalizePs5UploadAddr(host) {
  const raw = String(host || process.env.PS5_ADDR || currentPS5ipadr || '').trim();

  if (!raw) {
    throw new Error('Missing PS5 address for PS5Upload');
  }

  const clean = raw
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();

  if (!clean) {
    throw new Error('Missing PS5 address for PS5Upload');
  }

  return clean.includes(':') ? clean : `${clean}:${ps5UploadRuntimePort}`;
}

function ps5UploadTitleIdFromContentId(contentId) {
  const match = String(contentId || '').match(/^[A-Z]{2}\d{4}-([A-Z]{4}\d{5})_/i);
  return match ? match[1].toUpperCase() : null;
}

async function ps5UploadFetchJson(pathname, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ps5UploadInternalUrl}${pathname}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      signal: options.signal || controller.signal
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = { message: text };
    }

    if (!response.ok) {
      const message = data?.error || data?.message || text || `PS5Upload HTTP ${response.status}`;
      throw new Error(message);
    }

    return data || {};
  } finally {
    clearTimeout(timeout);
  }
}

async function ps5UploadReadPackageMetadata(filepath) {
  try {
    return await ps5UploadFetchJson('/api/pkg/parse-split', {
      method: 'POST',
      body: JSON.stringify({ path: filepath })
    }, 120000);
  } catch (error) {
    console.warn(`PS5Upload package metadata read failed for ${filepath}: ${error.message}`);
    return {};
  }
}

function getPs5UploadStatusMessage(status = {}, packageName = 'Package') {
  if (status.note) return status.note;

  const phase = String(status.phase || '').toLowerCase();
  const metrics = status.metrics || {};
  const total = Number(metrics.total_bytes || status.total || 0);
  const done = Math.max(
    Number(metrics.served_bytes || 0),
    Number(status.installedBytes || 0),
    Number(status.transferBytes || 0)
  );

  const pct = total > 0 ? ` ${Math.min(99, Math.floor((done / total) * 100))}%` : '';

  if (phase === 'queued') return `Waiting for PS5Upload to start ${packageName}`;
  if (phase === 'resolve') return `Preparing ${packageName}`;
  if (phase === 'deliver' || phase === 'download') return `Streaming ${packageName} to the PS5${pct}`;
  if (phase === 'install' || phase === 'verify') return `Installing ${packageName} on the PS5${pct}`;
  if (phase === 'done') return `Install finished for ${packageName}`;
  if (phase === 'failed') return `Install failed for ${packageName}`;

  return `Installing ${packageName} with PS5Upload${pct}`;
}

async function ps5UploadInstall(filepath, host, onProgress = null) {
  const packageName = path.basename(filepath);
  const ps5Addr = normalizePs5UploadAddr(host);
  const metadata = await ps5UploadReadPackageMetadata(filepath);
  const head = metadata?.head || metadata?.pkg || {};
  const contentId = String(head.content_id || head.contentId || '').trim();
  const titleId = String(head.title_id || head.titleId || ps5UploadTitleIdFromContentId(contentId) || '').trim() || null;
  const category = head.category || null;
  const appVersion = head.app_ver || head.appVer || null;

  const request = {
    ps5_addr: ps5Addr,

    // PS5Upload expects the source enum directly:
    // { host_file: "/path/to/file.pkg" }, { console_path: "..." }, { remote: {...} }, or { url: "..." }.
    // Do not send the old UI queue shape { via: "stream", source: "..." } here.
    source: {
      host_file: filepath
    },

    content_id: contentId,
    title_id: titleId,
    package_app_ver: appVersion,
    category,
    options: {
      allow_destructive_reinstall: true
    }
  };

  const started = await ps5UploadFetchJson('/api/pkg/install', {
    method: 'POST',
    body: JSON.stringify(request)
  }, 30000);

  if (!started.ok || !started.job) {
    throw new Error(started.error || started.message || 'PS5Upload did not start the install job');
  }

  const startedAt = Date.now();

  while (true) {
    if (Date.now() - startedAt > ps5UploadInstallTimeoutMs) {
      throw new Error(`PS5Upload install timed out for ${packageName}`);
    }

    const status = await ps5UploadFetchJson(`/api/pkg/install/status?job=${encodeURIComponent(started.job)}`, {}, 30000);
    const message = getPs5UploadStatusMessage(status, packageName);

    if (typeof onProgress === 'function') {
      onProgress(status, message);
    }

    if (status.phase === 'done' || status.phase === 'failed') {
      const verdict = status.verdict || status.result?.verdict || '';
      const ok = status.phase === 'done' && !['failed', 'rejected'].includes(String(verdict).toLowerCase());

      if (!ok) {
        const errorMessage = status.error || status.errMessage || status.message || status.hint || `PS5Upload install failed for ${packageName}`;
        throw new Error(errorMessage);
      }

      return {
        ok: true,
        installMode: 'ps5upload',
        message: message || `PS5Upload installed ${packageName}`,
        package: packageName,
        ps5_addr: ps5Addr,
        source: filepath,
        job: started.job,
        contentId,
        titleId,
        category,
        status
      };
    }

    await wait(ps5UploadInstallPollMs);
  }
}

function toPosixRelativePath(value) {
  return String(value || '')
    .split(path.sep)
    .filter(Boolean)
    .join('/');
}

function posixDirname(value) {
  const clean = String(value || '').replace(/\/+/g, '/');
  const index = clean.lastIndexOf('/');
  return index <= 0 ? '/' : clean.slice(0, index);
}

async function ps5UploadMkdirp(addr, targetPath) {
  const clean = String(targetPath || '').replace(/\/+/g, '/').replace(/\/+$/, '');
  if (!clean || clean === '/') return;

  const parts = clean.split('/').filter(Boolean);
  let current = clean.startsWith('/') ? '' : '';

  for (const part of parts) {
    current += `/${part}`;
    await ps5UploadMkdir(addr, current).catch(() => {});
  }
}

function getPs2RemotePath(filepath) {
  const relative = toPosixRelativePath(path.relative(ps2GamePath, filepath));
  return `${ps2GameRemoteRoot}/${relative}`.replace(/\/+/g, '/');
}


function getSwitchRemotePath(filepath) {
  const relative = toPosixRelativePath(path.relative(switchGamePath, filepath));
  return `${switchGameRemoteRoot}/${relative}`.replace(/\/+/g, '/');
}


function getRetroRemotePath(filepath) {
  const info = getPkgLibraryInfo(filepath);

  if (!info || info.platform !== 'retro') {
    throw new Error('Invalid Retro game path');
  }

  if (info.retroType === 'ps1') {
    const relative = toPosixRelativePath(path.relative(ps1GamePath, filepath));
    return `${retroRemoteRoot}/psx/${relative}`.replace(/\/+/g, '/');
  }

  const relative = toPosixRelativePath(path.relative(retroGamePath, filepath));
  const parts = relative.split('/').filter(Boolean);
  const sourceSystem = parts.length > 1 ? safeRetroRemoteFolderName(parts.shift()) : 'Retro';
  const rest = parts.length ? parts.join('/') : path.basename(filepath);

  return `${retroRemoteRoot}/${sourceSystem}/${rest}`.replace(/\/+/g, '/');
}

async function ps5UploadUploadRetroGame(filepath, host, onProgress = null) {
  const info = getPkgLibraryInfo(filepath);

  if (!info || info.platform !== 'retro') {
    throw new Error('Invalid Retro game path');
  }

  const retroName = path.basename(filepath);
  const remotePath = getRetroRemotePath(filepath);
  const result = await ps5UploadTransferFile(filepath, remotePath, host, (status, message) => {
    if (typeof onProgress === 'function') {
      onProgress(status, message || `Uploading ${retroName} to RetroArch`);
    }
  });

  return {
    ...result,
    installMode: 'retroupload',
    message: `Uploaded ${retroName} to ${result.remotePath}`,
    game: retroName
  };
}


async function ps5UploadTransferFile(localPath, remotePath, host, onProgress = null) {
  const ps5Addr = normalizePs5UploadAddr(host);
  const fileSize = fs.statSync(localPath).size;
  const safeName = path.basename(localPath);
  const remoteDir = posixDirname(remotePath);

  await ps5UploadMkdirp(ps5Addr, remoteDir);

  const start = await ps5UploadFetchJson('/api/transfer/file', {
    method: 'POST',
    body: JSON.stringify({
      src: localPath,
      dest: remotePath,
      addr: ps5Addr,
      tx_id: null
    })
  }, 30000);

  const jobId = start.job_id || start.jobId || start.id || start.job;

  if (!jobId) {
    throw new Error(`PS5Upload did not return a transfer job id: ${JSON.stringify(start)}`);
  }

  if (typeof onProgress === 'function') {
    onProgress(start, `Uploading ${safeName} to ${remotePath}`);
  }

  const timeoutMs = Math.max(ps5UploadInstallTimeoutMs, Math.ceil(fileSize / 1024 / 1024) * 30000);
  const job = await ps5UploadPollJob(jobId, timeoutMs, (status) => {
    if (typeof onProgress === 'function') {
      onProgress(status, `Uploading ${safeName}`);
    }
  });

  return {
    ok: true,
    message: `Uploaded ${safeName} to ${remotePath}`,
    file: safeName,
    ps5_addr: ps5Addr,
    source: localPath,
    remotePath,
    bytes: fileSize,
    sizeLabel: formatDashboardSize(fileSize),
    jobId,
    job
  };
}

async function ps5UploadUploadSwitchGame(filepath, host, onProgress = null) {
  const info = getPkgLibraryInfo(filepath);

  if (!info || info.platform !== 'switch') {
    throw new Error('Invalid Nintendo Switch game path');
  }

  const result = await ps5UploadTransferFile(filepath, getSwitchRemotePath(filepath), host, onProgress);

  return {
    ...result,
    installMode: 'switchupload',
    message: `Uploaded ${path.basename(filepath)} to ${result.remotePath}`,
    game: path.basename(filepath)
  };
}

async function ps5UploadUploadPs2Game(filepath, host, onProgress = null) {
  const info = getPkgLibraryInfo(filepath);

  if (!info || info.platform !== 'ps2') {
    throw new Error('Invalid PS2 game path');
  }

  const ps2Name = path.basename(filepath);
  const ps5Addr = normalizePs5UploadAddr(host);
  const remotePath = getPs2RemotePath(filepath);
  const remoteDir = posixDirname(remotePath);
  const fileSize = fs.statSync(filepath).size;

  await ps5UploadMkdirp(ps5Addr, remoteDir);

  const start = await ps5UploadFetchJson('/api/transfer/file', {
    method: 'POST',
    body: JSON.stringify({
      src: filepath,
      dest: remotePath,
      addr: ps5Addr,
      tx_id: null
    })
  }, 30000);

  const jobId = start.job_id || start.jobId || start.id || start.job;

  if (!jobId) {
    throw new Error(`PS5Upload did not return a PS2 transfer job id: ${JSON.stringify(start)}`);
  }

  if (typeof onProgress === 'function') {
    onProgress(start, `Uploading ${ps2Name} to ${remotePath}`);
  }

  const timeoutMs = Math.max(ps5UploadInstallTimeoutMs, Math.ceil(fileSize / 1024 / 1024) * 30000);
  const job = await ps5UploadPollJob(jobId, timeoutMs, (status) => {
    if (typeof onProgress === 'function') {
      onProgress(status, `Uploading ${ps2Name} to PCSX2 games`);
    }
  });

  return {
    ok: true,
    installMode: 'ps2upload',
    message: `Uploaded ${ps2Name} to ${remotePath}`,
    game: ps2Name,
    ps5_addr: ps5Addr,
    source: filepath,
    remotePath,
    bytes: fileSize,
    sizeLabel: formatDashboardSize(fileSize),
    jobId,
    job
  };
}


function ensureProsperoEdenUploadTempDir() {
  fs.mkdirSync(prosperoEdenUploadTempDir, { recursive: true });
}

function getProsperoEdenTargetConfig(target) {
  const key = String(target || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const configs = {
    keys: {
      label: 'Keys',
      remoteDir: prosperoEdenFolders.keys,
      allowed: ['.keys', '.txt']
    },
    firmware: {
      label: 'Firmware',
      remoteDir: prosperoEdenFolders.firmware,
      allowed: ['.nca', '.cnmt', '.xml', '.tik', '.cert', '.zip']
    },
    updates: {
      label: 'Updates',
      remoteDir: prosperoEdenFolders.updates,
      allowed: ['.nsp', '.nsz', '.nca', '.xci', '.xcz', '.zip']
    },
    mods: {
      label: 'Mods',
      remoteDir: prosperoEdenFolders.mods,
      allowed: []
    },
    roms: {
      label: 'ROMs',
      remoteDir: switchGameRemoteRoot,
      allowed: switchGameExtensions
    }
  };

  if (!configs[key]) {
    throw new Error('Invalid ProsperoEden target. Use keys, firmware, updates, mods, or roms.');
  }

  return { key, ...configs[key] };
}

function safeRemoteRelativePath(value, fallbackName) {
  const raw = String(value || fallbackName || 'upload.bin').replace(/\\/g, '/');
  const parts = raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== '.' && part !== '..')
    .map((part) => part.replace(/[<>:"|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').slice(0, 180));

  const clean = parts.join('/');
  return clean || safeUploadBaseName(fallbackName || 'upload.bin');
}

function safeUploadBaseName(value) {
  return path.basename(String(value || 'upload.bin').trim() || 'upload.bin')
    .replace(/[<>:"\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 180) || 'upload.bin';
}

function validateProsperoEdenUploadName(config, relativePath) {
  const baseName = path.basename(relativePath);
  const ext = path.extname(baseName).toLowerCase();

  if (config.allowed.length && !config.allowed.includes(ext)) {
    throw new Error(`${config.label} upload must end with: ${config.allowed.join(', ')}`);
  }

  if (config.key === 'keys' && !['prod.keys', 'title.keys'].includes(baseName.toLowerCase())) {
    throw new Error('Keys upload should be prod.keys or title.keys');
  }
}

function resolveProsperoEdenTempFile(filename) {
  ensureProsperoEdenUploadTempDir();

  const safeName = `${Date.now()}-${crypto.randomUUID()}-${safeUploadBaseName(filename)}`;
  const tempPath = path.resolve(prosperoEdenUploadTempDir, safeName);

  if (!tempPath.startsWith(prosperoEdenUploadTempDir + path.sep)) {
    throw new Error('Invalid temporary upload path');
  }

  return tempPath;
}

async function uploadProsperoEdenFile(options = {}) {
  const config = getProsperoEdenTargetConfig(options.target);
  const filename = safeUploadBaseName(options.filename || 'upload.bin');
  const relativePath = safeRemoteRelativePath(options.relativePath || filename, filename);
  const host = String(options.host || process.env.PS5_ADDR || currentPS5ipadr || '').trim();

  if (!Buffer.isBuffer(options.buffer) || options.buffer.length === 0) {
    throw new Error('Missing upload body');
  }

  validateProsperoEdenUploadName(config, relativePath);

  const tempPath = resolveProsperoEdenTempFile(filename);
  const remotePath = `${config.remoteDir}/${relativePath}`.replace(/\/+/g, '/');

  try {
    fs.writeFileSync(tempPath, options.buffer);

    const result = await ps5UploadTransferFile(tempPath, remotePath, host, null);

    return {
      ok: true,
      target: config.key,
      message: `Uploaded ${relativePath} to ${remotePath}`,
      remotePath,
      filename,
      relativePath,
      bytes: options.buffer.length,
      sizeLabel: formatDashboardSize(options.buffer.length),
      jobId: result.jobId,
      job: result.job
    };
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}


function ensurePs5sx2UploadTempDir() {
  fs.mkdirSync(ps5sx2UploadTempDir, { recursive: true });
}

function validatePs5sx2BiosName(relativePath) {
  const baseName = path.basename(String(relativePath || ''));
  const ext = path.extname(baseName).toLowerCase();

  // Some BIOS packs include supporting files without an extension, so only block files when an extension exists and is not allowed.
  if (ext && pcsx2BiosExtensions.length && !pcsx2BiosExtensions.includes(ext)) {
    throw new Error(`BIOS upload must end with: ${pcsx2BiosExtensions.join(', ')}. Extensionless support files are allowed.`);
  }
}

function resolvePs5sx2TempFile(filename) {
  ensurePs5sx2UploadTempDir();

  const safeName = `${Date.now()}-${crypto.randomUUID()}-${safeUploadBaseName(filename || 'bios.bin')}`;
  const tempPath = path.resolve(ps5sx2UploadTempDir, safeName);

  if (!tempPath.startsWith(ps5sx2UploadTempDir + path.sep)) {
    throw new Error('Invalid temporary PS5SX2 upload path');
  }

  return tempPath;
}

async function uploadPs5sx2BiosFile(options = {}) {
  const filename = safeUploadBaseName(options.filename || 'bios.bin');
  const relativePath = safeRemoteRelativePath(options.relativePath || filename, filename);
  const host = String(options.host || process.env.PS5_ADDR || currentPS5ipadr || '').trim();

  if (!Buffer.isBuffer(options.buffer) || options.buffer.length === 0) {
    throw new Error('Missing BIOS upload body');
  }

  validatePs5sx2BiosName(relativePath);

  const tempPath = resolvePs5sx2TempFile(filename);
  const remotePath = `${pcsx2BiosRemoteDir}/${relativePath}`.replace(/\/+/g, '/');

  try {
    fs.writeFileSync(tempPath, options.buffer);

    const result = await ps5UploadTransferFile(tempPath, remotePath, host, null);

    return {
      ok: true,
      target: 'bios',
      message: `Uploaded ${relativePath} to ${remotePath}`,
      remotePath,
      filename,
      relativePath,
      bytes: options.buffer.length,
      sizeLabel: formatDashboardSize(options.buffer.length),
      jobId: result.jobId,
      job: result.job
    };
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
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


function ensurePs5PayloadDir() {
  fs.mkdirSync(ps5PayloadDir, { recursive: true });
}

function isAllowedPs5PayloadName(filename) {
  return /\.(elf|bin|payload)$/i.test(String(filename || ''));
}

function safePs5PayloadFilename(value) {
  const baseName = path.basename(String(value || 'payload.elf').trim() || 'payload.elf');
  return baseName
    .replace(/[<>:"\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function resolvePs5PayloadPath(filename) {
  ensurePs5PayloadDir();

  const safeName = safePs5PayloadFilename(filename);

  if (!safeName || !isAllowedPs5PayloadName(safeName)) {
    throw new Error('Payload filename must end with .elf, .bin, or .payload');
  }

  const payloadPath = path.resolve(ps5PayloadDir, safeName);

  if (!payloadPath.startsWith(ps5PayloadDir + path.sep)) {
    throw new Error('Invalid payload path');
  }

  return payloadPath;
}

function getPs5Payloads() {
  ensurePs5PayloadDir();

  return fs.readdirSync(ps5PayloadDir)
    .filter(isAllowedPs5PayloadName)
    .map((filename) => {
      const filepath = resolvePs5PayloadPath(filename);
      const stat = fs.statSync(filepath);

      return {
        name: filename,
        size: stat.size,
        sizeLabel: formatDashboardSize(stat.size),
        modifiedAt: stat.mtime.toISOString(),
        downloadUrl: `/ps5/payload-files/${encodeURIComponent(filename)}`
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}


function getPayloadManagerFolderName(filename) {
  return path.parse(safePs5PayloadFilename(filename)).name
    .replace(/[<>:"\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 96) || 'payload';
}

function getPs5PayloadManagerHost(input) {
  const raw = String(input || currentPS5ipadr || process.env.PS5IP || process.env.PS5_HOST || '').trim();

  if (!raw) {
    throw new Error('Missing PS5 host/IP for Payload Manager sync');
  }

  const clean = raw
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .trim();

  if (!isValidHost(clean)) {
    throw new Error('Invalid PS5 host/IP for Payload Manager sync');
  }

  return clean;
}

function getPs5PayloadManagerUrl(host) {
  return `http://${getPs5PayloadManagerHost(host)}:${ps5PayloadManagerPort}`;
}

async function ps5PayloadManagerFetch(pathname, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getPs5PayloadManagerUrl(options.host)}${pathname}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: 'application/json,text/plain,*/*',
        ...(options.headers || {})
      }
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(text || `Payload Manager HTTP ${response.status}`);
    }

    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { text };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function getPs5PayloadManagerList(host) {
  return ps5PayloadManagerFetch('/list_payloads', { host }, 5000);
}

async function syncPs5PayloadToPayloadManager(filename, options = {}) {
  const filepath = resolvePs5PayloadPath(filename);

  if (!fs.existsSync(filepath)) {
    throw new Error('Payload not found');
  }

  const host = getPs5PayloadManagerHost(options.host);
  const addr = normalizePs5UploadAddr(options.ps5uploadAddr || host);
  const managerUrl = getPs5PayloadManagerUrl(host);
  const safeName = path.basename(filepath);
  const folderName = getPayloadManagerFolderName(safeName);
  const remoteRoot = String(options.remoteRoot || ps5PayloadManagerRemoteDir || '/data/pldmgr/payloads').replace(/\/+$/, '') || '/data/pldmgr/payloads';
  const remoteFolder = `${remoteRoot}/${folderName}`;
  const remotePath = `${remoteFolder}/${safeName}`;
  const fileSize = fs.statSync(filepath).size;

  await ps5UploadMkdir(addr, remoteRoot).catch(() => {});
  await ps5UploadMkdir(addr, remoteFolder).catch(() => {});

  // Do not use /api/ps5/fs/write-bytes for payloads. It base64-encodes the whole file
  // and ps5upload rejects larger bodies with body_too_large. Use the streaming transfer
  // job API instead; it reads the local host file directly from the pkgsender container.
  const transferStart = await ps5UploadFetchJson('/api/transfer/file', {
    method: 'POST',
    body: JSON.stringify({
      src: filepath,
      dest: remotePath,
      addr,
      tx_id: null
    })
  }, 30000);

  const jobId = transferStart.job_id || transferStart.jobId || transferStart.id || transferStart.job;

  if (!jobId) {
    throw new Error(`PS5Upload did not return a payload transfer job id: ${JSON.stringify(transferStart)}`);
  }

  const transferJob = await ps5UploadPollJob(jobId, Math.max(120000, Math.ceil(fileSize / 1024 / 1024) * 30000), () => {});

  let managerList = null;

  try {
    managerList = await getPs5PayloadManagerList(host);
  } catch (error) {
    managerList = {
      warning: `Copied, but could not refresh Payload Manager list: ${error.message}`
    };
  }

  return {
    ok: true,
    message: `Synced ${safeName} to Payload Manager`,
    payload: safeName,
    managerUrl,
    remotePath,
    remoteFolder,
    bytes: fileSize,
    sizeLabel: formatDashboardSize(fileSize),
    jobId,
    transferJob,
    managerList
  };
}

async function sendPs5PayloadFile(filename, req) {
  const filepath = resolvePs5PayloadPath(filename);

  if (!fs.existsSync(filepath)) {
    throw new Error('Payload not found');
  }

  const host = getRequiredPs5Host(req);
  const portToUse = Number.parseInt(String(req.body?.port || req.query.port || ps5ElfPort), 10);

  if (!Number.isInteger(portToUse) || portToUse <= 0 || portToUse > 65535) {
    throw new Error('Invalid PS5 ELF loader port');
  }

  const buffer = fs.readFileSync(filepath);
  const response = await sendTcpBuffer(host, portToUse, buffer, ps5TcpTimeoutMs);

  return {
    ok: true,
    message: `Payload ${path.basename(filepath)} sent to ${host}:${portToUse}`,
    payload: path.basename(filepath),
    bytes: buffer.length,
    response
  };
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





function ensurePs5HomebrewDirs() {
  fs.mkdirSync(ps5HomebrewArchiveDir, { recursive: true });
  fs.mkdirSync(ps5HomebrewAppsDir, { recursive: true });
  fs.mkdirSync(ps5HomebrewTmpDir, { recursive: true });
}

function safePs5HomebrewName(value) {
  return path.basename(String(value || 'homebrew').trim() || 'homebrew')
    .replace(/[<>:"\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function isAllowedHomebrewArchive(filename) {
  return /\.zip$/i.test(String(filename || ''));
}

function safeHomebrewFolderName(value) {
  const name = safePs5HomebrewName(value).replace(/\.zip$/i, '').trim() || 'homebrew';
  return name
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}

function resolvePs5HomebrewAppPath(folderName) {
  ensurePs5HomebrewDirs();

  const safeName = safeHomebrewFolderName(folderName);
  const appPath = path.resolve(ps5HomebrewAppsDir, safeName);

  if (!appPath.startsWith(ps5HomebrewAppsDir + path.sep)) {
    throw new Error('Invalid homebrew folder path');
  }

  return appPath;
}

function resolvePs5HomebrewArchivePath(filename) {
  ensurePs5HomebrewDirs();

  const safeName = safePs5HomebrewName(filename);

  if (!safeName || !isAllowedHomebrewArchive(safeName)) {
    throw new Error('Homebrew upload must be a .zip file');
  }

  const archivePath = path.resolve(ps5HomebrewArchiveDir, safeName);

  if (!archivePath.startsWith(ps5HomebrewArchiveDir + path.sep)) {
    throw new Error('Invalid homebrew archive path');
  }

  return archivePath;
}

function copyDirectorySync(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });

    fs.readdirSync(src).forEach((entry) => {
      copyDirectorySync(path.join(src, entry), path.join(dest, entry));
    });

    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function getDirectorySizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;

  return fs.readdirSync(dir).reduce((sum, entry) => {
    const filepath = path.join(dir, entry);
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) {
      return sum + getDirectorySizeBytes(filepath);
    }

    return sum + stat.size;
  }, 0);
}

function listFilesRecursive(rootDir, currentDir = rootDir) {
  if (!fs.existsSync(currentDir)) return [];

  return fs.readdirSync(currentDir).flatMap((entry) => {
    const filepath = path.join(currentDir, entry);
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) {
      return listFilesRecursive(rootDir, filepath);
    }

    return [{
      filepath,
      relativePath: path.relative(rootDir, filepath).split(path.sep).join('/')
    }];
  });
}

function countFilesRecursive(dir) {
  return listFilesRecursive(dir).length;
}

function getPs5HomebrewApps() {
  ensurePs5HomebrewDirs();

  return fs.readdirSync(ps5HomebrewAppsDir)
    .map((name) => {
      const appPath = path.join(ps5HomebrewAppsDir, name);
      const stat = fs.statSync(appPath);

      if (!stat.isDirectory()) return null;

      const titleIdMatch = name.match(/PPSA\d{5}/i);

      return {
        name,
        titleId: titleIdMatch ? titleIdMatch[0].toUpperCase() : '',
        size: getDirectorySizeBytes(appPath),
        sizeLabel: formatDashboardSize(getDirectorySizeBytes(appPath)),
        fileCount: countFilesRecursive(appPath),
        modifiedAt: stat.mtime.toISOString(),
        downloadUrl: `/ps5/homebrew-files/${encodeURIComponent(name)}/`
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findBestHomebrewFolder(extractDir, fallbackName) {
  const entries = fs.readdirSync(extractDir)
    .map((entry) => ({
      name: entry,
      path: path.join(extractDir, entry)
    }))
    .filter((item) => fs.statSync(item.path).isDirectory());

  const ppsa = entries.find((item) => /^PPSA\d{5}$/i.test(item.name));

  if (ppsa) {
    return { sourcePath: ppsa.path, folderName: ppsa.name.toUpperCase() };
  }

  if (entries.length === 1) {
    return { sourcePath: entries[0].path, folderName: safeHomebrewFolderName(entries[0].name) };
  }

  return { sourcePath: extractDir, folderName: safeHomebrewFolderName(fallbackName) };
}

function extractPs5HomebrewArchive(archivePath) {
  ensurePs5HomebrewDirs();

  const baseName = safeHomebrewFolderName(path.basename(archivePath, path.extname(archivePath)));
  const extractDir = path.join(ps5HomebrewTmpDir, `${baseName}-${Date.now()}`);

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  return new Promise((resolve, reject) => {
    execFile('unzip', ['-q', '-o', archivePath, '-d', extractDir], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        fs.rmSync(extractDir, { recursive: true, force: true });
        return reject(new Error(`Could not extract ZIP. Make sure unzip is installed in the container. ${stderr || err.message}`));
      }

      try {
        const detected = findBestHomebrewFolder(extractDir, baseName);
        const folderName = safeHomebrewFolderName(detected.folderName);
        const destPath = resolvePs5HomebrewAppPath(folderName);

        fs.rmSync(destPath, { recursive: true, force: true });
        copyDirectorySync(detected.sourcePath, destPath);
        fs.rmSync(extractDir, { recursive: true, force: true });

        const appInfo = getPs5HomebrewApps().find((item) => item.name === folderName) || {
          name: folderName,
          size: getDirectorySizeBytes(destPath),
          sizeLabel: formatDashboardSize(getDirectorySizeBytes(destPath)),
          fileCount: countFilesRecursive(destPath)
        };

        resolve(appInfo);
      } catch (error) {
        fs.rmSync(extractDir, { recursive: true, force: true });
        reject(error);
      }
    });
  });
}

function encodeFtpPath(remotePath) {
  return String(remotePath || '/')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
    .replace(/^%2F/i, '/');
}

function buildFtpUrl(host, portNumber, remotePath) {
  const encodedPath = encodeFtpPath(remotePath).replace(/^\/+/, '');
  return `ftp://${host}:${portNumber}/${encodedPath}`;
}

function runCurlFtpUpload({ host, portNumber, username, password, localPath, remotePath }) {
  return new Promise((resolve, reject) => {
    const args = [
      '--fail',
      '--silent',
      '--show-error',
      '--ftp-create-dirs',
      '--connect-timeout',
      '15',
      '--max-time',
      String(Math.ceil(ps5FtpTimeoutMs / 1000)),
      '-T',
      localPath
    ];

    if (username) {
      args.push('--user', `${username}:${password || ''}`);
    }

    args.push(buildFtpUrl(host, portNumber, remotePath));

    execFile('curl', args, { timeout: ps5FtpTimeoutMs + 15000 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message));
      }

      resolve({ stdout, stderr });
    });
  });
}


async function ps5UploadMkdir(addr, targetPath) {
  if (!targetPath || targetPath === '/') return;

  try {
    await ps5UploadFetchJson('/api/ps5/fs/mkdir', {
      method: 'POST',
      body: JSON.stringify({ addr, path: targetPath })
    }, 30000);
  } catch (error) {
    const msg = String(error.message || '').toLowerCase();

    // Continue if the directory already exists or if the server reports a benign mkdir failure.
    if (!msg.includes('exist') && !msg.includes('already') && !msg.includes('eexist')) {
      throw error;
    }
  }
}

async function ps5UploadPollJob(jobId, timeoutMs, onProgress = null) {
  const startedAt = Date.now();

  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`PS5Upload transfer timed out for job ${jobId}`);
    }

    const job = await ps5UploadFetchJson(`/api/jobs/${encodeURIComponent(jobId)}`, {}, 30000);

    if (typeof onProgress === 'function') {
      onProgress(job);
    }

    if (job.status === 'done') {
      return job;
    }

    if (job.status === 'failed') {
      throw new Error(job.error || job.message || `PS5Upload transfer failed for job ${jobId}`);
    }

    await wait(ps5UploadInstallPollMs || 2500);
  }
}


async function ps5UploadPollFsOp(addr, opId, timeoutMs = ps5FtpTimeoutMs) {
  if (opId === undefined || opId === null || opId === '') {
    return {};
  }

  const startedAt = Date.now();

  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`PS5Upload filesystem operation timed out for op ${opId}`);
    }

    const query = `/api/ps5/fs/op-status?op_id=${encodeURIComponent(opId)}&addr=${encodeURIComponent(addr)}`;
    const status = await ps5UploadFetchJson(query, {}, 30000);
    const state = String(status.status || status.state || status.phase || '').toLowerCase();

    if (
      state === 'done' ||
      state === 'complete' ||
      state === 'completed' ||
      state === 'success' ||
      status.done === true ||
      status.ok === true
    ) {
      return status;
    }

    if (
      state === 'failed' ||
      state === 'error' ||
      status.failed === true ||
      status.ok === false
    ) {
      throw new Error(status.error || status.message || `PS5Upload filesystem operation failed for op ${opId}`);
    }

    await wait(ps5UploadInstallPollMs || 2500);
  }
}

async function ps5UploadDeletePath(addr, targetPath, timeoutMs = ps5FtpTimeoutMs) {
  const response = await ps5UploadFetchJson('/api/ps5/fs/delete', {
    method: 'POST',
    body: JSON.stringify({
      addr,
      path: targetPath,
      op_id: 0
    })
  }, 30000);

  const opId = response.op_id || response.opId || response.id || response.job_id || response.job;

  if (opId !== undefined && opId !== null && opId !== '') {
    const opStatus = await ps5UploadPollFsOp(addr, opId, timeoutMs);
    return { response, opId, opStatus };
  }

  return { response, opId: null, opStatus: null };
}

function normalizeRemoteFsPath(value) {
  let clean = String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim();

  if (!clean.startsWith('/')) {
    clean = `/${clean}`;
  }

  clean = clean.replace(/\/+$/, '');

  return clean || '/';
}

function ensureRemotePathInsideRoot(rootPath, targetPath) {
  const root = normalizeRemoteFsPath(rootPath);
  const target = normalizeRemoteFsPath(targetPath);

  if (target === root) {
    throw new Error(`Refusing to delete root folder ${root}`);
  }

  if (!target.startsWith(`${root}/`)) {
    throw new Error(`Refusing to access path outside ${root}`);
  }

  const parts = target.split('/').filter(Boolean);

  if (parts.includes('..')) {
    throw new Error('Invalid remote path');
  }

  return target;
}

function getEntryValue(entry, keys) {
  for (const key of keys) {
    if (entry && entry[key] !== undefined && entry[key] !== null) {
      return entry[key];
    }
  }

  return undefined;
}

function extractPs5UploadDirEntries(data) {
  if (Array.isArray(data)) return data;

  for (const key of ['entries', 'items', 'files', 'children', 'list', 'dirents', 'rows']) {
    if (Array.isArray(data?.[key])) {
      return data[key];
    }
  }

  if (Array.isArray(data?.result?.entries)) return data.result.entries;
  if (Array.isArray(data?.result?.items)) return data.result.items;

  return [];
}

function normalizePs5UploadDirEntry(entry, parentPath) {
  const rawName = String(getEntryValue(entry, ['name', 'filename', 'file_name', 'basename', 'displayName']) || '').trim();
  const rawPath = String(getEntryValue(entry, ['path', 'fullPath', 'full_path', 'remotePath']) || '').trim();
  const entryPath = rawPath
    ? normalizeRemoteFsPath(rawPath)
    : normalizeRemoteFsPath(`${normalizeRemoteFsPath(parentPath)}/${rawName}`);

  const name = rawName || path.posix.basename(entryPath);
  const kind = String(getEntryValue(entry, ['type', 'kind', 'entryType']) || '').toLowerCase();
  const isDir = entry?.is_dir === true ||
    entry?.isDir === true ||
    entry?.directory === true ||
    kind === 'dir' ||
    kind === 'directory' ||
    kind === 'folder';

  const sizeNumber = Number(getEntryValue(entry, ['size', 'bytes', 'file_size', 'length']) || 0);

  return {
    name,
    path: entryPath,
    isDir,
    type: isDir ? 'directory' : 'file',
    size: Number.isFinite(sizeNumber) ? sizeNumber : 0,
    sizeLabel: formatDashboardSize(Number.isFinite(sizeNumber) ? sizeNumber : 0),
    modifiedAt: getEntryValue(entry, ['modifiedAt', 'modified_at', 'mtime', 'lastModified', 'last_modified']) || null
  };
}

async function ps5UploadListDir(addr, remotePath, options = {}) {
  const limit = Number.parseInt(String(options.limit || 5000), 10);
  const query = `/api/ps5/list-dir?addr=${encodeURIComponent(addr)}&path=${encodeURIComponent(remotePath)}&limit=${encodeURIComponent(limit)}`;
  const data = await ps5UploadFetchJson(query, {}, 30000);
  const entries = extractPs5UploadDirEntries(data).map((entry) => normalizePs5UploadDirEntry(entry, remotePath));

  return {
    ok: true,
    path: remotePath,
    entries,
    raw: data
  };
}

async function ps5UploadListRemoteFiles(addr, remoteRoot, allowedExtensions = [], maxDepth = 4) {
  const root = normalizeRemoteFsPath(remoteRoot);
  const allowed = new Set((allowedExtensions || []).map((item) => String(item || '').toLowerCase()).filter(Boolean));
  const results = [];
  const visited = new Set();

  async function visit(currentPath, depth) {
    const cleanPath = normalizeRemoteFsPath(currentPath);

    if (visited.has(cleanPath) || depth > maxDepth) {
      return;
    }

    visited.add(cleanPath);

    let listing;

    try {
      listing = await ps5UploadListDir(addr, cleanPath);
    } catch (error) {
      if (cleanPath === root) {
        throw error;
      }

      return;
    }

    for (const entry of listing.entries) {
      if (!entry.name || entry.name === '.' || entry.name === '..') {
        continue;
      }

      if (entry.isDir) {
        await visit(entry.path, depth + 1);
        continue;
      }

      const ext = path.posix.extname(entry.name).toLowerCase();

      if (allowed.size && !allowed.has(ext)) {
        continue;
      }

      results.push(entry);
    }
  }

  await visit(root, 0);

  results.sort((a, b) => a.name.localeCompare(b.name));

  return results;
}

function getPs5RemoteHost(options = {}) {
  const host = String(options.host || process.env.PS5_ADDR || currentPS5ipadr || '').trim();

  if (!isValidHost(host.replace(/:\d+$/, ''))) {
    throw new Error('Missing or invalid PS5 host/IP');
  }

  return normalizePs5UploadAddr(host);
}

async function getProsperoEdenRemoteRoms(options = {}) {
  const addr = getPs5RemoteHost(options);
  const files = await ps5UploadListRemoteFiles(addr, switchGameRemoteRoot, switchGameExtensions, 5);

  return {
    ok: true,
    ps5_addr: addr,
    remoteRoot: switchGameRemoteRoot,
    roms: files
  };
}

async function deleteProsperoEdenRemoteRom(remotePath, options = {}) {
  const addr = getPs5RemoteHost(options);
  const target = ensureRemotePathInsideRoot(switchGameRemoteRoot, remotePath);
  const result = await ps5UploadDeletePath(addr, target, ps5FtpTimeoutMs);

  return {
    ok: true,
    message: `Deleted ${target} from ProsperoEden roms`,
    ps5_addr: addr,
    remotePath: target,
    opId: result.opId,
    opStatus: result.opStatus
  };
}

async function getPs5sx2RemoteGames(options = {}) {
  const addr = getPs5RemoteHost(options);
  const files = await ps5UploadListRemoteFiles(addr, ps2GameRemoteRoot, ps2GameExtensions, 5);

  return {
    ok: true,
    ps5_addr: addr,
    remoteRoot: ps2GameRemoteRoot,
    games: files
  };
}

async function deletePs5sx2RemoteGame(remotePath, options = {}) {
  const addr = getPs5RemoteHost(options);
  const target = ensureRemotePathInsideRoot(ps2GameRemoteRoot, remotePath);
  const result = await ps5UploadDeletePath(addr, target, ps5FtpTimeoutMs);

  return {
    ok: true,
    message: `Deleted ${target} from PCSX2 games`,
    ps5_addr: addr,
    remotePath: target,
    opId: result.opId,
    opStatus: result.opStatus
  };
}


async function deletePs5HomebrewRemote(folderName, options = {}) {
  const localPath = resolvePs5HomebrewAppPath(folderName);
  const folder = path.basename(localPath);
  const host = String(options.host || process.env.PS5_ADDR || currentPS5ipadr || '').trim();

  if (!isValidHost(host.replace(/:\d+$/, ''))) {
    throw new Error('Missing or invalid PS5 host/IP');
  }

  const addr = normalizePs5UploadAddr(host);
  const remoteRoot = String(options.remoteRoot || ps5HomebrewRemoteRoot || '/data/homebrew').replace(/\/+$/, '') || '/data/homebrew';
  const remotePath = `${remoteRoot}/${folder}`;

  const result = await ps5UploadDeletePath(addr, remotePath, ps5FtpTimeoutMs);

  return {
    ok: true,
    method: 'ps5upload',
    message: `Deleted ${remotePath} from ${addr}`,
    folder,
    remotePath,
    opId: result.opId,
    opStatus: result.opStatus
  };
}


async function deployPs5HomebrewAppWithPs5Upload(folderName, options = {}) {
  const appPath = resolvePs5HomebrewAppPath(folderName);

  if (!fs.existsSync(appPath)) {
    throw new Error('Homebrew app not found');
  }

  const host = String(options.host || process.env.PS5_ADDR || currentPS5ipadr || '').trim();

  if (!isValidHost(host.replace(/:\d+$/, ''))) {
    throw new Error('Missing or invalid PS5 host/IP');
  }

  const addr = normalizePs5UploadAddr(host);
  const folder = path.basename(appPath);
  const remoteRoot = String(options.remoteRoot || ps5HomebrewRemoteRoot || '/data/homebrew').replace(/\/+$/, '') || '/data/homebrew';
  const remotePath = `${remoteRoot}/${folder}`;
  const files = listFilesRecursive(appPath);

  if (files.length === 0) {
    throw new Error('Homebrew folder is empty');
  }

  await ps5UploadMkdir(addr, remoteRoot).catch(() => {});
  await ps5UploadMkdir(addr, remotePath).catch(() => {});

  // Plain directory transfer is used here instead of /api/transfer/dir-reconcile.
  // The reconcile endpoint only accepts modes such as fast/resume, not overwrite.
  // /api/transfer/dir uploads the extracted folder contents to the chosen destination.
  const start = await ps5UploadFetchJson('/api/transfer/dir', {
    method: 'POST',
    body: JSON.stringify({
      src_dir: appPath,
      dest_root: remotePath,
      addr,
      tx_id: null,
      excludes: [],
      bandwidth_cap_mbps: null
    })
  }, 30000);

  const jobId = start.job_id || start.jobId || start.id || start.job;

  if (!jobId) {
    throw new Error(`PS5Upload did not return a transfer job id: ${JSON.stringify(start)}`);
  }

  const job = await ps5UploadPollJob(jobId, ps5FtpTimeoutMs, () => {});

  return {
    ok: true,
    method: 'ps5upload',
    message: `Deployed ${folder} to ${addr}${remotePath} with PS5Upload`,
    folder,
    remotePath,
    uploaded: files.length,
    total: files.length,
    jobId,
    job
  };
}

async function deployPs5HomebrewAppWithFtp(folderName, options = {}) {

  const appPath = resolvePs5HomebrewAppPath(folderName);

  if (!fs.existsSync(appPath)) {
    throw new Error('Homebrew app not found');
  }

  const host = String(options.host || currentPS5ipadr || '').trim();

  if (!isValidHost(host)) {
    throw new Error('Missing or invalid PS5 host/IP');
  }

  const portNumber = Number.parseInt(String(options.port || ps5FtpPort), 10);

  if (!Number.isInteger(portNumber) || portNumber <= 0 || portNumber > 65535) {
    throw new Error('Invalid PS5 FTP port');
  }

  const remoteRoot = String(options.remoteRoot || ps5HomebrewRemoteRoot || '/data/homebrew').replace(/\/+$/, '') || '/data/homebrew';
  const username = String(options.username || '').trim();
  const password = String(options.password || '');
  const files = listFilesRecursive(appPath);

  if (files.length === 0) {
    throw new Error('Homebrew folder is empty');
  }

  const uploaded = [];
  const errors = [];

  for (const file of files) {
    const remotePath = `${remoteRoot}/${path.basename(appPath)}/${file.relativePath}`;

    try {
      await runCurlFtpUpload({
        host,
        portNumber,
        username,
        password,
        localPath: file.filepath,
        remotePath
      });

      uploaded.push(file.relativePath);
    } catch (error) {
      errors.push({
        file: file.relativePath,
        message: error.message
      });
      break;
    }
  }

  if (errors.length) {
    throw new Error(`FTP upload failed after ${uploaded.length}/${files.length} file(s): ${errors[0].file}: ${errors[0].message}`);
  }

  return {
    ok: true,
    method: 'ftp',
    message: `Uploaded ${path.basename(appPath)} to ${host}:${portNumber}${remoteRoot}`,
    folder: path.basename(appPath),
    remotePath: `${remoteRoot}/${path.basename(appPath)}`,
    uploaded: uploaded.length,
    total: files.length
  };
}

async function deployPs5HomebrewApp(folderName, options = {}) {
  const method = String(options.method || ps5HomebrewDeployMethod || 'ps5upload').toLowerCase();

  if (method === 'ftp') {
    return deployPs5HomebrewAppWithFtp(folderName, options);
  }

  return deployPs5HomebrewAppWithPs5Upload(folderName, options);
}


function renderPs5StandaloneNavCss() {
  return `
    .ps5-page-nav {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      margin: 0 0 18px;
      padding: 14px 16px;
      color: var(--text);
      background: rgba(15, 23, 42, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      box-shadow: 0 14px 46px rgba(0, 0, 0, 0.24);
    }

    .ps5-nav-left,
    .ps5-nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .ps5-current-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 70px;
      padding: 8px 13px;
      color: #fff;
      background: linear-gradient(135deg, #2563eb, #0ea5e9);
      border-radius: 999px;
      font-weight: 1000;
      letter-spacing: -.04em;
    }

    .ps5-nav-title {
      display: grid;
      gap: 2px;
    }

    .ps5-nav-title strong {
      line-height: 1;
    }

    .ps5-nav-title span {
      color: var(--muted);
      font-size: .88rem;
    }

    .ps5-nav-button {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 7px 10px;
      color: #fff;
      text-decoration: none;
      font-size: .84rem;
      font-weight: 950;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      background: rgba(2, 6, 23, 0.28);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
      white-space: nowrap;
    }

    .ps5-nav-button:hover,
    .ps5-nav-button.active {
      color: #fff;
      border-color: rgba(125, 211, 252, 0.50);
      background: linear-gradient(135deg, #2563eb, #0ea5e9);
    }

    .ps5-nav-button i {
      pointer-events: none;
    }

    @media (max-width: 900px) {
      .ps5-page-nav {
        align-items: stretch;
        flex-direction: column;
      }

      .ps5-nav-left,
      .ps5-nav-actions {
        width: 100%;
      }

      .ps5-nav-actions .ps5-nav-button {
        flex: 1 1 180px;
      }
    }
  `;
}

function renderPs5NavBar(active = '') {
  const title = active === 'payloads'
    ? 'Payload / ELF manager'
    : active === 'homebrew'
      ? 'Homebrew app manager'
      : active === 'switch'
      ? 'Nintendo Switch / ProsperoEden'
      : active === 'ps5sx2'
      ? 'PS5SX2 / PCSX2 manager'
      : active === 'links'
      ? 'PS5 links'
      : active === 'ps5upload'
        ? 'PS5Upload web UI'
        : active === 'tools'
        ? 'Relapse / etaHEN tools'
        : 'PS5 package library';

  const subtitle = active === 'payloads'
    ? 'Upload, manage and send PS5 payloads'
    : active === 'homebrew'
      ? 'Upload ZIP apps and deploy them through PS5Upload to /data/homebrew'
      : active === 'switch'
        ? 'Upload keys, firmware, updates and mods to /data/prosperoeden'
      : active === 'ps5sx2'
        ? 'Upload BIOS files to /data/PCSX2/bios'
      : active === 'links'
        ? 'Open web UIs running on the PS5'
      : active === 'ps5upload'
        ? 'Manage installs through the integrated ps5upload engine'
        : active === 'tools'
        ? 'Relapse host, ELF sender and etaHEN DPI'
        : 'PS5 view: PS4 + PS5 packages';

  const navButton = (href, icon, label, key) => `
        <a class="ps5-nav-button${active === key ? ' active' : ''}" href="${href}">
          <i class="fa-solid ${icon}"></i>
          ${label}
        </a>`;

  return `
    <section class="ps5-page-nav" aria-label="PS5 navigation">
      <div class="ps5-nav-left">
        <span class="ps5-current-badge">PS5</span>
        <span class="ps5-nav-title">
          <strong>${title}</strong>
          <span>${subtitle}</span>
        </span>
      </div>
      <div class="ps5-nav-actions">
${navButton('/', 'fa-house', 'Main page', 'main')}
${navButton('/ps5', 'fa-gamepad', 'PS5 library', 'ps5')}
${navButton('/ps4', 'fa-gamepad', 'PS4 library', 'ps4')}
${navButton('/ps5/payloads', 'fa-microchip', 'Payloads / ELF', 'payloads')}
${navButton('/ps5/homebrew', 'fa-folder-tree', 'Homebrew apps', 'homebrew')}
${navButton('/ps5/nintendoswitch', 'fa-gamepad', 'Nintendo Switch', 'switch')}
${navButton('/ps5/ps5sx2', 'fa-compact-disc', 'PS5SX2', 'ps5sx2')}
${navButton('/ps5/links', 'fa-link', 'PS5 links', 'links')}
${navButton('/ps5/tools', 'fa-wrench', 'PS5 tools', 'tools')}
      </div>
    </section>`;
}



function renderPs5HomebrewPage() {
  const uploadLimit = process.env.PS5_HOMEBREW_UPLOAD_LIMIT || '2gb';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PS5 Homebrew Apps - PKG Sender</title>
  <link rel="stylesheet" href="/css/fontawesome.min.css">
  <link rel="stylesheet" href="/css/solid.min.css">
  <style>
    ${renderPs5StandaloneNavCss()}

    :root {
      --bg: #07111f;
      --panel: rgba(15, 23, 42, 0.86);
      --panel-2: rgba(30, 41, 59, 0.64);
      --border: rgba(255,255,255,0.14);
      --text: #eef3ff;
      --muted: #a9b8d4;
      --blue: #3b82f6;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #f59e0b;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, Segoe UI, Roboto, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(59,130,246,.32), transparent 34rem),
        radial-gradient(circle at bottom right, rgba(34,197,94,.18), transparent 38rem),
        var(--bg);
    }

    .page {
      width: min(1360px, calc(100vw - 48px));
      margin: 0 auto;
      padding: 18px 0 60px;
    }

    .hero,
    .panel {
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 26px;
      box-shadow: 0 24px 80px rgba(0,0,0,.32);
      backdrop-filter: blur(18px);
    }

    .hero {
      padding: 28px;
      margin-bottom: 18px;
    }

    .eyebrow {
      margin: 0 0 8px;
      color: #93c5fd;
      text-transform: uppercase;
      letter-spacing: .12em;
      font-size: .78rem;
      font-weight: 1000;
    }

    h1, h2, h3, p { margin-top: 0; }

    h1 {
      margin-bottom: 10px;
      font-size: clamp(2rem, 5vw, 4rem);
      line-height: .95;
      letter-spacing: -.07em;
    }

    .muted {
      color: var(--muted);
      line-height: 1.55;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, .95fr) minmax(0, 1.45fr);
      gap: 18px;
    }

    .panel {
      padding: 20px;
      min-width: 0;
    }

    .field {
      display: grid;
      gap: 7px;
      margin-bottom: 14px;
    }

    label {
      color: var(--muted);
      font-size: .85rem;
      font-weight: 800;
    }

    input[type="text"],
    input[type="number"],
    input[type="password"],
    input[type="file"] {
      width: 100%;
      color: var(--text);
      background: rgba(2, 6, 23, .6);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 13px;
      outline: none;
    }

    .btn {
      appearance: none;
      border: 0;
      cursor: pointer;
      border-radius: 14px;
      padding: 11px 14px;
      color: #fff;
      background: linear-gradient(135deg, #2563eb, #0ea5e9);
      font-weight: 950;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
      white-space: nowrap;
    }

    .btn.secondary { background: rgba(255,255,255,.10); border: 1px solid var(--border); }
    .btn.green { background: linear-gradient(135deg, #16a34a, #22c55e); }
    .btn.red { background: linear-gradient(135deg, #dc2626, #ef4444); }
    .btn:disabled { opacity: .55; cursor: not-allowed; }

    .homebrew-list {
      display: grid;
      gap: 12px;
    }

    .homebrew-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 14px;
      border: 1px solid var(--border);
      background: var(--panel-2);
      border-radius: 18px;
    }

    .homebrew-name {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .homebrew-name strong {
      overflow-wrap: anywhere;
    }

    .homebrew-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .status {
      min-height: 44px;
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,.06);
      color: var(--muted);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .status.success { color: #bbf7d0; border-color: rgba(34,197,94,.35); }
    .status.error { color: #fecaca; border-color: rgba(239,68,68,.40); }

    .empty {
      padding: 22px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--border);
      border-radius: 18px;
    }

    .help-box {
      padding: 14px;
      margin-top: 14px;
      color: #dbeafe;
      border: 1px solid rgba(125, 211, 252, 0.25);
      border-radius: 16px;
      background: rgba(14, 165, 233, 0.08);
      line-height: 1.55;
    }

    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      .homebrew-item { grid-template-columns: 1fr; }
      .homebrew-actions { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <main class="page">
    ${renderPs5NavBar('homebrew')}

    <section class="hero">
      <p class="eyebrow">PS5</p>
      <h1>Homebrew app manager</h1>
      <p class="muted">
        Upload a ZIP that contains a homebrew folder, for example <strong>PPSA99008</strong>.
        The app extracts it locally, then deploys it to <strong>/data/homebrew/&lt;folder&gt;</strong> through the integrated PS5Upload engine.
      </p>
    </section>

    <section class="grid">
      <article class="panel">
        <p class="eyebrow">PS5Upload</p>
        <h2>Deploy settings</h2>

        <div class="field">
          <label for="ps5Host">PS5 IP / host</label>
          <input id="ps5Host" type="text" value="${escapeHtml(currentPS5ipadr || '')}" placeholder="192.168.1.110">
        </div>

        <input id="ps5Port" type="hidden" value="${ps5FtpPort}">
        <input id="ftpUser" type="hidden" value="">
        <input id="ftpPass" type="hidden" value="">

        <div class="field">
          <label for="remoteRoot">Remote folder</label>
          <input id="remoteRoot" type="text" value="${escapeHtml(ps5HomebrewRemoteRoot)}" placeholder="/data/homebrew">
        </div>

        <div class="help-box">
          This uses <strong>PS5Upload</strong>, not FTP. Keep the ps5upload payload running on the PS5
          and make sure ports <strong>9113</strong>/<strong>9114</strong> are reachable.
          The deploy target is <strong>/data/homebrew/&lt;folder&gt;</strong>, and the remote delete button removes that same folder from the PS5.
        </div>

        <hr style="border:0;border-top:1px solid rgba(255,255,255,.12);margin:18px 0">

        <p class="eyebrow">Upload</p>
        <h2>Add homebrew ZIP</h2>

        <div class="field">
          <label for="homebrewFile">Homebrew ZIP</label>
          <input id="homebrewFile" type="file" accept=".zip">
        </div>

        <button class="btn green" id="uploadBtn" type="button">
          <i class="fa-solid fa-upload"></i>
          Upload and extract
        </button>

        <p class="muted" style="margin-top:12px">
          Max upload size: ${escapeHtml(uploadLimit)}.
        </p>

        <div class="status" id="statusBox">Ready.</div>
      </article>

      <article class="panel">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <p class="eyebrow">Library</p>
            <h2 style="margin:0">Extracted homebrew apps</h2>
          </div>
          <button class="btn secondary" id="refreshBtn" type="button">
            <i class="fa-solid fa-rotate"></i>
            Refresh
          </button>
        </div>

        <div class="homebrew-list" id="homebrewList"></div>
      </article>
    </section>
  </main>

  <script>
    (function () {
      'use strict';

      var listEl = document.getElementById('homebrewList');
      var statusBox = document.getElementById('statusBox');
      var uploadBtn = document.getElementById('uploadBtn');
      var refreshBtn = document.getElementById('refreshBtn');
      var fileInput = document.getElementById('homebrewFile');
      var hostInput = document.getElementById('ps5Host');
      var portInput = document.getElementById('ps5Port');
      var remoteRootInput = document.getElementById('remoteRoot');
      var ftpUserInput = document.getElementById('ftpUser');
      var ftpPassInput = document.getElementById('ftpPass');
      var NL = String.fromCharCode(10);

      function trimTrailingSlashes(value) {
        value = String(value || '');
        while (value.length > 1 && value.charAt(value.length - 1) === '/') {
          value = value.slice(0, -1);
        }
        return value || '/';
      }

      function setStatus(message, type) {
        if (!statusBox) return;
        statusBox.className = 'status ' + (type || '');
        statusBox.textContent = message || '';
      }

      function escapeText(value) {
        return String(value || '').replace(/[&<>"']/g, function (char) {
          return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          }[char];
        });
      }

      function requestJson(url, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers.Accept = 'application/json';

        return fetch(url, options).then(function (response) {
          return response.text().then(function (text) {
            var data = {};
            try {
              data = text ? JSON.parse(text) : {};
            } catch (error) {
              data = { message: text };
            }

            if (!response.ok) {
              throw new Error(data.message || data.error || response.statusText);
            }

            return data;
          });
        });
      }

      function appActionUrl(app, action) {
        return '/api/ps5/homebrew/apps/' + encodeURIComponent(app.name) + '/' + action;
      }

      function renderApps(apps) {
        if (!listEl) return;

        listEl.innerHTML = '';

        if (!apps.length) {
          listEl.innerHTML = '<div class="empty">No homebrew apps extracted yet.</div>';
          return;
        }

        apps.forEach(function (app) {
          var item = document.createElement('div');
          item.className = 'homebrew-item';

          var title = app.titleId ? app.name + ' · ' + app.titleId : app.name;
          var meta = app.sizeLabel + ' · ' + app.fileCount + ' file(s) · Modified ' + new Date(app.modifiedAt).toLocaleString();

          item.innerHTML =
            '<div class="homebrew-name">' +
              '<strong>' + escapeText(title) + '</strong>' +
              '<small class="muted">' + escapeText(meta) + '</small>' +
            '</div>' +
            '<div class="homebrew-actions">' +
              '<button class="btn green" type="button" data-action="deploy"><i class="fa-solid fa-cloud-arrow-up"></i> Deploy via PS5Upload</button>' +
              '<button class="btn red" type="button" data-action="delete-remote"><i class="fa-solid fa-trash-can-arrow-up"></i> Delete from PS5</button>' +
              '<button class="btn secondary" type="button" data-action="delete"><i class="fa-solid fa-trash"></i> Delete local</button>' +
            '</div>';

          item.querySelector('[data-action="deploy"]').addEventListener('click', function () {
            deployApp(app);
          });

          item.querySelector('[data-action="delete-remote"]').addEventListener('click', function () {
            deleteRemoteApp(app);
          });

          item.querySelector('[data-action="delete"]').addEventListener('click', function () {
            deleteApp(app);
          });

          listEl.appendChild(item);
        });
      }

      function loadApps() {
        setStatus('Loading homebrew app list...');
        return requestJson('/api/ps5/homebrew/apps')
          .then(function (data) {
            renderApps(data.apps || []);
            setStatus('Ready.');
          })
          .catch(function (error) {
            setStatus(error.message, 'error');
          });
      }

      function uploadHomebrew() {
        var file = fileInput && fileInput.files && fileInput.files[0];

        if (!file) {
          setStatus('Choose a .zip file first.', 'error');
          return;
        }

        if (!String(file.name || '').toLowerCase().endsWith('.zip')) {
          setStatus('Choose a .zip file. Selected: ' + file.name, 'error');
          return;
        }

        uploadBtn.disabled = true;
        setStatus('Starting upload for ' + file.name + '...');

        var xhr = new XMLHttpRequest();

        xhr.open('POST', '/api/ps5/homebrew/upload', true);
        xhr.responseType = 'text';
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('x-homebrew-filename', encodeURIComponent(file.name));

        xhr.upload.onprogress = function (event) {
          if (event.lengthComputable && event.total > 0) {
            var pct = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
            setStatus('Uploading ' + file.name + '... ' + pct + '%');
          } else {
            setStatus('Uploading ' + file.name + '...');
          }
        };

        xhr.onerror = function () {
          uploadBtn.disabled = false;
          setStatus('Upload failed before the server answered. Check container logs and upload size limit.', 'error');
        };

        xhr.onload = function () {
          uploadBtn.disabled = false;

          var data = {};
          try {
            data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          } catch (error) {
            data = { message: xhr.responseText || 'Invalid JSON response from server' };
          }

          if (xhr.status < 200 || xhr.status >= 300) {
            setStatus(data.message || data.error || ('Upload failed with HTTP ' + xhr.status), 'error');
            return;
          }

          setStatus(data.message || 'Homebrew ZIP uploaded and extracted.', 'success');
          if (fileInput) fileInput.value = '';
          loadApps();
        };

        xhr.send(file);
      }

      function deployApp(app) {
        var host = hostInput ? hostInput.value.trim() : '';
        var port = portInput ? portInput.value.trim() : '';
        var remoteRoot = remoteRootInput ? (remoteRootInput.value.trim() || '/data/homebrew') : '/data/homebrew';

        if (!host) {
          setStatus('Enter your PS5 IP first.', 'error');
          return;
        }

        setStatus('Deploying ' + app.name + ' with PS5Upload to ' + trimTrailingSlashes(remoteRoot) + '/' + app.name + '...');

        requestJson(appActionUrl(app, 'deploy'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'ps5upload',
            host: host,
            port: port,
            remoteRoot: remoteRoot,
            username: ftpUserInput ? ftpUserInput.value.trim() : '',
            password: ftpPassInput ? ftpPassInput.value : ''
          })
        }).then(function (data) {
          var message = data.message || 'Deploy finished.';
          message += NL + 'Remote path: ' + (data.remotePath || '');
          message += NL + 'Files: ' + (data.uploaded || 0) + '/' + (data.total || 0);
          if (data.jobId) message += NL + 'PS5Upload job: ' + data.jobId;
          setStatus(message, 'success');
        }).catch(function (error) {
          setStatus(error.message, 'error');
        });
      }

      function deleteRemoteApp(app) {
        var host = hostInput ? hostInput.value.trim() : '';
        var remoteRoot = remoteRootInput ? (remoteRootInput.value.trim() || '/data/homebrew') : '/data/homebrew';
        var remotePath = trimTrailingSlashes(remoteRoot) + '/' + app.name;

        if (!host) {
          setStatus('Enter your PS5 IP first.', 'error');
          return;
        }

        if (!confirm('Delete "' + remotePath + '" from the PS5? The local extracted copy in PKG Sender will stay.')) {
          return;
        }

        setStatus('Deleting ' + remotePath + ' from PS5 with PS5Upload...');

        requestJson(appActionUrl(app, 'delete-remote'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: host,
            remoteRoot: remoteRoot
          })
        }).then(function (data) {
          var message = data.message || 'Remote homebrew deleted from PS5.';
          if (data.opId) message += NL + 'PS5Upload op: ' + data.opId;
          setStatus(message, 'success');
        }).catch(function (error) {
          setStatus(error.message, 'error');
        });
      }

      function deleteApp(app) {
        if (!confirm('Delete extracted app "' + app.name + '" from PKG Sender local Docker storage only? This does not remove it from the PS5.')) {
          return;
        }

        setStatus('Deleting local extracted copy ' + app.name + '...');

        requestJson('/api/ps5/homebrew/apps/' + encodeURIComponent(app.name), {
          method: 'DELETE'
        }).then(function (data) {
          setStatus(data.message || 'Local homebrew app deleted.', 'success');
          return loadApps();
        }).catch(function (error) {
          setStatus(error.message, 'error');
        });
      }

      window.addEventListener('error', function (event) {
        var message = event && event.message ? event.message : 'Unknown browser script error';
        setStatus('Browser script error: ' + message, 'error');
      });

      if (fileInput) {
        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          if (file) {
            setStatus('Selected ' + file.name + '. Click Upload and extract to continue.');
          }
        });
      }

      if (uploadBtn) {
        uploadBtn.addEventListener('click', function (event) {
          event.preventDefault();
          uploadHomebrew();
        });
      }

      if (refreshBtn) {
        refreshBtn.addEventListener('click', function (event) {
          event.preventDefault();
          loadApps();
        });
      }

      loadApps();
    }());
  </script>
</body>
</html>`;
}



function renderProsperoEdenPage() {
  const uploadLimit = prosperoEdenUploadLimit;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nintendo Switch / ProsperoEden - PKG Sender</title>
  <link rel="stylesheet" href="/css/fontawesome.min.css">
  <link rel="stylesheet" href="/css/solid.min.css">
  <style>
    ${renderPs5StandaloneNavCss()}

    :root {
      --bg: #07111f;
      --panel: rgba(15, 23, 42, 0.86);
      --panel-2: rgba(30, 41, 59, 0.64);
      --border: rgba(255,255,255,0.14);
      --text: #eef3ff;
      --muted: #a9b8d4;
      --blue: #3b82f6;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #f59e0b;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, Segoe UI, Roboto, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(239,68,68,.25), transparent 34rem),
        radial-gradient(circle at bottom right, rgba(59,130,246,.20), transparent 38rem),
        var(--bg);
    }

    .page { width: min(1360px, calc(100vw - 48px)); margin: 0 auto; padding: 18px 0 60px; }
    .hero, .panel { border: 1px solid var(--border); background: var(--panel); border-radius: 26px; box-shadow: 0 24px 80px rgba(0,0,0,.32); backdrop-filter: blur(18px); }
    .hero { padding: 28px; margin-bottom: 18px; }
    .eyebrow { margin: 0 0 8px; color: #93c5fd; text-transform: uppercase; letter-spacing: .12em; font-size: .78rem; font-weight: 1000; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 10px; font-size: clamp(2rem, 5vw, 4rem); line-height: .95; letter-spacing: -.07em; }
    .muted { color: var(--muted); line-height: 1.55; }
    .grid { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.4fr); gap: 18px; align-items: start; }
    .panel { padding: 20px; min-width: 0; }
    .field { display: grid; gap: 7px; margin-bottom: 14px; }
    label { color: var(--muted); font-size: .85rem; font-weight: 800; }
    input[type="text"], input[type="file"], select { width: 100%; color: var(--text); background: rgba(2, 6, 23, .6); border: 1px solid var(--border); border-radius: 14px; padding: 12px 13px; outline: none; }
    .btn { appearance: none; border: 0; cursor: pointer; border-radius: 14px; padding: 11px 14px; color: #fff; background: linear-gradient(135deg, #2563eb, #0ea5e9); font-weight: 950; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; white-space: nowrap; }
    .btn.green { background: linear-gradient(135deg, #16a34a, #22c55e); }
    .btn.red { background: linear-gradient(135deg, #dc2626, #ef4444); }
    .btn.secondary { background: rgba(255,255,255,.10); border: 1px solid var(--border); }
    .btn:disabled { opacity: .55; cursor: not-allowed; }
    .status { min-height: 44px; margin-top: 14px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
    .status.success { color: #bbf7d0; border-color: rgba(34,197,94,.35); }
    .status.error { color: #fecaca; border-color: rgba(239,68,68,.40); }
    .help-box { padding: 14px; margin: 14px 0; color: #dbeafe; border: 1px solid rgba(125,211,252,.25); border-radius: 16px; background: rgba(14,165,233,.08); line-height: 1.55; }
    .target-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 14px; }
    .target-card { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel-2); cursor: pointer; }
    .target-card span { color: var(--text); font-weight: 950; }
    .target-card small { color: var(--muted); overflow-wrap: anywhere; }
    .upload-list, .remote-list { display: grid; gap: 10px; margin-top: 14px; }
    .upload-item, .remote-item { padding: 12px 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel-2); color: var(--muted); overflow-wrap: anywhere; }
    .upload-item.success { color: #bbf7d0; }
    .upload-item.error { color: #fecaca; }
    .remote-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; }
    .remote-item strong { color: var(--text); overflow-wrap: anywhere; }
    .remote-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .empty { padding: 22px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 18px; }
    .section-stack { display: grid; gap: 18px; }
    @media (max-width: 900px) { .grid, .target-grid { grid-template-columns: 1fr; } .remote-item { grid-template-columns: 1fr; } .remote-actions { justify-content: flex-start; } }
  </style>
</head>
<body>
  <main class="page">
    ${renderPs5NavBar('switch')}

    <section class="hero">
      <p class="eyebrow">ProsperoEden</p>
      <h1>Nintendo Switch manager</h1>
      <p class="muted">
        Upload your own dumped keys, firmware files, updates and mods to <strong>/data/prosperoeden</strong> through PS5Upload.
        You can also list and delete ROMs currently stored in <strong>${escapeHtml(switchGameRemoteRoot)}</strong>.
      </p>
    </section>

    <section class="grid">
      <article class="panel">
        <p class="eyebrow">Target</p>
        <h2>PS5Upload settings</h2>

        <div class="field">
          <label for="ps5Host">PS5 IP / host</label>
          <input id="ps5Host" type="text" value="${escapeHtml(currentPS5ipadr || '')}" placeholder="192.168.1.110">
        </div>

        <div class="help-box">
          PS5Upload must be running on the PS5. Files are transferred from this container to the selected folder on the PS5.
        </div>

        <p class="eyebrow">Folders</p>
        <div class="target-grid">
          <label class="target-card"><input type="radio" name="target" value="keys" checked><span>Keys</span><small>${escapeHtml(prosperoEdenFolders.keys)}</small></label>
          <label class="target-card"><input type="radio" name="target" value="firmware"><span>Firmware</span><small>${escapeHtml(prosperoEdenFolders.firmware)}</small></label>
          <label class="target-card"><input type="radio" name="target" value="updates"><span>Updates</span><small>${escapeHtml(prosperoEdenFolders.updates)}</small></label>
          <label class="target-card"><input type="radio" name="target" value="mods"><span>Mods</span><small>${escapeHtml(prosperoEdenFolders.mods)}</small></label>
        </div>
      </article>

      <div class="section-stack">
        <article class="panel">
          <p class="eyebrow">Upload</p>
          <h2>Add files to ProsperoEden</h2>

          <div class="field">
            <label for="prosperoFiles">Files</label>
            <input id="prosperoFiles" type="file" multiple>
          </div>

          <div class="field">
            <label for="prosperoFolder">Folder upload, useful for mods</label>
            <input id="prosperoFolder" type="file" webkitdirectory directory multiple>
          </div>

          <button class="btn green" id="uploadBtn" type="button">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            Upload selected files
          </button>

          <p class="muted" style="margin-top:12px">
            Max per file: ${escapeHtml(uploadLimit)}. Keys should be <strong>prod.keys</strong> or <strong>title.keys</strong>.
          </p>

          <div class="status" id="statusBox">Ready.</div>
          <div class="upload-list" id="uploadList"></div>
        </article>

        <article class="panel">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <p class="eyebrow">Remote ROMs</p>
              <h2 style="margin:0">ProsperoEden roms</h2>
              <p class="muted" style="margin:6px 0 0">${escapeHtml(switchGameRemoteRoot)}</p>
            </div>
            <button class="btn secondary" id="refreshRomsBtn" type="button">
              <i class="fa-solid fa-rotate"></i>
              Refresh roms
            </button>
          </div>

          <div class="remote-list" id="romList">
            <div class="empty">Loading rom list...</div>
          </div>
        </article>
      </div>
    </section>
  </main>

  <script>
    const statusBox = document.getElementById('statusBox');
    const uploadList = document.getElementById('uploadList');
    const uploadBtn = document.getElementById('uploadBtn');
    const filesInput = document.getElementById('prosperoFiles');
    const folderInput = document.getElementById('prosperoFolder');
    const hostInput = document.getElementById('ps5Host');
    const romList = document.getElementById('romList');
    const refreshRomsBtn = document.getElementById('refreshRomsBtn');

    function setStatus(message, type) {
      statusBox.className = 'status ' + (type || '');
      statusBox.textContent = message || '';
    }

    function escapeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }

    function requestJson(url, options) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers.Accept = 'application/json';

      return fetch(url, options).then(function (response) {
        return response.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; }
          catch (error) { data = { message: text }; }
          if (!response.ok) throw new Error(data.message || data.error || response.statusText);
          return data;
        });
      });
    }

    function selectedTarget() {
      var input = document.querySelector('input[name="target"]:checked');
      return input ? input.value : 'keys';
    }

    function addUploadItem(file, message, type) {
      var item = document.createElement('div');
      item.className = 'upload-item ' + (type || '');
      item.innerHTML = '<strong>' + escapeText(file.name || file.webkitRelativePath || 'file') + '</strong><br>' + escapeText(message || '');
      uploadList.prepend(item);
    }

    function allSelectedFiles() {
      var files = [];
      Array.prototype.slice.call(filesInput.files || []).forEach(function (file) { files.push(file); });
      Array.prototype.slice.call(folderInput.files || []).forEach(function (file) { files.push(file); });
      return files;
    }

    function uploadOne(file, index, total) {
      var target = selectedTarget();
      var host = hostInput.value.trim();
      var relativePath = file.webkitRelativePath || file.name;
      var url = '/api/ps5/prosperoeden/upload?target=' + encodeURIComponent(target);
      if (host) url += '&host=' + encodeURIComponent(host);

      setStatus('Uploading ' + (index + 1) + '/' + total + ': ' + relativePath + '...');

      return file.arrayBuffer().then(function (buffer) {
        return requestJson(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-prospero-target': target,
            'x-prospero-filename': encodeURIComponent(file.name),
            'x-prospero-relative-path': encodeURIComponent(relativePath),
            'x-ps5-host': host
          },
          body: buffer
        });
      }).then(function (data) {
        addUploadItem(file, data.message || ('Uploaded to ' + (data.remotePath || target)), 'success');
        if (target === 'roms') loadRoms();
      }).catch(function (error) {
        addUploadItem(file, error.message, 'error');
        throw error;
      });
    }

    function uploadSelected() {
      var files = allSelectedFiles();

      if (!files.length) {
        setStatus('Choose files or a folder first.', 'error');
        return;
      }

      uploadBtn.disabled = true;
      uploadList.innerHTML = '';

      var chain = Promise.resolve();
      files.forEach(function (file, index) {
        chain = chain.then(function () { return uploadOne(file, index, files.length); });
      });

      chain.then(function () {
        setStatus('Uploaded ' + files.length + ' file(s).', 'success');
        filesInput.value = '';
        folderInput.value = '';
      }).catch(function (error) {
        setStatus(error.message || 'Upload failed.', 'error');
      }).finally(function () {
        uploadBtn.disabled = false;
      });
    }

    function loadRoms() {
      var host = hostInput.value.trim();
      var url = '/api/ps5/prosperoeden/roms';
      if (host) url += '?host=' + encodeURIComponent(host);

      romList.innerHTML = '<div class="empty">Loading rom list...</div>';

      return requestJson(url).then(function (data) {
        renderRoms(data.roms || []);
      }).catch(function (error) {
        romList.innerHTML = '<div class="empty">' + escapeText(error.message) + '</div>';
      });
    }

    function renderRoms(roms) {
      romList.innerHTML = '';

      if (!roms.length) {
        romList.innerHTML = '<div class="empty">No roms found in ProsperoEden roms folder.</div>';
        return;
      }

      roms.forEach(function (rom) {
        var item = document.createElement('div');
        item.className = 'remote-item';
        item.innerHTML =
          '<div>' +
            '<strong>' + escapeText(rom.name) + '</strong>' +
            '<div class="muted">' + escapeText(rom.sizeLabel || '') + ' · ' + escapeText(rom.path || '') + '</div>' +
          '</div>' +
          '<div class="remote-actions">' +
            '<button class="btn red" type="button" data-action="delete-rom"><i class="fa-solid fa-trash"></i> Delete</button>' +
          '</div>';

        item.querySelector('[data-action="delete-rom"]').addEventListener('click', function () {
          deleteRom(rom);
        });

        romList.appendChild(item);
      });
    }

    function deleteRom(rom) {
      var host = hostInput.value.trim();

      if (!confirm('Delete "' + rom.path + '" from ProsperoEden roms?')) return;

      setStatus('Deleting ' + rom.name + ' from ProsperoEden roms...');

      requestJson('/api/ps5/prosperoeden/roms/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host, path: rom.path })
      }).then(function (data) {
        setStatus(data.message || 'Rom deleted.', 'success');
        return loadRoms();
      }).catch(function (error) {
        setStatus(error.message, 'error');
      });
    }

    uploadBtn.addEventListener('click', uploadSelected);
    refreshRomsBtn.addEventListener('click', loadRoms);
    loadRoms();
  </script>
</body>
</html>`;
}

function renderPs5sx2Page() {
  const uploadLimit = ps5sx2UploadLimit;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PS5SX2 Manager - PKG Sender</title>
  <link rel="stylesheet" href="/css/fontawesome.min.css">
  <link rel="stylesheet" href="/css/solid.min.css">
  <style>
    ${renderPs5StandaloneNavCss()}

    :root {
      --bg: #07111f;
      --panel: rgba(15, 23, 42, 0.86);
      --panel-2: rgba(30, 41, 59, 0.64);
      --border: rgba(255,255,255,0.14);
      --text: #eef3ff;
      --muted: #a9b8d4;
      --blue: #3b82f6;
      --green: #22c55e;
      --red: #ef4444;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, Segoe UI, Roboto, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(59,130,246,.30), transparent 34rem),
        radial-gradient(circle at bottom right, rgba(168,85,247,.18), transparent 38rem),
        var(--bg);
    }

    .page { width: min(1360px, calc(100vw - 48px)); margin: 0 auto; padding: 18px 0 60px; }
    .hero, .panel { border: 1px solid var(--border); background: var(--panel); border-radius: 26px; box-shadow: 0 24px 80px rgba(0,0,0,.32); backdrop-filter: blur(18px); }
    .hero { padding: 28px; margin-bottom: 18px; }
    .eyebrow { margin: 0 0 8px; color: #93c5fd; text-transform: uppercase; letter-spacing: .12em; font-size: .78rem; font-weight: 1000; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 10px; font-size: clamp(2rem, 5vw, 4rem); line-height: .95; letter-spacing: -.07em; }
    .muted { color: var(--muted); line-height: 1.55; }
    .grid { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.4fr); gap: 18px; align-items: start; }
    .panel { padding: 20px; min-width: 0; }
    .field { display: grid; gap: 7px; margin-bottom: 14px; }
    label { color: var(--muted); font-size: .85rem; font-weight: 800; }
    input[type="text"], input[type="file"] { width: 100%; color: var(--text); background: rgba(2, 6, 23, .6); border: 1px solid var(--border); border-radius: 14px; padding: 12px 13px; outline: none; }
    .btn { appearance: none; border: 0; cursor: pointer; border-radius: 14px; padding: 11px 14px; color: #fff; background: linear-gradient(135deg, #2563eb, #0ea5e9); font-weight: 950; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; white-space: nowrap; }
    .btn.green { background: linear-gradient(135deg, #16a34a, #22c55e); }
    .btn.red { background: linear-gradient(135deg, #dc2626, #ef4444); }
    .btn.secondary { background: rgba(255,255,255,.10); border: 1px solid var(--border); }
    .btn:disabled { opacity: .55; cursor: not-allowed; }
    .status { min-height: 44px; margin-top: 14px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
    .status.success { color: #bbf7d0; border-color: rgba(34,197,94,.35); }
    .status.error { color: #fecaca; border-color: rgba(239,68,68,.40); }
    .help-box { padding: 14px; margin: 14px 0; color: #dbeafe; border: 1px solid rgba(125,211,252,.25); border-radius: 16px; background: rgba(14,165,233,.08); line-height: 1.55; }
    .upload-list, .remote-list { display: grid; gap: 10px; margin-top: 14px; }
    .upload-item, .remote-item { padding: 12px; border: 1px solid var(--border); background: var(--panel-2); border-radius: 14px; color: var(--muted); overflow-wrap: anywhere; }
    .upload-item.success { border-color: rgba(34,197,94,.35); color: #bbf7d0; }
    .upload-item.error { border-color: rgba(239,68,68,.40); color: #fecaca; }
    .remote-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; }
    .remote-item strong { color: var(--text); overflow-wrap: anywhere; }
    .remote-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .empty { padding: 22px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 18px; }
    .section-stack { display: grid; gap: 18px; }

    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .remote-item { grid-template-columns: 1fr; } .remote-actions { justify-content: flex-start; } }
  </style>
</head>
<body>
  <main class="page">
    ${renderPs5NavBar('ps5sx2')}

    <section class="hero">
      <p class="eyebrow">PS5SX2 / PCSX2</p>
      <h1>PS5SX2 manager</h1>
      <p class="muted">
        Upload your own legally dumped PS2 BIOS files to <strong>${escapeHtml(pcsx2BiosRemoteDir)}</strong>,
        and manage PS2 games stored in <strong>${escapeHtml(ps2GameRemoteRoot)}</strong> on the PS5.
      </p>
    </section>

    <section class="grid">
      <article class="panel">
        <p class="eyebrow">Target</p>
        <h2>Deploy settings</h2>

        <div class="field">
          <label for="ps5Host">PS5 IP / host</label>
          <input id="ps5Host" type="text" value="${escapeHtml(currentPS5ipadr || '')}" placeholder="192.168.1.110">
        </div>

        <div class="field">
          <label>Remote BIOS folder</label>
          <input type="text" value="${escapeHtml(pcsx2BiosRemoteDir)}" readonly>
        </div>

        <div class="field">
          <label>Remote games folder</label>
          <input type="text" value="${escapeHtml(ps2GameRemoteRoot)}" readonly>
        </div>

        <div class="help-box">
          PS5Upload must be running on the PS5. Use this page to upload BIOS files and delete PS2 games from the PS5SX2 games folder.
        </div>

        <p class="muted">
          Accepted BIOS/support extensions: <strong>${escapeHtml(pcsx2BiosExtensions.join(', '))}</strong>. Extensionless support files are also allowed.
        </p>
      </article>

      <div class="section-stack">
        <article class="panel">
          <p class="eyebrow">Upload</p>
          <h2>Add BIOS files</h2>

          <div class="field">
            <label for="biosFiles">BIOS files</label>
            <input id="biosFiles" type="file" multiple>
          </div>

          <div class="field">
            <label for="biosFolder">Folder upload, optional</label>
            <input id="biosFolder" type="file" webkitdirectory directory multiple>
          </div>

          <button class="btn green" id="uploadBtn" type="button">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            Upload BIOS files
          </button>

          <p class="muted" style="margin-top:12px">
            Max per file: ${escapeHtml(uploadLimit)}.
          </p>

          <div class="status" id="statusBox">Ready.</div>
          <div class="upload-list" id="uploadList"></div>
        </article>

        <article class="panel">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <p class="eyebrow">Remote games</p>
              <h2 style="margin:0">PCSX2 games</h2>
              <p class="muted" style="margin:6px 0 0">${escapeHtml(ps2GameRemoteRoot)}</p>
            </div>
            <button class="btn secondary" id="refreshGamesBtn" type="button">
              <i class="fa-solid fa-rotate"></i>
              Refresh games
            </button>
          </div>

          <div class="remote-list" id="gameList">
            <div class="empty">Loading game list...</div>
          </div>
        </article>
      </div>
    </section>
  </main>

  <script>
    const statusBox = document.getElementById('statusBox');
    const uploadList = document.getElementById('uploadList');
    const uploadBtn = document.getElementById('uploadBtn');
    const filesInput = document.getElementById('biosFiles');
    const folderInput = document.getElementById('biosFolder');
    const hostInput = document.getElementById('ps5Host');
    const gameList = document.getElementById('gameList');
    const refreshGamesBtn = document.getElementById('refreshGamesBtn');

    function setStatus(message, type) {
      statusBox.className = 'status ' + (type || '');
      statusBox.textContent = message || '';
    }

    function escapeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }

    function requestJson(url, options) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers.Accept = 'application/json';

      return fetch(url, options).then(function (response) {
        return response.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; }
          catch (error) { data = { message: text }; }
          if (!response.ok) throw new Error(data.message || data.error || response.statusText);
          return data;
        });
      });
    }

    function addUploadItem(file, message, type) {
      var item = document.createElement('div');
      item.className = 'upload-item ' + (type || '');
      item.innerHTML = '<strong>' + escapeText(file.webkitRelativePath || file.name || 'file') + '</strong><br>' + escapeText(message || '');
      uploadList.prepend(item);
    }

    function allSelectedFiles() {
      var files = [];
      Array.prototype.slice.call(filesInput.files || []).forEach(function (file) { files.push(file); });
      Array.prototype.slice.call(folderInput.files || []).forEach(function (file) { files.push(file); });
      return files;
    }

    function uploadOne(file, index, total) {
      var host = hostInput.value.trim();
      var relativePath = file.webkitRelativePath || file.name;
      var url = '/api/ps5/ps5sx2/bios/upload';
      if (host) url += '?host=' + encodeURIComponent(host);

      setStatus('Uploading ' + (index + 1) + '/' + total + ': ' + relativePath + '...');

      return file.arrayBuffer().then(function (buffer) {
        return requestJson(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-ps5sx2-filename': encodeURIComponent(file.name),
            'x-ps5sx2-relative-path': encodeURIComponent(relativePath),
            'x-ps5-host': host
          },
          body: buffer
        });
      }).then(function (data) {
        addUploadItem(file, data.message || ('Uploaded to ' + (data.remotePath || 'BIOS folder')), 'success');
      }).catch(function (error) {
        addUploadItem(file, error.message, 'error');
        throw error;
      });
    }

    function uploadSelected() {
      var files = allSelectedFiles();

      if (!files.length) {
        setStatus('Choose BIOS files or a folder first.', 'error');
        return;
      }

      uploadBtn.disabled = true;
      uploadList.innerHTML = '';

      var chain = Promise.resolve();
      files.forEach(function (file, index) {
        chain = chain.then(function () { return uploadOne(file, index, files.length); });
      });

      chain.then(function () {
        setStatus('Uploaded ' + files.length + ' BIOS file(s).', 'success');
        filesInput.value = '';
        folderInput.value = '';
      }).catch(function (error) {
        setStatus(error.message || 'Upload failed.', 'error');
      }).finally(function () {
        uploadBtn.disabled = false;
      });
    }

    function loadGames() {
      var host = hostInput.value.trim();
      var url = '/api/ps5/ps5sx2/games';
      if (host) url += '?host=' + encodeURIComponent(host);

      gameList.innerHTML = '<div class="empty">Loading game list...</div>';

      return requestJson(url).then(function (data) {
        renderGames(data.games || []);
      }).catch(function (error) {
        gameList.innerHTML = '<div class="empty">' + escapeText(error.message) + '</div>';
      });
    }

    function renderGames(games) {
      gameList.innerHTML = '';

      if (!games.length) {
        gameList.innerHTML = '<div class="empty">No PS2 games found in PCSX2 games folder.</div>';
        return;
      }

      games.forEach(function (game) {
        var item = document.createElement('div');
        item.className = 'remote-item';
        item.innerHTML =
          '<div>' +
            '<strong>' + escapeText(game.name) + '</strong>' +
            '<div class="muted">' + escapeText(game.sizeLabel || '') + ' · ' + escapeText(game.path || '') + '</div>' +
          '</div>' +
          '<div class="remote-actions">' +
            '<button class="btn red" type="button" data-action="delete-game"><i class="fa-solid fa-trash"></i> Delete</button>' +
          '</div>';

        item.querySelector('[data-action="delete-game"]').addEventListener('click', function () {
          deleteGame(game);
        });

        gameList.appendChild(item);
      });
    }

    function deleteGame(game) {
      var host = hostInput.value.trim();

      if (!confirm('Delete "' + game.path + '" from PCSX2 games?')) return;

      setStatus('Deleting ' + game.name + ' from PCSX2 games...');

      requestJson('/api/ps5/ps5sx2/games/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host, path: game.path })
      }).then(function (data) {
        setStatus(data.message || 'Game deleted.', 'success');
        return loadGames();
      }).catch(function (error) {
        setStatus(error.message, 'error');
      });
    }

    uploadBtn.addEventListener('click', uploadSelected);
    refreshGamesBtn.addEventListener('click', loadGames);
    loadGames();
  </script>
</body>
</html>`;
}


function renderPs5LinksPage() {
  const escapedHost = escapeHtml(currentPS5ipadr || '');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PS5 Links - PKG Sender</title>
  <link rel="stylesheet" href="/css/fontawesome.min.css">
  <link rel="stylesheet" href="/css/solid.min.css">
  <style>
    ${renderPs5StandaloneNavCss()}

    :root {
      --bg: #07111f;
      --panel: rgba(15, 23, 42, 0.86);
      --panel-2: rgba(30, 41, 59, 0.64);
      --border: rgba(255,255,255,0.14);
      --text: #eef3ff;
      --muted: #a9b8d4;
    }

    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: Inter, Segoe UI, Roboto, Arial, sans-serif; color: var(--text); background: radial-gradient(circle at top left, rgba(59,130,246,.32), transparent 34rem), radial-gradient(circle at bottom right, rgba(34,197,94,.18), transparent 38rem), var(--bg); }
    .page { width: min(1220px, calc(100vw - 48px)); margin: 0 auto; padding: 18px 0 60px; }
    .hero, .panel { border: 1px solid var(--border); background: var(--panel); border-radius: 26px; box-shadow: 0 24px 80px rgba(0,0,0,.32); backdrop-filter: blur(18px); }
    .hero { padding: 28px; margin-bottom: 18px; }
    .eyebrow { margin: 0 0 8px; color: #93c5fd; text-transform: uppercase; letter-spacing: .12em; font-size: .78rem; font-weight: 1000; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 10px; font-size: clamp(2rem, 5vw, 4rem); line-height: .95; letter-spacing: -.07em; }
    .muted { color: var(--muted); line-height: 1.55; }
    .panel { padding: 22px; }
    .field { display: grid; gap: 7px; margin-bottom: 18px; }
    label { color: var(--muted); font-size: .85rem; font-weight: 800; }
    input[type="text"] { width: 100%; color: var(--text); background: rgba(2, 6, 23, .6); border: 1px solid var(--border); border-radius: 14px; padding: 12px 13px; outline: none; }
    .links-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
    .link-card { display: grid; gap: 10px; min-height: 190px; padding: 18px; color: var(--text); text-decoration: none; border: 1px solid var(--border); border-radius: 22px; background: var(--panel-2); transition: transform .18s ease, border-color .18s ease, background .18s ease; }
    .link-card:hover { transform: translateY(-3px); border-color: rgba(125,211,252,.42); background: rgba(30,41,59,.86); color: var(--text); }
    .link-icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 16px; background: rgba(59,130,246,.22); color: #bfdbfe; font-size: 1.25rem; }
    .link-card strong { font-size: 1.15rem; }
    .link-card small { color: var(--muted); overflow-wrap: anywhere; line-height: 1.45; }
    .status { min-height: 44px; margin-top: 14px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 900px) { .links-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="page">
    ${renderPs5NavBar('links')}

    <section class="hero">
      <p class="eyebrow">PS5</p>
      <h1>PS5 links</h1>
      <p class="muted">Open web interfaces running directly on the PS5. The links update when you change the PS5 IP / host.</p>
    </section>

    <section class="panel">
      <div class="field">
        <label for="ps5Host">PS5 IP / host</label>
        <input id="ps5Host" type="text" value="${escapedHost}" placeholder="192.168.1.110">
      </div>

      <div class="links-grid">
        <a class="link-card" id="pldmgrLink" href="#" target="_blank" rel="noopener"><span class="link-icon"><i class="fa-solid fa-list-check"></i></span><strong>PLDMGR</strong><small>Payload Manager web UI on port 8084.</small></a>
        <a class="link-card" id="retroarchLink" href="#" target="_blank" rel="noopener"><span class="link-icon"><i class="fa-solid fa-gamepad"></i></span><strong>RetroArch WebUI</strong><small>RetroArch remote/web interface on port 6769.</small></a>
        <a class="link-card" id="ps5FileWebuiLink" href="#" target="_blank" rel="noopener"><span class="link-icon"><i class="fa-solid fa-folder-open"></i></span><strong>PS5 File WebUI</strong><small>PS5 file web UI manager on port 8888.</small></a>
        <a class="link-card" href="/ps5upload"><span class="link-icon"><i class="fa-solid fa-upload"></i></span><strong>PS5Upload</strong><small>Integrated PS5Upload web UI through PKG Sender.</small></a>
      </div>

      <div class="status" id="statusBox">Enter PS5 IP and open a link.</div>
    </section>
  </main>

  <script>
    (function () {
      'use strict';

      var hostInput = document.getElementById('ps5Host');
      var statusBox = document.getElementById('statusBox');
      var pldmgrLink = document.getElementById('pldmgrLink');
      var retroarchLink = document.getElementById('retroarchLink');
      var ps5FileWebuiLink = document.getElementById('ps5FileWebuiLink');

      function cleanHost(value) {
        var host = String(value || '').trim();
        var protocolIndex = host.indexOf('://');

        if (protocolIndex >= 0) {
          host = host.slice(protocolIndex + 3);
        }

        var slashIndex = host.indexOf('/');

        if (slashIndex >= 0) {
          host = host.slice(0, slashIndex);
        }

        var colonIndex = host.lastIndexOf(':');

        if (colonIndex > 0) {
          host = host.slice(0, colonIndex);
        }

        return host.trim();
      }

      function setLink(anchor, host, port) {
        if (!anchor) return;

        if (!host) {
          anchor.href = '#';
          anchor.title = 'Enter your PS5 IP first';
          return;
        }

        anchor.href = 'http://' + host + ':' + port + '/';
        anchor.title = anchor.href;
      }

      function updateLinks() {
        var host = cleanHost(hostInput ? hostInput.value : '');

        setLink(pldmgrLink, host, 8084);
        setLink(retroarchLink, host, 6769);
        setLink(ps5FileWebuiLink, host, 8888);

        if (statusBox) {
          statusBox.textContent = host ? ('Links are using PS5 host: ' + host) : 'Enter PS5 IP and open a link.';
        }
      }

      if (hostInput) {
        hostInput.addEventListener('input', updateLinks);
        hostInput.addEventListener('change', updateLinks);
      }

      updateLinks();
    }());
  </script>
</body>
</html>`;
}


function renderPs5PayloadPage() {
  const payloadLimit = process.env.PS5_PAYLOAD_LIMIT || '200mb';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PS5 Payload Manager</title>
  <link rel="stylesheet" href="/css/fontawesome.min.css">
  <link rel="stylesheet" href="/css/solid.min.css">
  <style>
    ${renderPs5StandaloneNavCss()}

    :root {
      --bg: #07111f;
      --panel: rgba(15, 23, 42, 0.86);
      --panel-2: rgba(30, 41, 59, 0.64);
      --border: rgba(255,255,255,0.14);
      --text: #eef3ff;
      --muted: #a9b8d4;
      --blue: #3b82f6;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #f59e0b;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, Segoe UI, Roboto, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(59,130,246,.32), transparent 34rem),
        radial-gradient(circle at bottom right, rgba(34,197,94,.18), transparent 38rem),
        var(--bg);
    }

    .page {
      width: min(1360px, calc(100vw - 48px));
      margin: 0 auto;
      padding: 18px 0 60px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }

    .back {
      color: var(--text);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,.06);
      border-radius: 999px;
      font-weight: 800;
    }

    .hero,
    .panel {
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 26px;
      box-shadow: 0 24px 80px rgba(0,0,0,.32);
      backdrop-filter: blur(18px);
    }

    .hero {
      padding: 28px;
      margin-bottom: 18px;
    }

    .eyebrow {
      margin: 0 0 8px;
      color: #93c5fd;
      text-transform: uppercase;
      letter-spacing: .12em;
      font-size: .78rem;
      font-weight: 1000;
    }

    h1, h2, h3, p { margin-top: 0; }

    h1 {
      margin-bottom: 10px;
      font-size: clamp(2rem, 5vw, 4rem);
      line-height: .95;
      letter-spacing: -.07em;
    }

    .muted {
      color: var(--muted);
      line-height: 1.55;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, .95fr) minmax(0, 1.45fr);
      gap: 18px;
    }

    .panel {
      padding: 20px;
      min-width: 0;
    }

    .field {
      display: grid;
      gap: 7px;
      margin-bottom: 14px;
    }

    label {
      color: var(--muted);
      font-size: .85rem;
      font-weight: 800;
    }

    input[type="text"],
    input[type="number"],
    input[type="file"] {
      width: 100%;
      color: var(--text);
      background: rgba(2, 6, 23, .6);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 13px;
      outline: none;
    }

    .btn {
      appearance: none;
      border: 0;
      cursor: pointer;
      border-radius: 14px;
      padding: 11px 14px;
      color: #fff;
      background: linear-gradient(135deg, #2563eb, #0ea5e9);
      font-weight: 950;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
      white-space: nowrap;
    }

    .btn.secondary { background: rgba(255,255,255,.10); border: 1px solid var(--border); }
    .btn.green { background: linear-gradient(135deg, #16a34a, #22c55e); }
    .btn.red { background: linear-gradient(135deg, #dc2626, #ef4444); }
    .btn:disabled { opacity: .55; cursor: not-allowed; }

    .payload-list {
      display: grid;
      gap: 12px;
    }

    .payload-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 14px;
      border: 1px solid var(--border);
      background: var(--panel-2);
      border-radius: 18px;
    }

    .payload-name {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .payload-name strong {
      overflow-wrap: anywhere;
    }

    .payload-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .status {
      min-height: 44px;
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,.06);
      color: var(--muted);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .status.success { color: #bbf7d0; border-color: rgba(34,197,94,.35); }
    .status.error { color: #fecaca; border-color: rgba(239,68,68,.40); }

    .empty {
      padding: 22px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--border);
      border-radius: 18px;
    }

    .checkrow {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      margin: 10px 0 14px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: rgba(255,255,255,.05);
      color: var(--muted);
      line-height: 1.45;
    }

    .checkrow input {
      width: 18px;
      height: 18px;
      margin-top: 2px;
    }

    .help-box {
      padding: 14px;
      margin: 14px 0;
      color: #dbeafe;
      border: 1px solid rgba(125, 211, 252, 0.25);
      border-radius: 16px;
      background: rgba(14, 165, 233, 0.08);
      line-height: 1.55;
    }

    @media (max-width: 880px) {
      .grid { grid-template-columns: 1fr; }
      .payload-item { grid-template-columns: 1fr; }
      .payload-actions { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <main class="page">
${renderPs5NavBar('payloads')}

    <section class="hero">
      <p class="eyebrow">PS5</p>
      <h1>Payload / ELF manager</h1>
      <p class="muted">
        Upload, list, delete, download, and send PS5 payload files.
        New uploads can also be copied into <strong>Payload Manager</strong> on port <strong>${ps5PayloadManagerPort}</strong>,
        so they appear at <strong>http://${escapeHtml(currentPS5ipadr || 'PS5-IP')}:${ps5PayloadManagerPort}/</strong>.
      </p>
    </section>

    <section class="grid">
      <article class="panel">
        <p class="eyebrow">Target</p>
        <h2>Send settings</h2>

        <div class="field">
          <label for="ps5Host">PS5 IP / host</label>
          <input id="ps5Host" type="text" value="${escapeHtml(currentPS5ipadr || '')}" placeholder="192.168.1.110">
        </div>

        <div class="field">
          <label for="ps5Port">ELF loader port</label>
          <input id="ps5Port" type="number" value="${ps5ElfPort}" min="1" max="65535">
        </div>

        <p class="muted">
          Max upload size: ${escapeHtml(payloadLimit)}.
          The payload is sent as raw bytes over TCP to the configured host and port.
        </p>

        <div class="help-box">
          To send payloads from this page, the PS5 must already have <strong>elfldr / ELF loader</strong>
          running and listening on port <strong>9021</strong>. If you are using your current ps5upload setup,
          load/enable elfldr first, then use this page to send extra <strong>.elf</strong>, <strong>.bin</strong>,
          or <strong>.payload</strong> files.
        </div>

        <div class="help-box">
          <strong>Payload Manager integration:</strong> sending to port 9021 executes the payload in memory only.
          To make the payload show in <strong>http://${escapeHtml(currentPS5ipadr || 'PS5-IP')}:${ps5PayloadManagerPort}/</strong>,
          this page can also copy it to <strong>${escapeHtml(ps5PayloadManagerRemoteDir)}/&lt;payload&gt;/</strong>
          using PS5Upload filesystem access.
        </div>

        <div class="help-box">
          <strong>Quick web UIs:</strong> open tools running directly on the PS5.
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
            <a class="btn secondary" id="pldmgrLink" href="${currentPS5ipadr ? `http://${escapeHtml(currentPS5ipadr)}:${ps5PayloadManagerPort}/` : '#'}" target="_blank" rel="noopener">
              <i class="fa-solid fa-up-right-from-square"></i>
              Open PLDMGR
            </a>
            <a class="btn secondary" id="retroarchLink" href="${currentPS5ipadr ? `http://${escapeHtml(currentPS5ipadr)}:6769/` : '#'}" target="_blank" rel="noopener">
              <i class="fa-solid fa-up-right-from-square"></i>
              Open RetroArch WebUI
            </a>
            <a class="btn secondary" id="ps5FileWebuiLink" href="${currentPS5ipadr ? `http://${escapeHtml(currentPS5ipadr)}:8888/` : '#'}" target="_blank" rel="noopener">
              <i class="fa-solid fa-up-right-from-square"></i>
              Open PS5 File WebUI
            </a>
          </div>
        </div>

        <label class="checkrow" for="syncPayloadManager">
          <input id="syncPayloadManager" type="checkbox" ${ps5PayloadManagerAutoSync ? 'checked' : ''}>
          <span>
            Sync new uploads to Payload Manager ${ps5PayloadManagerPort} automatically.
            You can also sync any saved payload with the <strong>Sync Manager</strong> button.
          </span>
        </label>

        <hr style="border:0;border-top:1px solid rgba(255,255,255,.12);margin:18px 0">

        <p class="eyebrow">Upload</p>
        <h2>Add payload</h2>

        <div class="field">
          <label for="payloadFile">Payload file</label>
          <input id="payloadFile" type="file" accept=".elf,.bin,.payload">
        </div>

        <button class="btn green" id="uploadBtn" type="button">
          <i class="fa-solid fa-upload"></i>
          Upload payload
        </button>

        <div class="status" id="statusBox">Ready.</div>
      </article>

      <article class="panel">
        <div class="topbar" style="margin-bottom:12px">
          <div>
            <p class="eyebrow">Library</p>
            <h2 style="margin:0">Saved payloads</h2>
          </div>
          <button class="btn secondary" id="refreshBtn" type="button">
            <i class="fa-solid fa-rotate"></i>
            Refresh
          </button>
        </div>

        <div class="payload-list" id="payloadList"></div>
      </article>
    </section>
  </main>

  <script>
    const listEl = document.getElementById('payloadList');
    const statusBox = document.getElementById('statusBox');
    const uploadBtn = document.getElementById('uploadBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const fileInput = document.getElementById('payloadFile');
    const hostInput = document.getElementById('ps5Host');
    const portInput = document.getElementById('ps5Port');
    const syncPayloadManagerInput = document.getElementById('syncPayloadManager');
    const pldmgrLink = document.getElementById('pldmgrLink');
    const retroarchLink = document.getElementById('retroarchLink');
    const ps5FileWebuiLink = document.getElementById('ps5FileWebuiLink');

    function getCleanPs5Host() {
      var host = hostInput && hostInput.value ? hostInput.value.trim() : '';

      if (!host) {
        return '';
      }

      var cleanHost = host;
      var protocolIndex = cleanHost.indexOf('://');
      if (protocolIndex >= 0) {
        cleanHost = cleanHost.slice(protocolIndex + 3);
      }

      var slashIndex = cleanHost.indexOf('/');
      if (slashIndex >= 0) {
        cleanHost = cleanHost.slice(0, slashIndex);
      }

      var colonIndex = cleanHost.lastIndexOf(':');
      if (colonIndex > 0) {
        cleanHost = cleanHost.slice(0, colonIndex);
      }

      return cleanHost;
    }

    function updatePs5WebUiLinks() {
      var cleanHost = getCleanPs5Host();

      if (!cleanHost) {
        if (pldmgrLink) {
          pldmgrLink.href = '#';
          pldmgrLink.title = 'Enter your PS5 IP first';
        }

        if (retroarchLink) {
          retroarchLink.href = '#';
          retroarchLink.title = 'Enter your PS5 IP first';
        }

        if (ps5FileWebuiLink) {
          ps5FileWebuiLink.href = '#';
          ps5FileWebuiLink.title = 'Enter your PS5 IP first';
        }

        return;
      }

      if (pldmgrLink) {
        pldmgrLink.href = 'http://' + cleanHost + ':${ps5PayloadManagerPort}/';
        pldmgrLink.title = pldmgrLink.href;
      }

      if (retroarchLink) {
        retroarchLink.href = 'http://' + cleanHost + ':6769/';
        retroarchLink.title = retroarchLink.href;
      }

      if (ps5FileWebuiLink) {
        ps5FileWebuiLink.href = 'http://' + cleanHost + ':8888/';
        ps5FileWebuiLink.title = ps5FileWebuiLink.href;
      }
    }

    function setStatus(message, type) {
      statusBox.className = 'status ' + (type || '');
      statusBox.textContent = message || '';
    }

    function escapeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char];
      });
    }

    function requestJson(url, options) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers.Accept = 'application/json';

      return fetch(url, options).then(function (response) {
        return response.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; }
          catch (error) { data = { message: text }; }

          if (!response.ok) {
            throw new Error(data.message || data.error || response.statusText);
          }

          return data;
        });
      });
    }

    function payloadActionUrl(payload, action) {
      return '/api/ps5/payloads/' + encodeURIComponent(payload.name) + '/' + action;
    }

    function renderPayloads(payloads) {
      listEl.innerHTML = '';

      if (!payloads.length) {
        listEl.innerHTML = '<div class="empty">No payload files uploaded yet.</div>';
        return;
      }

      payloads.forEach(function (payload) {
        var item = document.createElement('div');
        item.className = 'payload-item';

        item.innerHTML =
          '<div class="payload-name">' +
            '<strong>' + escapeText(payload.name) + '</strong>' +
            '<small class="muted">' + escapeText(payload.sizeLabel) + ' · Modified ' + escapeText(new Date(payload.modifiedAt).toLocaleString()) + '</small>' +
          '</div>' +
          '<div class="payload-actions">' +
            '<a class="btn secondary" href="' + escapeText(payload.downloadUrl) + '" download><i class="fa-solid fa-download"></i> Download</a>' +
            '<button class="btn green" type="button" data-action="send"><i class="fa-solid fa-paper-plane"></i> Send</button>' +
            '<button class="btn secondary" type="button" data-action="sync"><i class="fa-solid fa-list-check"></i> Sync Manager</button>' +
            '<button class="btn red" type="button" data-action="delete"><i class="fa-solid fa-trash"></i> Delete</button>' +
          '</div>';

        item.querySelector('[data-action="send"]').addEventListener('click', function () {
          sendPayload(payload);
        });

        item.querySelector('[data-action="sync"]').addEventListener('click', function () {
          syncPayloadToManager(payload);
        });

        item.querySelector('[data-action="delete"]').addEventListener('click', function () {
          deletePayload(payload);
        });

        listEl.appendChild(item);
      });
    }

    function loadPayloads() {
      setStatus('Loading payload list...');
      return requestJson('/api/ps5/payloads')
        .then(function (data) {
          renderPayloads(data.payloads || []);
          setStatus('Ready.');
        })
        .catch(function (error) {
          setStatus(error.message, 'error');
        });
    }

    function syncPayloadToManager(payload) {
      var host = hostInput.value.trim();

      if (!host) {
        setStatus('Enter your PS5 IP first.', 'error');
        return Promise.reject(new Error('Missing PS5 IP'));
      }

      setStatus('Syncing ' + payload.name + ' to Payload Manager on ' + host + ':${ps5PayloadManagerPort}...');

      return requestJson(payloadActionUrl(payload, 'sync-manager'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host })
      }).then(function (data) {
        setStatus((data.message || 'Synced to Payload Manager.') + '\\nRemote path: ' + (data.remotePath || '') + '\\nOpen: ' + (data.managerUrl || ''), 'success');
        return data;
      }).catch(function (error) {
        setStatus(error.message, 'error');
        throw error;
      });
    }

    function uploadPayload() {
      var file = fileInput.files && fileInput.files[0];

      if (!file) {
        setStatus('Choose a .elf, .bin, or .payload file first.', 'error');
        return;
      }

      uploadBtn.disabled = true;
      setStatus('Uploading ' + file.name + '...');

      file.arrayBuffer()
        .then(function (buffer) {
          return requestJson('/api/ps5/payloads/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-payload-filename': encodeURIComponent(file.name)
            },
            body: buffer
          });
        })
        .then(function (data) {
          setStatus(data.message || 'Payload uploaded.', 'success');
          fileInput.value = '';

          if (syncPayloadManagerInput && syncPayloadManagerInput.checked && data.payload) {
            return syncPayloadToManager(data.payload).then(function () {
              return loadPayloads();
            }).catch(function () {
              return loadPayloads();
            });
          }

          return loadPayloads();
        })
        .catch(function (error) {
          setStatus(error.message, 'error');
        })
        .finally(function () {
          uploadBtn.disabled = false;
        });
    }

    function sendPayload(payload) {
      var host = hostInput.value.trim();
      var port = portInput.value.trim();

      setStatus('Sending ' + payload.name + ' to ' + host + ':' + port + '...');

      requestJson(payloadActionUrl(payload, 'send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host, port: port })
      }).then(function (data) {
        setStatus((data.message || 'Payload sent.') + '\\nBytes: ' + (data.bytes || 0), 'success');
      }).catch(function (error) {
        setStatus(error.message, 'error');
      });
    }

    function deletePayload(payload) {
      if (!confirm('Delete payload "' + payload.name + '"?')) return;

      setStatus('Deleting ' + payload.name + '...');

      requestJson('/api/ps5/payloads/' + encodeURIComponent(payload.name), {
        method: 'DELETE'
      }).then(function (data) {
        setStatus(data.message || 'Payload deleted.', 'success');
        return loadPayloads();
      }).catch(function (error) {
        setStatus(error.message, 'error');
      });
    }

    uploadBtn.addEventListener('click', uploadPayload);
    refreshBtn.addEventListener('click', loadPayloads);
    if (hostInput) {
      hostInput.addEventListener('input', updatePs5WebUiLinks);
      hostInput.addEventListener('change', updatePs5WebUiLinks);
    }
    updatePs5WebUiLinks();
    loadPayloads();
  </script>
</body>
</html>`;
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
        <span style="color:rgba(255,255,255,.24)">•</span>
        <a class="small-link" href="/ps5/payloads">PS5 Payload / ELF manager</a>
        <span style="color:rgba(255,255,255,.24)">•</span>
        <a class="small-link" href="/ps5/links">PS5 links</a>
        <span style="color:rgba(255,255,255,.24)">•</span>
        <a class="small-link" href="/ps5/homebrew">PS5 Homebrew apps</a>
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
  <title>PS5 Tools - PKG Sender</title>
  <link rel="stylesheet" href="/css/fontawesome.min.css">
  <link rel="stylesheet" href="/css/solid.min.css">
  <style>
    ${renderPs5StandaloneNavCss()}

    :root {
      --bg: #07111f;
      --panel: rgba(15, 23, 42, 0.86);
      --panel-2: rgba(30, 41, 59, 0.64);
      --border: rgba(255,255,255,0.14);
      --text: #eef3ff;
      --muted: #a9b8d4;
      --blue: #3b82f6;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #f59e0b;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, Segoe UI, Roboto, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(59,130,246,.32), transparent 34rem),
        radial-gradient(circle at bottom right, rgba(34,197,94,.18), transparent 38rem),
        var(--bg);
    }

    .page {
      width: min(1360px, calc(100vw - 48px));
      margin: 0 auto;
      padding: 18px 0 60px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .back,
    .nav-pill {
      color: var(--text);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 42px;
      padding: 10px 14px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,.06);
      border-radius: 999px;
      font-weight: 900;
      white-space: nowrap;
    }

    .nav-pill.active {
      background: linear-gradient(135deg, #2563eb, #0ea5e9);
      border-color: rgba(125, 211, 252, .5);
    }

    .hero,
    .panel {
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 26px;
      box-shadow: 0 24px 80px rgba(0,0,0,.32);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .hero {
      padding: 28px;
      margin-bottom: 18px;
    }

    .eyebrow {
      margin: 0 0 8px;
      color: #93c5fd;
      text-transform: uppercase;
      letter-spacing: .12em;
      font-size: .78rem;
      font-weight: 1000;
    }

    h1, h2, h3, p { margin-top: 0; }

    h1 {
      margin-bottom: 10px;
      font-size: clamp(2rem, 5vw, 4rem);
      line-height: .95;
      letter-spacing: -.07em;
    }

    h2 { margin-bottom: 14px; }

    .muted,
    p {
      color: var(--muted);
      line-height: 1.55;
    }

    .tools-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      align-items: stretch;
    }

    .panel {
      padding: 20px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .panel.equal-panel { min-height: 100%; }

    .field {
      display: grid;
      gap: 7px;
      margin-bottom: 10px;
    }

    label,
    .label {
      color: var(--muted);
      font-size: .85rem;
      font-weight: 850;
    }

    input[type="text"],
    input[type="number"],
    input[type="file"],
    input:not([type]) {
      width: 100%;
      min-height: 46px;
      color: var(--text);
      background: rgba(2, 6, 23, .6);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 13px;
      outline: none;
    }

    input:focus {
      border-color: rgba(125, 211, 252, .75);
      box-shadow: 0 0 0 4px rgba(59, 130, 246, .16);
    }

    .btn,
    button,
    a.button {
      appearance: none;
      border: 0;
      cursor: pointer;
      border-radius: 14px;
      min-height: 44px;
      padding: 11px 14px;
      color: #fff;
      background: linear-gradient(135deg, #2563eb, #0ea5e9);
      font-weight: 950;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
      white-space: nowrap;
    }

    .btn.secondary,
    button.secondary,
    a.secondary {
      background: rgba(255,255,255,.10);
      border: 1px solid var(--border);
    }

    .btn.green,
    button.green {
      background: linear-gradient(135deg, #16a34a, #22c55e);
    }

    .btn:disabled,
    button:disabled {
      opacity: .55;
      cursor: not-allowed;
    }

    .button-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      margin-top: auto;
    }

    .status {
      min-height: 44px;
      margin-top: 2px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,.06);
      color: #7dd3fc;
      font-weight: 800;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .status.empty {
      color: var(--muted);
      font-weight: 700;
    }

    code {
      color: #93c5fd;
      overflow-wrap: anywhere;
    }

    .path-box {
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(2, 6, 23, .55);
      border: 1px solid var(--border);
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    @media (max-width: 900px) {
      .tools-grid { grid-template-columns: 1fr; }
      .topbar { align-items: stretch; flex-direction: column; }
      .nav-actions { align-items: stretch; }
      .back, .nav-pill, .button-row .btn, .button-row button, .button-row a.button { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="page">
${renderPs5NavBar('tools')}

    <section class="hero">
      <p class="eyebrow">PS5</p>
      <h1>Relapse / etaHEN tools</h1>
      <p class="muted">
        Host the Relapse page locally, save the PS5 target IP, send a one-off ELF/BIN payload,
        and send direct PKG URLs to etaHEN Direct PKG Installer.
      </p>
    </section>

    <section class="tools-grid">
      <article class="panel equal-panel">
        <p class="eyebrow">Target</p>
        <h2>PS5 connection</h2>

        <div class="field">
          <label for="ps5Host">PS5 IP / host</label>
          <input id="ps5Host" value="${escapedHost}" placeholder="192.168.1.110">
        </div>

        <div class="button-row">
          <button id="saveHost" type="button"><i class="fa-solid fa-floppy-disk"></i> Save PS5 IP</button>
          <a id="etaHenWeb" class="button secondary" href="${etaHenWebUrl}" target="_blank" rel="noopener">
            <i class="fa-solid fa-up-right-from-square"></i> Open etaHEN WebUI
          </a>
        </div>

        <div id="hostStatus" class="status empty">Ready.</div>
      </article>

      <article class="panel equal-panel">
        <p class="eyebrow">Relapse</p>
        <h2>Local Relapse host</h2>
        <p class="muted">Open this on the PS5 browser when you need to run the exploit / loader page.</p>
        <div class="path-box">
          Relapse folder:<br>
          <code>${escapeHtml(ps5RelapseDir)}</code><br>
          ${relapseAvailable ? '✅ found' : '⚠️ not found yet'}
        </div>
        <div class="button-row">
          <a class="button" href="/ps5/relapse/" target="_blank" rel="noopener">
            <i class="fa-solid fa-globe"></i> Open Relapse host
          </a>
        </div>
      </article>

      <article class="panel equal-panel">
        <p class="eyebrow">Payload</p>
        <h2>Send one-off ELF/BIN</h2>
        <p class="muted">Run Relapse on the PS5 first. After the ELF loader is listening, send a payload to port ${ps5ElfPort}.</p>

        <div class="field">
          <label for="elfFile">ELF/BIN payload</label>
          <input id="elfFile" type="file" accept=".elf,.bin,application/octet-stream">
        </div>

        <div class="button-row">
          <button id="sendElf" class="green" type="button"><i class="fa-solid fa-paper-plane"></i> Send payload</button>
          <a class="button secondary" href="/ps5/payloads"><i class="fa-solid fa-folder-open"></i> Payload manager</a>
        </div>

        <div id="elfStatus" class="status empty">Ready.</div>
      </article>

      <article class="panel equal-panel">
        <p class="eyebrow">etaHEN</p>
        <h2>Direct PKG Installer</h2>
        <p class="muted">Send any HTTP/HTTPS PKG URL to etaHEN on port ${ps5DpiPort}.</p>

        <div class="field">
          <label for="pkgUrl">PKG URL</label>
          <input id="pkgUrl" placeholder="${escapeHtml(publicBaseUrl)}/pkgfiles/ps5/Game.pkg">
        </div>

        <div class="button-row">
          <button id="sendPkgUrl" type="button"><i class="fa-solid fa-download"></i> Send install URL</button>
        </div>

        <div id="pkgStatus" class="status empty">Ready.</div>
      </article>
    </section>
  </main>

  <script>
    const qs = (id) => document.getElementById(id);

    function host() { return qs('ps5Host').value.trim(); }

    function setStatus(element, message, isError) {
      element.textContent = message || '';
      element.classList.toggle('empty', !message || message === 'Ready.');
      element.style.color = isError ? '#fecaca' : '#7dd3fc';
    }

    function updateEtaHenLink() {
      const value = host();
      qs('etaHenWeb').href = value ? 'http://' + value + ':${ps5DpiWebPort}' : '#';
    }

    qs('ps5Host').addEventListener('input', updateEtaHenLink);

    qs('saveHost').addEventListener('click', async () => {
      setStatus(qs('hostStatus'), 'Saving...', false);
      const res = await fetch('/api/ps5ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPS5ipadr: host() })
      });
      const data = await res.json();
      setStatus(qs('hostStatus'), data.message || data.error || (res.ok ? 'Saved' : 'Failed'), !res.ok);
      updateEtaHenLink();
    });

    qs('sendElf').addEventListener('click', async () => {
      const file = qs('elfFile').files[0];
      if (!host()) { setStatus(qs('elfStatus'), 'Missing PS5 IP.', true); return; }
      if (!file) { setStatus(qs('elfStatus'), 'Choose an ELF/BIN file first.', true); return; }

      setStatus(qs('elfStatus'), 'Sending ' + file.name + '...', false);
      try {
        const res = await fetch('/api/ps5/send-elf?host=' + encodeURIComponent(host()), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: await file.arrayBuffer()
        });
        const data = await res.json();
        setStatus(qs('elfStatus'), data.message || (res.ok ? 'Payload sent.' : 'Failed.'), !res.ok);
      } catch (error) {
        setStatus(qs('elfStatus'), error.message, true);
      }
    });

    qs('sendPkgUrl').addEventListener('click', async () => {
      if (!host()) { setStatus(qs('pkgStatus'), 'Missing PS5 IP.', true); return; }
      const url = qs('pkgUrl').value.trim();
      if (!url) { setStatus(qs('pkgStatus'), 'Missing PKG URL.', true); return; }

      setStatus(qs('pkgStatus'), 'Sending install URL...', false);
      try {
        const res = await fetch('/api/ps5/install-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: host(), url })
        });
        const data = await res.json();
        setStatus(qs('pkgStatus'), data.message || (res.ok ? 'Install URL sent.' : 'Failed.'), !res.ok);
      } catch (error) {
        setStatus(qs('pkgStatus'), error.message, true);
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
