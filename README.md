# VideoLoop

A self-hosted, TikTok-style vertical feed for the photos and videos on your
SMB/NAS shares. Swipe through endless, shuffled feeds from any phone or
desktop browser, and install it to your home screen like an app.

- **Swipe feed**: full-screen and snap-to-item. Shuffled, loops forever, loads lazily.
- **Feeds** come from folders on one or more SMB shares. You can pick
  exactly which folders appear with `FEEDS`.
- **Accounts**: username/password with "Remember me". Admins add and remove users in the app.
- **Favorites** (no comments) in a thumbnail gallery. Video **scrubbing** and hold-to-fast-forward/rewind. Per-user **auto-play next** setting. Optional **private feeds**, hidden until you re-enter your password.
- **Installable PWA**, with mobile-first touch controls and desktop keyboard controls.

---

## Contents

1. [Requirements](#1-requirements)
2. [Get the code](#2-get-the-code)
3. [Configure `.env`](#3-configure-env)
4. [Connect your SMB share](#4-connect-your-smb-share)
5. [Choose your feeds](#5-choose-your-feeds)
6. [First start](#6-first-start)
7. [Sign in and add users](#7-sign-in-and-add-users)
8. [Use it from your phone](#8-use-it-from-your-phone)
9. [Running with Dockhand / Dockge / Portainer](#9-running-with-dockhand--dockge--portainer)
10. [Updating, backups, resetting](#10-updating-backups-resetting)
11. [Troubleshooting](#11-troubleshooting)
12. [Reference](#12-reference)

---

## 1. Requirements

| | |
|---|---|
| **Docker** | Docker Engine 20+ with the Compose plugin (`docker compose version` should work). |
| **An SMB share** | Its host/IP, share name, and a username/password with read access. |
| **Media in browser-friendly formats** | Video: `.mp4` (H.264/AAC is the safest), `.webm`, `.mov`, `.m4v`. Images: `.jpg`, `.png`, `.webp`, `.gif`, `.avif`. See [formats](#supported-formats). |

**Which machine should run it?** Ideally a machine that's always on: a home
server, a NAS that runs Docker, or a mini PC. A laptop works fine for trying it
out. If that laptop is **macOS or Windows (Docker Desktop)**, use the
[host-mount option](#option-b-mount-on-the-host-recommended-for-docker-desktop-nas-and-dockhand)
for SMB, because Docker Desktop usually can't use the built-in CIFS volume driver.

---

## 2. Get the code

```sh
git clone https://github.com/duffduff99/VideoLoop.git
cd VideoLoop
```

> Until the work is merged, it lives on the `claude/keen-faraday-ad1c3e` branch:
> `git checkout claude/keen-faraday-ad1c3e`

---

## 3. Configure `.env`

```sh
cp .env.example .env
```

Open `.env` and set at least these:

| Variable | What to put |
|---|---|
| `SESSION_SECRET` | A long random string. Generate one with `openssl rand -hex 32`. If you change it, everyone is signed out. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | The first admin account. It's created **only on the very first start** (when the database is empty). |
| `SMB_HOST`, `SMB_SHARE`, `SMB_USER`, `SMB_PASSWORD` | Your share (only for [Option A](#option-a-docker-cifs-volume-linux-hosts)). |

Tips for `.env` files:
- No quotes and no trailing spaces: `ADMIN_PASSWORD=changeme`, not `ADMIN_PASSWORD="changeme" `.
- Values can contain spaces: `FEEDS=Short Films:main/ShortFilms` is fine.
- If a password contains `$`, write it as `$$` (Compose treats `$` as a variable).

---

## 4. Connect your SMB share

Inside the container, media is read from **`/media`**. Each share is mounted
into a subfolder of it (for example `/media/main`). You have two ways to do
this. Pick one.

### Option A: Docker CIFS volume (Linux hosts)

This is already set up in `docker-compose.yml`. Docker mounts the share itself
using your `SMB_*` values:

```yaml
    volumes:
      - media_main:/media/main:ro
      - media_secondary:/media/secondary:ro

volumes:
  media_main:
    driver: local
    driver_opts:
      type: cifs
      o: "username=${SMB_USER},password=${SMB_PASSWORD},uid=1001,gid=1001,ro,vers=3.0"
      device: "//${SMB_HOST}/${SMB_SHARE}"
```

- The host needs CIFS support: `sudo apt install cifs-utils` (Debian/Ubuntu)
  or `sudo dnf install cifs-utils` (Fedora).
- **Two shares** are enabled: `media_main` → `/media/main` (`SMB_*` values) and
  `media_secondary` → `/media/secondary` (`SMB2_*` values). They can be on
  different servers with different credentials.
- **Only one share?** Comment out `media_secondary` (both its line under the
  service's `volumes:` and its block under the top-level `volumes:`).
  Otherwise the deploy stops asking for the `SMB2_*` values.
- **A third share?** Uncomment `media_extra` and set the `SMB3_*` values.
- `vers=3.0` works for most NAS devices. Older ones may need `vers=2.1` or `vers=1.0`.
- `uid=1001,gid=1001` matches the user the app runs as. Leave it as is.
- To mount only part of a share, put the path in `SMB_SHARE`, for example
  `SMB_SHARE=media/ShortFilms`.

### Option B: Mount on the host (recommended for Docker Desktop, NAS, and Dockhand)

Mount the share on the host machine yourself, then hand the folder to the
container. This is usually the easiest option, and it's the only one that
reliably works with Docker Desktop.

**Linux host:** create a credentials file and an `/etc/fstab` entry:

```sh
sudo mkdir -p /mnt/smb/main
sudo tee /root/.smb-main >/dev/null <<'EOF'
username=smbuser
password=smbpassword
EOF
sudo chmod 600 /root/.smb-main
echo '//192.168.1.10/media /mnt/smb/main cifs credentials=/root/.smb-main,uid=1001,gid=1001,ro,vers=3.0,nofail 0 0' | sudo tee -a /etc/fstab
sudo mount -a && ls /mnt/smb/main     # you should see your folders
```

**macOS:** in Finder, press ⌘K, connect to `smb://192.168.1.10/media`, and it
appears under `/Volumes/media`. In Docker Desktop, open Settings → Resources →
File sharing and make sure `/Volumes` is allowed.

**Windows:** mapped network drives (like `Z:`) usually **aren't visible** to
Docker Desktop. The most reliable setup is to run VideoLoop on a Linux machine
or NAS. If you need it on Windows, mount the share inside your WSL distro
(`sudo mkdir -p /mnt/smb/main && sudo mount -t drvfs '\\192.168.1.10\media' /mnt/smb/main`),
then run `docker compose` from that WSL shell and use `/mnt/smb/main` as the path below.

Then edit `docker-compose.yml`. Replace the `media_*` volume lines with bind
mounts, and delete the `media_*` blocks under the top-level `volumes:`
(keep `videoloop-data`):

```yaml
    volumes:
      - videoloop-data:/data
      - /mnt/smb/main:/media/main:ro        # Linux / WSL
      # - /Volumes/media:/media/main:ro     # macOS
```

You don't need the `SMB_*` values in `.env` with this option.

---

## 5. Choose your feeds

**Default:** every folder directly under `/media` becomes a feed, and
everything inside it (including subfolders) plays in that feed. With the
compose file above, that gives you one feed per share (e.g. `main`).

**Pick exact folders:** set `FEEDS` in `.env`. Each entry is
`Display Name:path`, separated by commas, and the path is relative to `/media`:

```sh
FEEDS=Short Films:main/ShortFilms,Funny Clips:main/Funny,Short Videos:secondary/Short Videos
```

Only those folders appear, under those names. Everything else (for example
a `Movies` folder full of `.mkv` files) is ignored.

**Private feeds:** list feeds by display name in `PRIVATE_FEEDS`:

```sh
FEEDS=Images:main/Images,Clips:main/Clips
PRIVATE_FEEDS=Clips
```

Private feeds don't appear anywhere (home screen, favorites, or direct links)
until a user goes to **Settings → Private feeds → Show** and re-enters **their
own account password**. They then stay visible for 12 hours (change this with
`PRIVATE_UNLOCK_HOURS`), until the user taps **Hide** (in Settings or the
"Hide private" chip on the home screen), or until they sign out. This is per
device and per user.

> Upgrading from feed passwords? Feeds named in the old `FEED_PASSWORDS` or
> `FEED_PASSWORD_<NAME>` settings are automatically treated as private (the
> old passwords are no longer used), so nothing becomes public by accident.
> Switch to `PRIVATE_FEEDS` when convenient.

---

## 6. First start

The first time, run in the **foreground** so you can watch for problems:

```sh
docker compose up --build
```

A healthy start ends like this:

```
[videoloop] Applying database schema...
[videoloop] Seeding initial data...
[seed] Created initial admin user "admin".
[videoloop] Starting server...
  ▲ Next.js 14.2.18
 ✓ Starting...
 ✓ Ready in ...ms
```

Check that the container can see your media:

```sh
docker compose exec videoloop sh -c "ls /media && find /media -type f | head -20"
```

Once it works, press `Ctrl+C` and run it in the background:

```sh
docker compose up -d
docker compose logs -f videoloop      # follow logs; Ctrl+C stops following, not the app
```

---

## 7. Sign in and add users

1. Open **http://localhost:3000** on the machine running it, or
   `http://<that machine's IP>:3000` from another device.
2. Sign in with `ADMIN_USER` / `ADMIN_PASSWORD`.
3. Go to **Settings (gear icon) → Manage users** to add accounts for the rest of
   the household. Tick "Administrator" for anyone who should also manage users.

Each person has their own favorites and their own auto-play setting.

---

## 8. Use it from your phone

**On your home network:** find the server's IP address (`ip addr` on Linux,
`ipconfig` on Windows, System Settings → Network on macOS) and open
`http://192.168.x.x:3000` on your phone.

**Install it as an app:** the install option only appears when the site is
served over **HTTPS**. The browser rule is HTTPS or `localhost`, and a phone
can't use `localhost`. Two easy ways to get HTTPS at home:

- **Tailscale** (easiest, and also works away from home): install Tailscale on
  the server and your phone, then on the server run
  `tailscale serve --bg 3000`. Open the `https://<machine>.<tailnet>.ts.net`
  address it prints.
- **A reverse proxy** such as Caddy, Nginx Proxy Manager, or Traefik in front
  of port 3000. Example `Caddyfile`:
  ```
  videoloop.example.com {
      reverse_proxy localhost:3000
  }
  ```

Then:
- **iPhone (Safari):** Share button → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Install app** (or **Add to Home screen**).

It opens full-screen with no browser bars.

**Controls**

| | Phone | Desktop |
|---|---|---|
| Next / previous | Swipe up / down | ↓ / ↑, J / K, Page Down / Page Up, mouse wheel |
| Pause / play | Tap | Space |
| Fast-forward / rewind (2×) | Press and hold the right / left side of a video | |
| Jump to a point | Drag the progress bar at the bottom | Click/drag the progress bar, ← / → skip 5s |
| Favorite | Double-tap or ♥ | F |
| Mute | Speaker icon (top right) | M |
| Back to feeds | ‹ (top left) | Esc |

Sound starts **on**. Some phones block sound until you've tapped the page once.
In that case the first clip starts muted, and the speaker icon shows it.

---

## 9. Running with Dockhand / Dockge / Portainer

These tools run the same `docker-compose.yml`. A `.env` file is **not**
required: `.env` is deliberately left out of Git (it holds passwords), so a
stack deployed from the Git repository won't have one. Enter the settings in
the manager's environment-variables section instead.

**Dockhand, deploying from Git:**

1. Create a stack from the Git repository
   (`https://github.com/duffduff99/VideoLoop.git`, branch
   `claude/keen-faraday-ad1c3e` until it's merged), with compose file
   `docker-compose.yml`.
2. In the stack's **environment variables**, add:

   | Variable | Example |
   |---|---|
   | `SESSION_SECRET` | output of `openssl rand -hex 32` **(required)** |
   | `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / something strong |
   | `SMB_HOST` / `SMB_SHARE` / `SMB_USER` / `SMB_PASSWORD` | `192.168.1.10` / `media` / ... |
   | `HOST_PORT` *(optional)* | `8080` if 3000 is taken (default `3000`) |
   | `FEEDS` *(optional)* | `Short Films:main/ShortFilms` |
   | `PRIVATE_FEEDS` *(optional)* | `Short Films` |

3. Deploy. The first deploy **builds** the image on the server, which takes a
   few minutes. Then check the stack's logs for the
   [healthy start lines](#6-first-start).

Notes:
- **Private feeds:** set `PRIVATE_FEEDS` in the stack's variables. It's
  passed through by `docker-compose.yml`, so no `.env` file is needed.
- **SMB mount errors** are easiest to read from a terminal on the server
  (`docker compose up` in the stack folder). If the CIFS volume fights you,
  switch to the [host mount](#option-b-mount-on-the-host-recommended-for-docker-desktop-nas-and-dockhand).
- **Updating:** redeploy/pull the stack in the manager. It rebuilds from the
  latest commit on the branch.

---

## 10. Updating, backups, resetting

**Update to the latest code**

```sh
git pull
docker compose build --no-cache
docker compose up -d
```

Accounts and favorites are kept. They live in the `videoloop-data` volume,
not in the image.

**Back up accounts and favorites**

```sh
docker compose cp videoloop:/data/videoloop.db ./videoloop-backup.db
```

**Forgot the admin password?** Add `ADMIN_RESET_PASSWORD=true` to `.env` and
run `docker compose up -d`. The admin account is reset to `ADMIN_PASSWORD`, and
other users and favorites are kept. **Remove the line afterwards.**

**Start completely fresh** (deletes all users and favorites):

```sh
docker compose down -v
docker compose up -d
```

After a fresh start, sign out and back in on each device, since the old login
cookies point to users that no longer exist.

---

## 11. Troubleshooting

Start with the logs. They almost always name the problem:

```sh
docker compose logs --tail=100 videoloop
```

| Symptom | Likely cause and fix |
|---|---|
| Container keeps **restarting** | Read the logs. If it fails right at start with `mount error` / `cifs` / `Host is down` / `Permission denied`, the SMB mount failed: check host/share/credentials, try another `vers=`, install `cifs-utils`, or switch to [Option B](#option-b-mount-on-the-host-recommended-for-docker-desktop-nas-and-dockhand). |
| `env file .../.env not found` when deploying | You're on an old `docker-compose.yml`. Pull the latest code: `.env` is now optional, and settings can come from your container manager's environment variables ([section 9](#9-running-with-dockhand--dockge--portainer)). |
| `required variable SESSION_SECRET is missing a value` | Set `SESSION_SECRET` in `.env` or in your manager's environment variables. |
| `required variable SMB2_HOST is missing a value` (or another `SMB2_*`) | The secondary share is enabled. Set its `SMB2_*` values, or comment `media_secondary` out if you only have one share ([Option A](#option-a-docker-cifs-volume-linux-hosts)). |
| Logs mention **Prisma / OpenSSL / engines** | You're running an old image. Run `git pull` and `docker compose build --no-cache`. |
| **"Invalid username or password"** with the `.env` credentials | The admin is only created when the database is empty. Check `docker compose logs videoloop \| grep seed`. If it says "Users already exist", use `ADMIN_RESET_PASSWORD=true` ([section 10](#10-updating-backups-resetting)). Usernames are case-sensitive. |
| Sign-in works on the server but **the phone keeps returning to the login page** | Make sure you're on the latest code (older builds set an HTTPS-only cookie). If you're behind HTTPS, check that the proxy sends `X-Forwarded-Proto`, or set `COOKIE_SECURE=true`. |
| Favorites fail / you're bounced to login | Your browser has a login cookie from before a database reset. Sign out and back in. |
| Home screen shows odd feeds like `cdrom`, `floppy`, `usb` | Those are empty folders built into the Alpine base image. Fixed in the current image, so rebuild/redeploy. `FEEDS` also hides them ([section 5](#5-choose-your-feeds)). |
| A feed opens but shows **nothing** | No supported files in it. Run the `find /media ...` command from [step 6](#6-first-start) and check the extensions. iPhone `.heic` photos and `.mkv`/`.avi` videos are skipped. |
| A video sometimes sits at 0:00 or freezes | The player now shows a spinner while buffering and automatically reloads a video that makes no progress for ~4 seconds. If one particular file keeps doing it, it's probably an MP4 with its index at the end, which forces extra round-trips to the share. Fix it without re-encoding: `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` |
| Video shows black or won't play | The codec isn't browser-friendly (for example HEVC/H.265 in some browsers). Re-encode to H.264 MP4: `ffmpeg -i in.mov -c:v libx264 -c:a aac -movflags +faststart out.mp4` |
| No "Install app" / "Add to Home Screen" option | It needs HTTPS ([section 8](#8-use-it-from-your-phone)). |
| Port 3000 already in use | Set `HOST_PORT` (e.g. `HOST_PORT=8080`) in `.env` or your manager's environment variables, redeploy, and open port 8080 instead. |

---

## 12. Reference

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SESSION_SECRET` | *(required)* | Signs login cookies. |
| `HOST_PORT` | `3000` | Port on the host to reach the app at. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / `changeme` | First admin account (created on first start). |
| `ADMIN_RESET_PASSWORD` | *(unset)* | `true` resets the admin password on start. Remove it after use. |
| `FEEDS` | *(auto)* | `Name:path,Name:path` list of feeds, with paths relative to `/media`. |
| `PRIVATE_FEEDS` | *(unset)* | Comma-separated feed names hidden until revealed in Settings (see [section 5](#5-choose-your-feeds)). |
| `PRIVATE_UNLOCK_HOURS` | `12` | How long private feeds stay visible after revealing. |
| `MEDIA_ROOT` | `/media` | Where media is read from inside the container. |
| `DATABASE_URL` | `file:/data/videoloop.db` | SQLite database location. |
| `COOKIE_SECURE` | *(auto)* | Force the cookie `Secure` flag on or off. Normally auto-detected. |
| `SMB_*`, `SMB2_*`, ... | | Share details for the [CIFS volumes](#option-a-docker-cifs-volume-linux-hosts) in `docker-compose.yml`. |

### Supported formats

| Type | Extensions | Notes |
|---|---|---|
| Video | `.mp4`, `.m4v`, `.webm`, `.mov`, `.ogv` | H.264/AAC `.mp4` plays everywhere. `.mov` and HEVC depend on the browser. |
| Image | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif` | `.heic` isn't supported by browsers. |

Hidden files and folders (names starting with `.`) are ignored.

### Development

```sh
npm install
cp .env.example .env    # set DATABASE_URL=file:./dev.db and MEDIA_ROOT=./sample-media
npm run db:push && npm run db:seed
npm run dev             # http://localhost:3000
```

`node scripts/generate-icons.js` regenerates the app icons.
