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
<<<<<<< Updated upstream
=======
- Direct PLDMGR link from the Payload / ELF manager page to `http://<PS5_IP>:8084/`.
- Direct RetroArch WebUI link from the Payload / ELF manager page to `http://<PS5_IP>:6769/`.
- Direct PS5 File WebUI Manager link from the Payload / ELF manager page to `http://<PS5_IP>:8888/`.
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
### PS5SX2 BIOS manager

- Dedicated page for uploading BIOS files to the PS5.
- Default target:
=======
### PS5SX2 manager

- Dedicated page for PS5SX2 / PCSX2 management.
- Upload your own legally dumped BIOS files to:
>>>>>>> Stashed changes

```text
/data/PCSX2/bios
```

<<<<<<< Updated upstream
=======
- List PS2 games stored on the PS5 in:

```text
/data/PCSX2/games
```

- Delete PS2 games from the PS5SX2 games folder through PS5Upload.
>>>>>>> Stashed changes
- Supported BIOS extensions by default:

```text
.bin, .rom, .erom, .nvm, .mec, .zip, .txt
```

<<<<<<< Updated upstream
=======
### RetroArch / Retro games support

- PS1 games can be mapped from `/pkg_sender/PS1Games`.
- General retro ROMs can be mapped from `/pkg_sender/Retro`.
- PS1 games upload to:

```text
/data/homebrew/PPSA99169/es-de/ROMs/psx
```

- Retro games use the first folder under `/pkg_sender/Retro` as the system name. Example:

```text
/pkg_sender/Retro/SNES/Game.sfc
```

uploads to:

```text
/data/homebrew/PPSA99169/es-de/ROMs/snes/Game.sfc
```

- Common folder aliases are included, such as `SNES -> snes`, `NES -> nes`, `N64 -> n64`, `Genesis -> megadrive`, `PS1 -> psx`, and `MAME -> mame`.

>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
=======
The page can also list ROMs stored in:

```text
/data/prosperoeden/roms
```

and delete ROMs from that folder through PS5Upload.

>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
| `/ps5/ps5sx2` | PS5SX2 BIOS manager |
| `/ps5/nintendoswitch` | ProsperoEden keys, firmware, updates, and mods manager |
| `/ps5/tools` | Relapse / etaHEN tools |
=======
| `/ps5/ps5sx2` | PS5SX2 manager: BIOS upload plus remote PS2 game list/delete |
| `/ps5/nintendoswitch` | ProsperoEden keys, firmware, updates, mods, and remote ROM list/delete |
| `/ps5/tools` | Relapse / etaHEN tools |
| `/ps5/links` | PS5 quick links for PLDMGR, RetroArch WebUI, and PS5 File WebUI |
>>>>>>> Stashed changes
| `/ps5upload` | Integrated PS5Upload Web UI redirect |

---

## Required Docker volumes

Add the volumes you use under the `pkgsender` service. Replace the host paths with your own folders.

```yaml
volumes:
  - /path/to/Playstation/PS4/Games/:/pkg_sender/PS4Games
  - /path/to/Playstation/PS5/Games/:/pkg_sender/PS5Games
  - /path/to/Playstation/PS2/Games/:/pkg_sender/PS2Games
<<<<<<< Updated upstream
=======
  - /path/to/Playstation/PS1/Games/:/pkg_sender/PS1Games
  - /path/to/Playstation/ROMS/:/pkg_sender/Retro
>>>>>>> Stashed changes
  - /path/to/Nintendo/Switch/Games/:/pkg_sender/SwitchGames
  - /path/to/pkgsender/src:/pkg_sender/src
```

The `src` bind mount means frontend and backend source changes are loaded from the host path.

---

## Environment variables

Recommended `.env` / compose env values. Replace placeholders like `<PKGSENDER_HOST_IP>`, `<PS5_IP>`, and `<LAN_CIDR>` with values for your own network:

```env
# App
LOCALIP=<PKGSENDER_HOST_IP>
PUBLIC_BASE_URL=http://<PKGSENDER_HOST_IP>:7777

# Package roots inside container
PKG_DIR=/pkg_sender/PS4Games
STATIC_FILES=/pkg_sender/PS4Games
PS4_PKG_DIR=/pkg_sender/PS4Games
PS5_PKG_DIR=/pkg_sender/PS5Games

# PS4
PS4IP=<PS4_IP>

# PS5
PS5IP=<PS5_IP>
PS5_ADDR=<PS5_IP>:9113
PS5_TCP_TIMEOUT_MS=30000

# PS5 install mode
PS5_INSTALL_MODE=ps5upload

# etaHEN / ELF loader ports
PS5_ELF_PORT=9021
PS5_DPI_PORT=9090
PS5_DPI_WEB_PORT=12800

# PS5Upload
PS5UPLOAD_ALLOW_IP=<LAN_CIDR>
PS5UPLOAD_PKG_HOST_IP=<PKGSENDER_HOST_IP>
PS5UPLOAD_WEB_PORT=19113
PS5UPLOAD_WEB_URL=http://<PKGSENDER_HOST_IP>:19113
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
<<<<<<< Updated upstream
=======

# RetroArch / ES-DE ROMs
PS1_GAME_DIR=/pkg_sender/PS1Games
RETRO_GAME_DIR=/pkg_sender/Retro
RETRO_REMOTE_ROOT=/data/homebrew/PPSA99169/es-de/ROMs
PS1_GAME_EXTENSIONS=.cue,.chd,.pbp,.iso,.bin,.img,.mdf,.ccd,.m3u,.toc,.ecm
RETRO_GAME_EXTENSIONS=.zip,.7z,.nes,.fds,.sfc,.smc,.fig,.gb,.gbc,.gba,.n64,.z64,.v64,.md,.smd,.gen,.sms,.gg,.32x,.pce,.sgx,.ws,.wsc,.ngp,.ngc,.a26,.a52,.a78,.lnx,.j64,.rom,.col,.int,.vec,.dsk,.tap,.tzx,.z80,.uae,.adf,.ipf,.lha,.cue,.chd,.iso,.cso,.pbp,.bin,.img,.m3u,.nds,.3ds,.cia,.dol,.gcm,.rvz,.wad,.wbfs,.cdi,.gdi,.elf,.doom,.p8,.tic

>>>>>>> Stashed changes
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
COMPOSE_DIR=/path/to/docker-compose-folder

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

<<<<<<< Updated upstream
=======
## Remote list/delete APIs

These endpoints use the integrated PS5Upload API and require ps5upload to be running on the PS5.

| Endpoint | Method | Purpose |
|---|---:|---|
| `/api/ps5/prosperoeden/roms` | GET | List files under `/data/prosperoeden/roms` |
| `/api/ps5/prosperoeden/roms/delete` | POST | Delete one ROM path under `/data/prosperoeden/roms` |
| `/api/ps5/ps5sx2/games` | GET | List files under `/data/PCSX2/games` |
| `/api/ps5/ps5sx2/games/delete` | POST | Delete one game path under `/data/PCSX2/games` |

Delete requests expect JSON like:

```json
{
  "host": "<PS5_IP>",
  "path": "/data/prosperoeden/roms/Game.nsp"
}
```

The app refuses to delete the root folder and rejects paths outside the configured remote root.

---

>>>>>>> Stashed changes
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
PKGSENDER_DIR=/path/to/pkgsender

cd "$PKGSENDER_DIR"

git status --short
git add .gitignore Dockerfile docker-entrypoint.sh package.json package-lock.json README.md src
<<<<<<< Updated upstream
git commit -m "Add PS5Upload, PS2, Switch and emulator managers"
=======
git commit -m "Add PS5Upload, emulator managers and remote delete tools"
>>>>>>> Stashed changes
git push -u origin main
```

Create a release:

```bash
<<<<<<< Updated upstream
TAG=v2.4.0
=======
TAG=v2.5.0
>>>>>>> Stashed changes

mkdir -p dist

cat > RELEASE_NOTES.md <<'EOF_NOTES'
<<<<<<< Updated upstream
# PS PKG Sender v2.4.0
=======
# PS PKG Sender v2.5.0
>>>>>>> Stashed changes

## Added
- Direct PS5Upload install support for PS5 packages
- PS5Upload-based Homebrew deploy instead of FTP
- Payload Manager 8084 integration
<<<<<<< Updated upstream
- PS2 games section on PS5 page
- Upload PS2 games to /data/PCSX2/games
- Nintendo Switch / ProsperoEden games section
- ProsperoEden manager page for keys, firmware, updates, and mods
- PS5SX2 BIOS manager page
- Upload BIOS files to /data/PCSX2/bios
=======
- PLDMGR quick link from the Payload / ELF manager page
- RetroArch WebUI quick link from the Payload / ELF manager page
- PS5 File WebUI Manager quick link from the Payload / ELF manager page
- PS2 games section on PS5 page
- Retro games section on PS5 page
- PS1 and Retro ROM upload to ES-DE ROM folders
- PS5 Links page for PLDMGR, RetroArch WebUI, and PS5 File WebUI
- Upload PS2 games to /data/PCSX2/games
- Nintendo Switch / ProsperoEden games section
- ProsperoEden manager page for keys, firmware, updates, and mods
- Remote ProsperoEden ROM list and delete from /data/prosperoeden/roms
- PS5SX2 manager page
- Upload BIOS files to /data/PCSX2/bios
- Remote PS5SX2 game list and delete from /data/PCSX2/games
>>>>>>> Stashed changes

## Fixed
- PS5Upload install source format now uses host_file
- Payload sync uses transfer/file instead of fs/write-bytes
- Homebrew deploy uses transfer/dir instead of unsupported reconcile mode
<<<<<<< Updated upstream
=======
- Homebrew page browser script no longer breaks on inline template rendering
>>>>>>> Stashed changes
EOF_NOTES

git archive --format=zip --output "dist/ps_pkgsender-${TAG}.zip" HEAD

gh release create "$TAG" \
  "dist/ps_pkgsender-${TAG}.zip" \
  --repo <github-user>/ps_pkgsender \
  --title "PS PKG Sender ${TAG}" \
  --notes-file RELEASE_NOTES.md \
  --latest
```

---

## Important legal note

This project does not provide games, BIOS files, firmware, encryption keys, licenses, or copyrighted files.

Use this tool only with homebrew and files you legally own and are legally allowed to use.
