# PS PKG Sender

Modern local web UI for managing PlayStation package files, PS5 payloads, PS5Upload installs, PS2 games for PS5SX2/PCSX2, and Nintendo Switch files for ProsperoEden.

This project is designed for a trusted LAN setup. It is not intended to be exposed directly to the public internet.

---

## Features

### Package library

- PS4 library page
- PS5 library page
- PS5 page can show or hide:
  - PS4 packages
  - PS5 packages
  - PS2 games
  - Nintendo Switch games
- Folder-style cards with package/game lists
- Cover and thumbnail support
- Size statistics and package counts
- Manual refresh flow after new covers are downloaded

### PS4 installs

- Send PS4 `.pkg` files to the PS4 Direct Package Installer.
- Uses the configured PS4 host/IP.

### PS5 installs

- Direct PS5 package install through the integrated PS5Upload engine.
- Uses PS5Upload `/api/pkg/install`.
- Sends host-side package files using the `host_file` source format.
- Install queue support.
- etaHEN Direct Package Installer mode can still be used by setting `PS5_INSTALL_MODE=etahen`.

### PS5Upload integration

- Integrated PS5Upload engine/web UI in the same container.
- PS5Upload Web UI available through the configured `PS5UPLOAD_WEB_URL`.
- PKG Sender uses the local internal PS5Upload API for installs and transfers.
- PS5Upload can be used to transfer folders and files to the PS5 without FTP.

### Payload / ELF manager

- Upload `.elf`, `.bin`, and `.payload` files.
- Send payload files to the PS5 ELF loader port, usually `9021`.
- Helper text explains that `elfldr / ELF loader` must be loaded before sending payloads.
- Optional Payload Manager 8084 integration.
- Payloads can be synced into the PS5 Payload Manager storage path.

### Homebrew app manager

- Upload and extract PS5 homebrew ZIP files.
- Deploy extracted homebrew folders through PS5Upload.
- Default target:

```text
/data/homebrew/<folder>
```

### PS2 / PS5SX2 support

- PS2 games can be shown on the PS5 page.
- Supported extensions by default:

```text
.iso, .chd, .cso, .bin, .img, .mdf, .nrg, .gz
```

- PS2 games are uploaded through PS5Upload to:

```text
/data/PCSX2/games
```

### PS5SX2 BIOS manager

- Dedicated page for uploading BIOS files to the PS5.
- Default target:

```text
/data/PCSX2/bios
```

- Supported BIOS extensions by default:

```text
.bin, .rom, .erom, .nvm, .mec, .zip, .txt
```

### Nintendo Switch / ProsperoEden support

- Nintendo Switch games can be shown on the PS5 page.
- Supported extensions by default:

```text
.nsp, .xci, .nsz, .xcz
```

- Switch games are uploaded through PS5Upload to:

```text
/data/prosperoeden/roms
```

### Nintendo Switch / ProsperoEden manager page

Dedicated page for uploading your own legally dumped files to:

```text
/data/prosperoeden/keys
/data/prosperoeden/firmware
/data/prosperoeden/updates
/data/prosperoeden/mods
```

This project does not include or provide console keys, firmware, BIOS files, ROMs, ISOs, packages, or commercial games.

---

## Pages

| Page | Purpose |
|---|---|
| `/` | Main console select page |
| `/ps4` | PS4 package library |
| `/ps5` | PS5 library with PS4, PS5, PS2, and Switch sections |
| `/ps5/payloads` | Payload / ELF manager |
| `/ps5/homebrew` | PS5 homebrew ZIP manager |
| `/ps5/ps5sx2` | PS5SX2 BIOS manager |
| `/ps5/nintendoswitch` | ProsperoEden keys, firmware, updates, and mods manager |
| `/ps5/tools` | Relapse / etaHEN tools |
| `/ps5upload` | Integrated PS5Upload Web UI redirect |

---

## Required Docker volumes

Add the volumes you use under the `pkgsender` service.

```yaml
volumes:
  - /pkg_sender/PS4Games/:/pkg_sender/PS4Games
  - /pkg_sender/PS5Games/:/pkg_sender/PS5Games
  - /pkg_sender/PS2Games/:/pkg_sender/PS2Games
  - /pkg_sender/SwitchGames/:/pkg_sender/SwitchGames
  - /pkg_sender/src/:/pkg_sender/src
```

The `src` bind mount means frontend and backend source changes are loaded from the host path.

---

## Environment variables

Recommended `.env` / compose env values:

```env
# App
LOCALIP=192.168.1.202
PUBLIC_BASE_URL=http://192.168.1.202:7777

# Package roots inside container
PKG_DIR=/pkg_sender/PS4Games
STATIC_FILES=/pkg_sender/PS4Games
PS4_PKG_DIR=/pkg_sender/PS4Games
PS5_PKG_DIR=/pkg_sender/PS5Games

# PS4
PS4IP=192.168.1.111

# PS5
PS5IP=192.168.1.110
PS5_ADDR=192.168.1.110:9113
PS5_TCP_TIMEOUT_MS=30000

# PS5 install mode
PS5_INSTALL_MODE=ps5upload

# etaHEN / ELF loader ports
PS5_ELF_PORT=9021
PS5_DPI_PORT=9090
PS5_DPI_WEB_PORT=12800

# PS5Upload
PS5UPLOAD_ALLOW_IP=192.168.1.0/24
PS5UPLOAD_PKG_HOST_IP=192.168.1.202
PS5UPLOAD_WEB_PORT=19113
PS5UPLOAD_WEB_URL=http://192.168.1.202:19113
PS5UPLOAD_INTERNAL_URL=http://127.0.0.1:19113
PS5UPLOAD_RUNTIME_PORT=9113
PS5UPLOAD_INSTALL_POLL_MS=2500

# Install queue
INSTALL_QUEUE_DELAY_MS=5000

# Payload manager
PS5_PAYLOAD_DIR=/pkg_sender/src/public/ps5-payloads
PS5_PAYLOAD_LIMIT=200mb
PS5_PAYLOAD_MANAGER_PORT=8084
PS5_PAYLOAD_MANAGER_REMOTE_DIR=/data/pldmgr/payloads
PS5_PAYLOAD_MANAGER_AUTO_SYNC=true

# Homebrew
PS5_HOMEBREW_DIR=/pkg_sender/src/public/ps5-homebrew
PS5_HOMEBREW_UPLOAD_LIMIT=2gb
PS5_HOMEBREW_DEPLOY_METHOD=ps5upload
PS5_HOMEBREW_REMOTE_ROOT=/data/homebrew

# FTP fallback, only used if PS5_HOMEBREW_DEPLOY_METHOD=ftp
PS5_FTP_PORT=1337

# PS2 / PS5SX2
PS2_GAME_DIR=/pkg_sender/PS2Games
PS2_GAME_REMOTE_ROOT=/data/PCSX2/games
PS2_GAME_EXTENSIONS=.iso,.chd,.cso,.bin,.img,.mdf,.nrg,.gz
PCSX2_BIOS_REMOTE_DIR=/data/PCSX2/bios
PS5SX2_UPLOAD_LIMIT=2gb
PCSX2_BIOS_EXTENSIONS=.bin,.rom,.erom,.nvm,.mec,.zip,.txt

# Nintendo Switch / ProsperoEden
SWITCH_GAME_DIR=/pkg_sender/SwitchGames
SWITCH_GAME_REMOTE_ROOT=/data/prosperoeden/roms
SWITCH_GAME_EXTENSIONS=.nsp,.xci,.nsz,.xcz
PROSPEROEDEN_ROOT=/data/prosperoeden
PROSPEROEDEN_UPLOAD_LIMIT=8gb

# Relapse host files
PS5_RELAPSE_DIR=/pkg_sender/src/public/ps5-relapse
```

---

## Build and run

From the Docker compose folder:

```bash
COMPOSE_DIR=/srv/dev-disk-by-uuid-2d63569d-15a7-41a3-8009-e9b487095e11/dockercompose/dockerfiles

cd "$COMPOSE_DIR"

docker-compose -f dockerfiles.yml --env-file dockerfiles.env build --no-cache pkgsender
docker-compose -f dockerfiles.yml --env-file dockerfiles.env up -d --force-recreate pkgsender
```

Check logs:

```bash
docker logs -f pkgsender
```

Validate inside the container:

```bash
docker exec -it pkgsender sh -lc '
node --check /pkg_sender/src/app.js

echo
echo "PS5Upload version:"
curl -s http://127.0.0.1:19113/api/version
echo

echo
echo "PS5Upload PS5 status:"
curl -s http://127.0.0.1:19113/api/ps5/status
echo
'
```

---

## PS5 payload order notes

For PS5 fPKG and app launching, payload order matters.

A typical 11.60 setup may require:

```text
1. Run exploit / jailbreak
2. Load etaHEN or required jailbreak environment
3. Load kstuff / fpkg-enable
4. Load ShadowMountPlus if needed
5. Load A53/PPR payload if your firmware/setup requires it
6. Load ps5upload
7. Install or re-register the title
```

The Payload / ELF page sends files to `elfldr`, so `elfldr` must already be running and listening on the configured port.

---

## Common troubleshooting

### PS5 package install opens PS5Upload instead of installing

Make sure the newest `src/app.js` and `src/views/index.html` are copied to the host-mounted `src` folder and restart the container.

```bash
docker exec -it pkgsender sh -lc '
grep -n "ps5UploadInstall\|host_file: filepath\|PS5 install mode" /pkg_sender/src/app.js
grep -n "window.open(data.openUrl)\|PS5Upload opened" /pkg_sender/src/views/index.html || true
'
```

There should be no old `window.open(data.openUrl)` install behavior.

### PS5Upload source variant error

If you see:

```text
unknown variant `via`
```

the app is using an old request body. The correct source body is:

```json
{
  "source": {
    "host_file": "/pkg_sender/PS5Games/Game.pkg"
  }
}
```

### Payload sync body too large

Do not use `/api/ps5/fs/write-bytes` for large payload files. This app uses `/api/transfer/file` for larger file transfers.

### Homebrew unknown reconcile mode

Do not use `/api/transfer/dir-reconcile` with `mode: overwrite`. This app uses `/api/transfer/dir` for Homebrew folder deploy.

### PS5 title does not launch

If PS5Upload reports launch errors, try:

```text
1. Reload required payloads
2. Open PS5Upload Library
3. Refresh / Scan
4. Re-register the title
5. Use patch DRM registration if needed
6. Launch again
```

---

## Local file locations

These folders are intentionally ignored by Git:

```text
src/public/ps5-payloads
src/public/ps5-homebrew
src/public/ps5-relapse
src/public/images
src/public/thumbnail
PS4Games
PS5Games
PS2Games
SwitchGames
```

Do not commit games, BIOS files, keys, firmware, payload collections, or copyrighted files.

---

## GitHub release workflow

```bash
PKGSENDER_DIR=/srv/dev-disk-by-uuid-2d63569d-15a7-41a3-8009-e9b487095e11/dockercompose/dockerfiles/pkgsender

cd "$PKGSENDER_DIR"

git status --short
git add .gitignore Dockerfile docker-entrypoint.sh package.json package-lock.json README.md src
git commit -m "Add PS5Upload, PS2, Switch and emulator managers"
git push -u origin main
```

Create a release:

```bash
TAG=v2.4.0

mkdir -p dist

cat > RELEASE_NOTES.md <<'EOF_NOTES'
# PS PKG Sender v2.4.0

## Added
- Direct PS5Upload install support for PS5 packages
- PS5Upload-based Homebrew deploy instead of FTP
- Payload Manager 8084 integration
- PS2 games section on PS5 page
- Upload PS2 games to /data/PCSX2/games
- Nintendo Switch / ProsperoEden games section
- ProsperoEden manager page for keys, firmware, updates, and mods
- PS5SX2 BIOS manager page
- Upload BIOS files to /data/PCSX2/bios

## Fixed
- PS5Upload install source format now uses host_file
- Payload sync uses transfer/file instead of fs/write-bytes
- Homebrew deploy uses transfer/dir instead of unsupported reconcile mode
EOF_NOTES

git archive --format=zip --output "dist/ps_pkgsender-${TAG}.zip" HEAD

gh release create "$TAG" \
  "dist/ps_pkgsender-${TAG}.zip" \
  --repo kekec777/ps_pkgsender \
  --title "PS PKG Sender ${TAG}" \
  --notes-file RELEASE_NOTES.md \
  --latest
```

---

## Important legal note

This project does not provide games, BIOS files, firmware, encryption keys, licenses, or copyrighted files.

Use this tool only with homebrew and files you legally own and are legally allowed to use.
