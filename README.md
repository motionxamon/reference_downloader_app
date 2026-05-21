# motionxamon

Local desktop downloader for public video links. It uses `yt-dlp` for extraction and FFmpeg for merging separate video/audio streams into a single MP4.

## Install dependencies

```powershell
npm.cmd install
npm.cmd run setup
```

`setup` downloads local binaries into `bin/`:

- `yt-dlp.exe`
- `ffmpeg.exe`
- `ffprobe.exe`

These binaries are intentionally not committed to git.

## Run locally

```powershell
npm.cmd start
```

Then open:

```text
http://localhost:4117
```

## Build portable Windows app

```powershell
npm.cmd run dist:portable
```

Output:

```text
release/motionxamon <version>.exe
```

The portable build includes `yt-dlp`, FFmpeg, and the app icon.

## Notes

This tool is meant for public videos you are allowed to download. It does not bypass private accounts, DRM, paywalls, platform login restrictions, or other access controls.
