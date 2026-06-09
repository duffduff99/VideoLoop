# VideoLoop

A self-hosted, vertical "TikTok-style" media feed for photos and videos stored
on an SMB share. Built with Next.js, packaged as a single Docker container.

## Features

- **Web-based** vertical swipe feed, optimized for mobile, usable on desktop.
- **Username/password login** with a "Remember me" option (30-day session).
- **Multiple feeds** — each top-level folder on your SMB share is a feed.
- **Optional per-feed passwords** — lock a feed with an env var; unlock per session.
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

## Development

```sh
npm install
cp .env.example .env   # set DATABASE_URL=file:./prisma/dev.db and MEDIA_ROOT=./sample-media
npm run db:push
npm run db:seed
npm run dev
```
