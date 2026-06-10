# VideoLoop

A self-hosted, vertical "TikTok-style" media feed for photos and videos stored
on an SMB share. Built with Next.js, packaged as a single Docker container.

## Features

- **Web-based** vertical swipe feed, optimized for mobile, usable on desktop.
- **Username/password login** with a "Remember me" option (30-day session).
- **Multiple feeds** — every top-level folder under the media root is a feed.
- **Multiple SMB shares** — mount as many shares as you like; each becomes a feed.
- **Optional per-feed passwords** — lock a feed with an env var; unlock per session.
- **Admin user management** — admins can add and remove accounts from the app.
- **Installable PWA** — add to home screen on iOS/Android for a full-screen app.
- **Supported formats** — `.mp4`, `.webm`, `.mov`, `.m4v` (video) and
  `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif` (images).
- **Range-request streaming** for fast seeking and progressive video load.
- **Lazy loading** — items page in as you scroll.
- **Favorites** (no comments) with a dedicated Favorites feed.
- **Per-user auto-play** setting — advance to the next clip when a video ends.

## How it works

The SMB share is mounted into the container at `MEDIA_ROOT` (default `/media`)
by Docker. The app reads files directly from that path — it does not speak SMB
itself. Each immediate subfolder of `MEDIA_ROOT` becomes a feed; media is
discovered recursively within each feed.

User accounts, favorites, and settings are stored in a SQLite database on a
persistent volume.

## Quick start

1. Copy `.env.example` to `.env` and fill in the values:

   ```sh
   cp .env.example .env
   # set SESSION_SECRET (openssl rand -hex 32), ADMIN_USER/ADMIN_PASSWORD,
   # and the SMB_* connection details.
   ```

2. Start it:

   ```sh
   docker compose up -d --build
   ```

3. Open `http://localhost:3000` and sign in with your admin credentials.

The first boot creates the admin user from `ADMIN_USER` / `ADMIN_PASSWORD`.

## Adding more users

Sign in as the admin, go to **Settings → Manage users**, and add accounts.
You can mark a new account as an administrator (able to manage users too).
The seeded admin from `ADMIN_USER` is created only on first boot.

## Feeds and multiple SMB shares

By default, every top-level folder under `MEDIA_ROOT` (`/media`) is a feed, and
media inside a feed is discovered recursively.

### Choosing specific folders as feeds (`FEEDS`)

To pick exactly which folders become feeds — and to point a feed at a
**subfolder** instead of a whole share — set the `FEEDS` env var. It's a
comma-separated list of `Display Name:relative/path` entries, where the path is
relative to `MEDIA_ROOT`:

```sh
# Expose only two subfolders of the "main" share, skipping everything else
# (e.g. a Movies folder full of unsupported .mkv files):
FEEDS=Short Films:main/ShortFilms,Funny Clips:main/Funny
```

Each entry's display name is what shows in the app (and is used for per-feed
passwords). When `FEEDS` is unset, auto-discovery is used. This also hides
noise like the host's `cdrom`/`floppy`/`usb` mount points that can appear under
`/media`.

To use **multiple SMB shares**, mount each share into its own subfolder of
`/media`. The provided `docker-compose.yml` mounts two (`media_main` →
`/media/main`, `media_family` → `/media/family`); copy a block to add more.
Each mounted share shows up as one feed.

Want a share's *subfolders* to each be their own feed instead of one big feed?
Mount a subpath of the share directly — e.g. set `SMB_SHARE=media/vacation` so
`/media/vacation` becomes the "vacation" feed — and add one mount per folder.

## Installing as an app (PWA)

Open the site in a mobile browser and use **Add to Home Screen** (Share menu on
iOS Safari, the install prompt/menu on Android Chrome). It launches full-screen
with no browser chrome. Requires serving over HTTPS (or `localhost`) for the
install option to appear.

## Locking a feed

Set an env var named `FEED_PASSWORD_<FEED>`, where `<FEED>` is the folder name
uppercased with non-alphanumeric characters replaced by `_`.

A folder named `private-clips` → `FEED_PASSWORD_PRIVATE_CLIPS=secret`.

Pass it through in `docker-compose.yml` under the service's `environment:`.

## SMB mount

`docker-compose.yml` mounts the share using the built-in `cifs` volume driver:

```yaml
volumes:
  media:
    driver: local
    driver_opts:
      type: cifs
      o: "username=${SMB_USER},password=${SMB_PASSWORD},uid=1001,gid=1001,ro,vers=3.0"
      device: "//${SMB_HOST}/${SMB_SHARE}"
```

`uid=1001/gid=1001` matches the non-root `nextjs` user the container runs as.
Adjust `vers=3.0` if your NAS needs a different SMB protocol version.

The Docker **host** needs CIFS support for this to work (the `cifs-utils`
package and the kernel `cifs` module). On some hosts the `cifs` volume driver
also requires the container to run privileged.

### Simpler alternative: mount on the host

If the `cifs` volume driver gives you trouble, mount the share on the host
yourself and bind-mount the folder into the container. Replace the `media_*`
volumes with bind mounts:

```yaml
    volumes:
      - videoloop-data:/data
      - /mnt/smb/main:/media/main:ro
      - /mnt/smb/family:/media/family:ro
```

…where `/mnt/smb/main` is mounted on the host (e.g. via `/etc/fstab` or your
NAS UI). This is often the easiest route on home setups and on container
managers like Dockge/Portainer/Dockhand, where adding bind-mount paths is
simpler than configuring a CIFS volume driver.

> Tip: when first setting up, run `docker compose up` (without `-d`) from a
> terminal so you can see SMB mount errors directly. Once it works, switch to
> `-d` or import the compose into your container manager.

## Development

```sh
npm install
cp .env.example .env   # set DATABASE_URL=file:./prisma/dev.db and MEDIA_ROOT=./sample-media
npm run db:push
npm run db:seed
npm run dev
```
