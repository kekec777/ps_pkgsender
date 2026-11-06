# PS PKG Sender

**A self-hosted web interface for managing PlayStation packages, PS5 payloads, homebrew, and emulator libraries from one place.**

PS PKG Sender brings together PS4 package sending, PS5Upload-based installs and file transfers, payload management, and dedicated tools for PS5SX2, RetroArch, and ProsperoEden. It is designed for use on a **trusted local network**.

> [!IMPORTANT]
> This project is intended for private LAN use. Do not expose the management interface or the integrated PS5Upload API directly to the public internet. Use only software, backups, and files you are legally permitted to use.

## Features

| Area | Capabilities |
| --- | --- |
| **PS4** | Browse `.pkg` files and send packages through a configured Direct Package Installer. |
| **PS5** | Browse PS4/PS5 packages, queue installs, and use the integrated [PS5Upload](https://github.com/phantomptr/ps5upload) engine. |
| **Payloads** | Upload and send `.elf`, `.bin`, and `.payload` files through an ELF loader; sync payloads with PS5 Payload Manager. |
| **Homebrew** | Upload ZIP archives, extract them, and deploy homebrew apps using PS5Upload. |
| **PS5SX2 / PCSX2** | Upload PS2 games and personally dumped BIOS files; view and delete remote games. |
| **RetroArch / PS1** | Browse PS1 and retro libraries, upload ROMs into system folders, and manage remote files. |
| **ProsperoEden** | Upload Switch files and manage remote ROMs, firmware, keys, updates, and mods supplied by the user. |
| **Library UI** | Search, platform filters, folder cards, covers, thumbnails, storage statistics, install queues, and a manual refresh option after downloading covers. |

## Web pages

| Route | Description |
| --- | --- |
| `/` | Console selection and main landing page |
| `/ps4` | PS4 package library |
| `/ps5` | Combined PS4, PS5, PS2, Switch, Retro, and PS1 library |
| `/ps5/payloads` | Payload / ELF manager and payload synchronization |
| `/ps5/homebrew` | Homebrew ZIP upload and deployment |
| `/ps5/ps5sx2` | PS5SX2 BIOS, remote PS2 games, and deletion |
| `/ps5/retro` | RetroArch / PS1 remote game list and deletion |
| `/ps5/nintendoswitch` | ProsperoEden files and remote ROM management |
| `/ps5/tools` | PS5 tools, including Relapse and etaHEN-related utilities |
| `/ps5/links` | Links to PLDMGR, RetroArch WebUI, PS5 File WebUI, and PS5Upload |
| `/ps5upload` | Redirect to the integrated PS5Upload web interface |

## Requirements

- Docker and Docker Compose.
- A reachable PS4 and/or PS5 on your LAN, depending on the features you use.
- Local directories containing your own packages, homebrew, games, and other files.
- For PS5 transfers, a compatible **PS5Upload engine and PS5 helper**.
- For sending ELF payloads, a PS5 ELF loader listening on port `9021`.

### PS5Upload networking

| Port | Location | Purpose |
| --- | --- | --- |
| `7777/TCP` | PKG Sender container | PKG Sender web UI |
| `19113/TCP` | PKG Sender host/container | Integrated PS5Upload engine and web UI; also used for PS5 callbacks where required |
| `9120/TCP` | PS5 | Current PS5Upload helper connection |
| `9021/TCP` | PS5 | ELF loader for sending payloads |
| `8084/TCP` | PS5, optional | Payload Manager (PLDMGR) |

Current PS5Upload versions use **9120**, rather than the older **9113/9114** helper ports. For details, see the [PS5Upload documentation](https://github.com/phantomptr/ps5upload).

## Installation

### 1. Get the source

```bash
git clone https://github.com/kekec777/ps_pkgsender.git
cd ps_pkgsender
```

The repository includes the Dockerfile and startup script for the integrated PS5Upload engine. Create or adapt a Compose service for your environment.

### 2. Configure Docker Compose

Example service (replace all `/path/to/...` values with paths on your host):

```yaml
services:
  pkgsender:
    build:
      context: ./ps_pkgsender
    image: pkgsender:latest
    container_name: pkgsender
    restart: unless-stopped
    env_file:
      - ./pkgsender.env
    ports:
      - "7777:7777"
      - "19113:19113"
    volumes:
      - /path/to/PS4/Games:/pkg_sender/PS4Games
      - /path/to/PS5/Games:/pkg_sender/PS5Games
      - /path/to/PS2/Games:/pkg_sender/PS2Games
      - /path/to/PS1/Games:/pkg_sender/PS1Games
      - /path/to/Retro/ROMS:/pkg_sender/Retro
      - /path/to/Switch/Games:/pkg_sender/SwitchGames
      - ./ps_pkgsender/src:/pkg_sender/src
```

This example assumes the Compose file and `pkgsender.env` are in the parent directory of the cloned `ps_pkgsender` repository. Adjust the `build.context`, `env_file`, and bind mounts if your layout differs.

> The `src` bind mount is optional. It is useful during development because the container reads application files from your host, but source changes still require an application/container restart.

### 3. Set environment variables

Create `pkgsender.env` alongside the Compose file. Replace the example addresses with your own network information:

```dotenv
# Application
LOCALIP=192.168.1.50
PUBLIC_BASE_URL=http://192.168.1.50:7777

# Package library paths inside the container
PKG_DIR=/pkg_sender/PS4Games
STATIC_FILES=/pkg_sender/PS4Games
PS4_PKG_DIR=/pkg_sender/PS4Games
PS5_PKG_DIR=/pkg_sender/PS5Games

# Console addresses
PS4IP=192.168.1.60
PS5IP=192.168.1.70
PS5_ADDR=192.168.1.70
PS5_ELF_PORT=9021

# Integrated PS5Upload
PS5_INSTALL_MODE=ps5upload
PS5UPLOAD_RUNTIME_PORT=9120
PS5UPLOAD_WEB_PORT=19113
PS5UPLOAD_WEB_URL=http://192.168.1.50:19113
PS5UPLOAD_INTERNAL_URL=http://127.0.0.1:19113
PS5UPLOAD_PKG_HOST_IP=192.168.1.50
PS5UPLOAD_ALLOW_IP=192.168.1.0/24

# Queue
INSTALL_QUEUE_DELAY_MS=5000

# Payloads
PS5_PAYLOAD_DIR=/pkg_sender/src/public/ps5-payloads
PS5_PAYLOAD_MANAGER_PORT=8084
PS5_PAYLOAD_MANAGER_REMOTE_DIR=/data/pldmgr/payloads
PS5_PAYLOAD_MANAGER_AUTO_SYNC=true

# Homebrew
PS5_HOMEBREW_DIR=/pkg_sender/src/public/ps5-homebrew
PS5_HOMEBREW_DEPLOY_METHOD=ps5upload
PS5_HOMEBREW_REMOTE_ROOT=/data/homebrew

# PS2 / PS5SX2
PS2_GAME_DIR=/pkg_sender/PS2Games
PS2_GAME_REMOTE_ROOT=/data/PCSX2/games
PCSX2_BIOS_REMOTE_DIR=/data/PCSX2/bios

# RetroArch / PS1
PS1_GAME_DIR=/pkg_sender/PS1Games
RETRO_GAME_DIR=/pkg_sender/Retro
RETRO_REMOTE_ROOT=/data/homebrew/PPSA99169/ROMS

# Nintendo Switch / ProsperoEden
SWITCH_GAME_DIR=/pkg_sender/SwitchGames
SWITCH_GAME_REMOTE_ROOT=/data/prosperoeden/roms
PROSPEROEDEN_ROOT=/data/prosperoeden
```

`PS5_ADDR` is an **IP address without `:9113`** for the current PS5Upload connection setup. The helper port is configured separately as `PS5UPLOAD_RUNTIME_PORT=9120`.

Additional upload-size limits, supported file extensions, legacy etaHEN ports, and other options are configurable through environment variables.

### 4. Build and start

From the directory containing the Compose file:

```bash
docker compose build --pull pkgsender
docker compose up -d --force-recreate pkgsender
docker logs -f pkgsender
```

Open:

- **PKG Sender:** `http://<SERVER_IP>:7777`
- **PS5Upload:** `http://<SERVER_IP>:19113`

If your Compose filename is not `compose.yml` or `docker-compose.yml`, add `-f <your-compose-file.yml>` to the Compose commands.

## Game and file destinations

Uploads use files already available through the configured Docker mounts. The folder names below are paths **inside the container** and **on the PS5**, respectively.

| Library | Source inside PKG Sender | Target on PS5 |
| --- | --- | --- |
| PS2 | `/pkg_sender/PS2Games` | `/data/PCSX2/games` |
| PS1 | `/pkg_sender/PS1Games` | `/data/homebrew/PPSA99169/ROMS/psx` |
| Retro | `/pkg_sender/Retro/<SYSTEM>/...` | `/data/homebrew/PPSA99169/ROMS/<SYSTEM>/...` |
| Switch | `/pkg_sender/SwitchGames` | `/data/prosperoeden/roms` |
| Homebrew | Uploaded/extracted ZIP | `/data/homebrew/<APP_FOLDER>` |

Retro uploads **preserve the top-level source system folder**. For example:

```text
Source: /pkg_sender/Retro/GEN/Sonic The Hedgehog.zip
Target: /data/homebrew/PPSA99169/ROMS/GEN/Sonic The Hedgehog.zip
```

All PS1 games are grouped together in the library UI as **Retro / PS1**, even when the files are stored in separate game folders. PS2 games remain separate and use the PS5SX2/PCSX2 destination, not the RetroArch destination.

For disc-based games containing multiple files (such as `.cue` plus `.bin`/`.img`), keep their referenced files together. An `.ecm`-compressed image may need to be decompressed or converted into a format supported by the selected emulator/core before use.

### Remote managers

The PS5SX2, Retro, and ProsperoEden pages can list and delete matching files on the PS5. Deletion is permanent, so confirm the selected path before proceeding. These features require a working PS5Upload helper and filesystem connection.

## Payload manager

The `/ps5/payloads` page provides:

- Local upload and management of `.elf`, `.bin`, and `.payload` files.
- Sending payloads to an already-running ELF loader.
- Optional synchronization **from the server to PS5 Payload Manager**.
- An option to import payloads **from PS5 Payload Manager back to the server**; support depends on the connected PS5Upload engine's transfer API.

Payload Manager's default remote folder is `/data/pldmgr/payloads`. The companion tools' web links are grouped under `/ps5/links` rather than on the Payloads page.

## Troubleshooting

**PS5Upload web UI works, but PS5 transfers fail:** Check that the helper is loaded on the PS5 and port `9120` is reachable. The integrated web UI on `19113` can run even when the PS5 helper is disconnected. Ensure the engine and helper versions are compatible.

**The PS5Upload helper is unavailable after reboot:** Keep an ELF loader running on `9021`; use PS5Upload's Connection page to check and send the helper again.

**The Docker rebuild fails with `Dockerfile cannot be empty`:** Verify that `Dockerfile` and `docker-entrypoint.sh` in the repository are non-empty before rebuilding.

**The Retro page shows `Cannot GET /api/ps5/retro/games`:** Update the backend `src/app.js` to a version that includes the Retro API routes, restart PKG Sender, and refresh the browser.

**A UI update is not visible:** If `src` is bind-mounted, verify you edited the mounted host files, then restart the container and hard-refresh your browser.

**Check the integrated engine and the helper connection:**

```bash
docker exec pkgsender sh -lc '
  node --check /pkg_sender/src/app.js
  curl -sS http://127.0.0.1:19113/api/version
  echo
  nc -z -w2 "$PS5IP" 9120 && echo "PS5Upload helper reachable" || echo "PS5Upload helper unavailable"
  nc -z -w2 "$PS5IP" 9021 && echo "ELF loader reachable" || echo "ELF loader unavailable"
'
```

For upstream connection and helper troubleshooting, see [PS5Upload FAQ](https://github.com/phantomptr/ps5upload/blob/main/FAQ.md).

## Security and legal use

- Keep PKG Sender, PS5Upload, and remote management endpoints restricted to a trusted network.
- Do not commit `.env` files, credentials, console keys, BIOS files, firmware, payload collections, game files, or package backups.
- Only upload or install files you own or are otherwise authorized to use.
- This repository does **not** distribute games, ROMs, BIOS images, console keys, firmware, or copyrighted commercial packages.

## Related projects

- [PS5Upload](https://github.com/phantomptr/ps5upload) — PS5 transfers, package installs, filesystem operations, and web UI.
- [PS5SX2](https://github.com/Swordpdf/PS5SX2) — a port of PCSX2 for PS5.
- [RetroArch](https://www.retroarch.com/) — Retro game emulation frontend.

---

**PS PKG Sender** is a community-oriented self-hosted management interface. It is not affiliated with Sony, Nintendo, or the projects it integrates with.
