# motionxamon

Local desktop downloader for public video links. It uses `yt-dlp` for extraction and FFmpeg for merging separate video/audio streams into a single MP4.

## Install dependencies

```powershell
npm.cmd install
npm.cmd run setup
```

`setup` downloads local binaries into `bin/` for development:

- `yt-dlp.exe`
- `ffmpeg.exe`
- `ffprobe.exe`

These binaries are intentionally not committed to git.
The packaged portable app does not include them; it can download/update tools from Settings into the user data folder.

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

The portable build includes the app shell and icon. `yt-dlp` and FFmpeg are downloaded from Settings on first use, which keeps the `.exe` smaller and allows updating tools without rebuilding the app.

## Notes

This tool is meant for public videos you are allowed to download. It does not bypass private accounts, DRM, paywalls, platform login restrictions, or other access controls.
