# PS4 / PS5 PKG Sender

A web-based PKG sender for browsing local `.pkg` files, sending install requests to a PlayStation 4, and using PS5 Relapse / etaHEN helper workflows on your own local network.

This project is a fork of [`justanormaldev/ps4-pkg-sender`](https://github.com/justanormaldev/ps4-pkg-sender), with extra UI improvements, folder thumbnails, cover downloading, Docker support, PS4/PS5 library separation, and better handling for large local PKG libraries.

## Features

- Console selection page at `/`
- PS4 package library at `/ps4`
- PS5 package library at `/ps5`
- PS5 helper page at `/ps5/tools`
- Relapse static host at `/ps5/relapse/`
- PS4 library shows only PS4 packages
- PS5 library can show PS4 packages, PS5 packages, or both with checkboxes
- Folder-based package library view
- Folder thumbnails from `src/public/thumbnail/`
- PKG/game cover images from `src/public/images/`
- Strict separation between folder thumbnails and package cover images
- Download missing covers button
- Live debug toggle for cover downloads
- Timeout handling so one slow cover source does not stop the whole scan
- Docker and Docker Compose support
- PS5 ELF/BIN payload sender for the Relapse/etaHEN ELF loader
- etaHEN Direct PKG Installer URL sender

## Web routes

| Route | Purpose |
|---|---|
| `/` | Console selector with PS4 and PS5 buttons |
| `/ps4` | PS4 package library |
| `/ps5` | PS5 package library |
| `/ps5/tools` | PS5 Relapse / etaHEN helper tools |
| `/ps5/helper` | Redirects to `/ps5/tools` |
| `/ps5/relapse/` | Locally hosted Relapse files |
| `/api/ps4ip` | Get/update PS4 IP |
| `/api/ps5ip` | Get/update PS5 IP |
| `/api/ps5/info` | PS5 configuration/status info |
| `/api/covers/missing?console=ps4` | Check missing covers for PS4 view |
| `/api/covers/missing?console=ps5` | Check missing covers for PS5 view |
| `/api/covers/download-missing?console=ps4` | Download missing covers for PS4 view |
| `/api/covers/download-missing?console=ps5` | Download missing covers for PS5 view |
| `/install` | Send install request to PS4 package installer |
| `/api/ps5/install` | Send install URL to PS5 etaHEN Direct PKG Installer |
| `/api/ps5/install-url` | Send a custom PKG URL to PS5 etaHEN Direct PKG Installer |
| `/api/ps5/send-elf` | Send an ELF/BIN payload to the PS5 ELF loader |

## Library behavior

### PS4 view

The PS4 view is available at:

```text
/ps4
```

It shows only packages from:

```text
/pkg_sender/PS4Games
```

Install requests from this page go to the PS4 package installer endpoint.

### PS5 view

The PS5 view is available at:

```text
/ps5
```

It can show packages from both:

```text
/pkg_sender/PS4Games
/pkg_sender/PS5Games
```

The PS5 page has checkboxes:

```text
[x] PS4 games
[x] PS5 games
```

Behavior:

```text
PS4 games checked only = show only PS4 packages
PS5 games checked only = show only PS5 packages
Both checked = show both PS4 and PS5 packages
```

Install requests from this page go to etaHEN Direct PKG Installer.

## Recommended folder layout

Recommended container layout:

```text
/pkg_sender/
├── PS4Games/
│   ├── Alan_Wake_Remastered_CUSA24653/
│   │   ├── Alan_Wake_Remastered_CUSA24653.pkg
│   │   └── Alan_Wake_Remastered_UPD_v1_03_CUSA24653.pkg
│   └── 00_Tools/
│       └── Some_PS4_Tool.pkg
├── PS5Games/
│   ├── Astro_Bot_PPSA21497/
│   │   └── Astro_Bot_PPSA21497.pkg
│   └── God_of_war_-_sons_of_sparta.pkg
└── src/
    └── public/
        ├── images/
        ├── thumbnail/
        ├── theme-images/
        └── ps5-relapse/
```

If a `.pkg` file is placed directly inside `PS4Games` or `PS5Games`, the app uses the filename without `.pkg` as the virtual folder name instead of showing it as `Root`.

Example:

```text
/pkg_sender/PS5Games/God of war - sons of sparta.pkg
```

will be shown as:

```text
PS5 / God of war - sons of sparta
```

not:

```text
PS5 / Root
```

## Images and thumbnails

Package cover images are saved to:

```text
src/public/images/
```

Folder thumbnails are saved to:

```text
src/public/thumbnail/
```

The expected image name is based on the `.pkg` filename.

Example package:

```text
Alan_Wake_Remastered_CUSA24653.pkg
```

Expected package cover:

```text
src/public/images/Alan_Wake_Remastered_CUSA24653.jpg
```

Expected folder thumbnail:

```text
src/public/thumbnail/Alan_Wake_Remastered_CUSA24653.jpg
```

If a folder thumbnail is missing, the app falls back to the first package cover image for that folder.

## Download missing covers

Click **Download missing covers** in the web interface.

The downloader only searches for missing images and missing thumbnails.

On `/ps4`, the downloader scans:

```text
PS4Games only
```

On `/ps5`, the downloader scans:

```text
PS4Games + PS5Games
```

The **Live debug** toggle shows each item as it is processed.

Example result:

```text
Checked 77. Downloaded 22. Skipped 0. Failed 55.
DOWNLOADED: image - Far_Cry_5_CUSA05848.pkg (CUSA05848)
FAILED: thumbnail - Example_PPSA12345.pkg
```

If one source is slow, times out, or fails, the app marks that item as skipped/failed and moves to the next missing image instead of stopping the whole scan.

## Cover search order

The **Download missing covers** button searches in this order:

1. GitHub cover map
2. PlayStation Store by title ID
3. SerialStation by title ID
4. ORBISPatches by CUSA
5. Content ID lookup
6. SerialStation title search
7. PlayStation Store title search

The search engine checks for these title ID formats:

```text
CUSAxxxxx
PPSAxxxxx
SLUSxxxxx
SCUSxxxxx
SCESxxxxx
SLESxxxxx
SLPSxxxxx
SLPMxxxxx
NPUJxxxxx
NPUIxxxxx
NPEFxxxxx
NPUGxxxxx
NPEGxxxxx
NPUBxxxxx
NPEBxxxxx
NPHGxxxxx
ULUSxxxxx
ULESxxxxx
UCUSxxxxx
UCESxxxxx
```

Notes:

- `CUSAxxxxx` is used for PS4 titles.
- `PPSAxxxxx` is used for PS5 titles.
- Older PlayStation IDs such as `SLUSxxxxx`, `SCUSxxxxx`, and `SCESxxxxx` are used for legacy/converted packages.
- Not every package has a public cover source, so some covers may remain missing.

## Environment variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Web server port inside the container | `7777` |
| `LOCALIP` | IP or hostname that consoles can reach to download PKGs from this server | `192.168.1.202` |
| `PUBLIC_BASE_URL` | Public base URL used when building install URLs | `http://192.168.1.202:7777` |
| `PS4IP` | PS4 package installer IP address | `192.168.1.109` |
| `PS5IP` | PS5 IP address | `192.168.1.110` |
| `PS4_PKG_DIR` | Path to PS4 package library inside the container | `/pkg_sender/PS4Games` |
| `PS5_PKG_DIR` | Path to PS5 package library inside the container | `/pkg_sender/PS5Games` |
| `PKG_DIR` | Legacy/default package library path; still supported | `/pkg_sender/PS4Games` |
| `STATIC_FILES` | Legacy fallback for older configs; still supported | `/pkg_sender/PS4Games` |
| `PS5_ELF_PORT` | PS5 ELF loader port | `9021` |
| `PS5_DPI_PORT` | etaHEN Direct PKG Installer port | `9090` |
| `PS5_DPI_WEB_PORT` | etaHEN WebUI port | `12800` |
| `PS5_RELAPSE_DIR` | Local Relapse files path inside the container | `/pkg_sender/src/public/ps5-relapse` |
| `PS5_TCP_TIMEOUT_MS` | Timeout for PS5 TCP requests | `30000` |
| `PS5_PAYLOAD_LIMIT` | Maximum upload size for ELF/BIN payloads | `200mb` |
| `COVER_MAP_URL` | Optional JSON cover map URL | `https://raw.githubusercontent.com/hmn/ps4-imagemap/master/games.json` |
| `COVER_STORE_REGIONS` | PlayStation Store regions to try | `DK/da,GB/en,US/en,DE/de,SE/sv,NO/no` |
| `COVER_SEARCH_REGIONS` | Regions used for title search | `DK/da,GB/en,US/en,DE/de,SE/sv,NO/no` |
| `COVER_ENABLE_ORBISPATCHES` | Enable ORBISPatches as fallback for CUSA titles | `true` |
| `COVER_FETCH_TIMEOUT_MS` | Timeout for each external cover-source request in milliseconds | `7000` |
| `COVER_ITEM_TIMEOUT_MS` | Maximum time spent on one missing image/thumbnail before moving to the next item | `45000` |

Example `.env`:

```env
PORT=7777
LOCALIP=192.168.1.202
PUBLIC_BASE_URL=http://192.168.1.202:7777

PS4IP=192.168.1.109
PS5IP=192.168.1.110

PS4_PKG_DIR=/pkg_sender/PS4Games
PS5_PKG_DIR=/pkg_sender/PS5Games
PKG_DIR=/pkg_sender/PS4Games
STATIC_FILES=/pkg_sender/PS4Games

PS5_ELF_PORT=9021
PS5_DPI_PORT=9090
PS5_DPI_WEB_PORT=12800
PS5_RELAPSE_DIR=/pkg_sender/src/public/ps5-relapse
PS5_TCP_TIMEOUT_MS=30000
PS5_PAYLOAD_LIMIT=200mb

COVER_STORE_REGIONS=DK/da,GB/en,US/en,DE/de,SE/sv,NO/no
COVER_SEARCH_REGIONS=DK/da,GB/en,US/en,DE/de,SE/sv,NO/no
COVER_ENABLE_ORBISPATCHES=true
COVER_FETCH_TIMEOUT_MS=4000
COVER_ITEM_TIMEOUT_MS=20000
```

## Docker Compose example

Example service:

```yaml
services:
  pkgsender:
    build:
      context: ./pkgsender
      dockerfile: Dockerfile
    image: pkgsender:latest
    container_name: pkgsender
    restart: unless-stopped
    hostname: pkgsender
    networks:
      DockerNet:
        ipv4_address: 192.168.1.202
      Proxy:
    volumes:
      - /srv/dev-disk-by-uuid-1e475b37-0545-4435-87c9-c7b04fe4843b/Playstation/PS4/Games/:/pkg_sender/PS4Games
      - /srv/dev-disk-by-uuid-1e475b37-0545-4435-87c9-c7b04fe4843b/Playstation/PS5/Games/:/pkg_sender/PS5Games
      - /srv/dev-disk-by-uuid-2d63569d-15a7-41a3-8009-e9b487095e11/dockercompose/dockerfiles/pkgsender/src:/pkg_sender/src
    ports:
      - 7777:7777
    environment:
      - PORT=7777
      - PS4_PKG_DIR=/pkg_sender/PS4Games
      - PS5_PKG_DIR=/pkg_sender/PS5Games
      - PKG_DIR=/pkg_sender/PS4Games
      - STATIC_FILES=/pkg_sender/PS4Games
      - LOCALIP=192.168.1.202
      - PUBLIC_BASE_URL=http://192.168.1.202:7777
      - PS4IP=192.168.1.109
      - PS5IP=192.168.1.110
      - PS5_ELF_PORT=9021
      - PS5_DPI_PORT=9090
      - PS5_DPI_WEB_PORT=12800
      - PS5_RELAPSE_DIR=/pkg_sender/src/public/ps5-relapse
      - PS5_TCP_TIMEOUT_MS=30000
      - COVER_MAP_URL=https://raw.githubusercontent.com/hmn/ps4-imagemap/master/games.json
      - COVER_STORE_REGIONS=DK/da,GB/en,US/en,DE/de,SE/sv,NO/no
      - COVER_FETCH_TIMEOUT_MS=4000
      - COVER_ITEM_TIMEOUT_MS=20000
    labels:
      traefik.enable: true
      traefik.http.routers.pkgsender-secure.entrypoints: websecure
      traefik.http.routers.pkgsender-secure.rule: Host(`pkgsender.kekec.dk`)
      traefik.http.routers.pkgsender-secure.tls: true
      traefik.http.routers.pkgsender-secure.tls.certresolver: http
      traefik.docker.network: Proxy
      traefik.http.services.pkgsender.loadbalancer.server.port: 7777
      traefik.http.routers.pkgsender-secure.middlewares: auth@file

networks:
  DockerNet:
    external: true
  Proxy:
    external: true
```

## Relapse files

The app serves local Relapse files from:

```text
src/public/ps5-relapse/
```

Clone or update Relapse on the host:

```bash
PKGSENDER_DIR=/srv/dev-disk-by-uuid-2d63569d-15a7-41a3-8009-e9b487095e11/dockercompose/dockerfiles/pkgsender

cd "$PKGSENDER_DIR/src/public"

rm -rf ps5-relapse
git clone https://github.com/ntfargo/Relapse-Exploit.git ps5-relapse
```

Then restart the container:

```bash
docker restart pkgsender
```

From the PS5 browser, open:

```text
http://192.168.1.202:7777/ps5/relapse/
```

or, through Traefik if your PS5 can access it:

```text
https://pkgsender.kekec.dk/ps5/relapse/
```

## Install flow

### PS4 install flow

1. Open `/ps4`.
2. Confirm the PS4 IP address.
3. Click **Install** on a package.
4. The app sends a direct install request to the PS4 package installer.
5. The PS4 downloads the package from this server.

### PS5 install flow

1. Open `/ps5/tools`.
2. Open the Relapse host on the PS5 browser.
3. Run Relapse / etaHEN on the PS5.
4. Make sure etaHEN Direct PKG Installer is active.
5. Open `/ps5`.
6. Confirm the PS5 IP address.
7. Click **Install** on a package.
8. The app sends the package URL to etaHEN Direct PKG Installer.
9. The PS5 downloads the package from this server.

The PS5 must be able to reach the `PUBLIC_BASE_URL`.

Example:

```text
http://192.168.1.202:7777/pkgfiles/ps5/Game.pkg
```

## Rebuild and restart

Because the compose file bind-mounts `src`:

```text
/srv/.../pkgsender/src:/pkg_sender/src
```

changes to these files normally only require a restart:

```text
src/app.js
src/views/index.html
src/views/css/style.css
```

Restart:

```bash
docker restart pkgsender
```

A rebuild is only needed when changing:

```text
Dockerfile
package.json
node_modules
```

Full rebuild:

```bash
cd /srv/dev-disk-by-uuid-2d63569d-15a7-41a3-8009-e9b487095e11/dockercompose/dockerfiles

docker-compose -f dockerfiles.yml --env-file dockerfiles.env up -d --build --force-recreate pkgsender
```

## Validation

Check logs:

```bash
docker logs --tail=80 pkgsender
```

Check app syntax:

```bash
docker exec -it pkgsender sh -lc 'node --check /pkg_sender/src/app.js'
```

Check routes:

```bash
curl -I http://192.168.1.202:7777/
curl -I http://192.168.1.202:7777/ps4
curl -I http://192.168.1.202:7777/ps5
curl -I http://192.168.1.202:7777/ps5/tools
curl -I http://192.168.1.202:7777/ps5/relapse/
curl http://192.168.1.202:7777/api/ps5/info
```

Check missing covers for PS4:

```bash
curl "http://192.168.1.202:7777/api/covers/missing?console=ps4"
```

Check missing covers for PS5:

```bash
curl "http://192.168.1.202:7777/api/covers/missing?console=ps5"
```

Check that the split package folders are mounted:

```bash
docker exec -it pkgsender sh -lc '
echo "--- PS4Games ---"
find /pkg_sender/PS4Games -maxdepth 2 -type f -iname "*.pkg" | head

echo "--- PS5Games ---"
find /pkg_sender/PS5Games -maxdepth 2 -type f -iname "*.pkg" | head
'
```

## Troubleshooting

### `/ps5` does not show PS5 packages

Check that the PS5 volume is mounted:

```bash
docker exec -it pkgsender sh -lc 'ls -la /pkg_sender/PS5Games'
```

Check the environment:

```bash
docker exec -it pkgsender sh -lc 'env | grep -E "PS4_PKG_DIR|PS5_PKG_DIR|PKG_DIR|STATIC_FILES"'
```

### PS5 package image is missing

First, check missing covers using the PS5 console parameter:

```bash
curl "http://192.168.1.202:7777/api/covers/missing?console=ps5"
```

Then click **Download missing covers** from the `/ps5` page.

For PS5 titles, filenames should ideally include a `PPSAxxxxx` title ID when possible. Example:

```text
Astro_Bot_PPSA21497.pkg
```

### Direct PS5 PKGs show as `Root`

Update to the version that uses the filename as the virtual folder name for direct-root packages.

Expected behavior:

```text
/pkg_sender/PS5Games/God of war - sons of sparta.pkg
```

shows as:

```text
PS5 / God of war - sons of sparta
```

### PS5 install request fails

Check that etaHEN Direct PKG Installer is listening:

```bash
nc -vz 192.168.1.110 9090
```

Check that the PS5 can open the server URL:

```text
http://192.168.1.202:7777/
```

Check the PS5 info endpoint:

```bash
curl http://192.168.1.202:7777/api/ps5/info
```

### Relapse page is missing

Check the folder:

```bash
docker exec -it pkgsender sh -lc 'ls -la /pkg_sender/src/public/ps5-relapse | head'
```

If it is missing, clone it again:

```bash
PKGSENDER_DIR=/srv/dev-disk-by-uuid-2d63569d-15a7-41a3-8009-e9b487095e11/dockercompose/dockerfiles/pkgsender

cd "$PKGSENDER_DIR/src/public"

rm -rf ps5-relapse
git clone https://github.com/ntfargo/Relapse-Exploit.git ps5-relapse

docker restart pkgsender
```

### Live debug seems stuck on one item

A cover source can sometimes respond slowly or hang. Lower these values for faster testing:

```env
COVER_FETCH_TIMEOUT_MS=4000
COVER_ITEM_TIMEOUT_MS=20000
```

`COVER_FETCH_TIMEOUT_MS` controls each external HTTP request.

`COVER_ITEM_TIMEOUT_MS` controls the total maximum time spent on one missing image or thumbnail before the app moves to the next item.
