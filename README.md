# motionxamon

Local desktop app for downloading public video links. It uses `yt-dlp` to extract media and FFmpeg to merge separate video/audio streams into a single MP4.

## Русский

### Что это

`motionxamon` — локальная программа для сохранения видео по ссылке. Вставляешь ссылку на публичное видео, программа показывает доступные варианты качества и скачивает файл на компьютер.

Поддержка зависит от `yt-dlp`: Instagram, YouTube, TikTok, Pinterest, Vimeo, X/Twitter, Reddit и другие сайты, если ссылка публичная и доступна без обхода ограничений.

### Установка готовой сборки

#### Windows

1. Скачай последний Windows `.exe` из GitHub Actions artifacts или Releases, когда релиз будет опубликован.
2. Запусти `motionxamon <version>.exe`.
3. При первом запуске открой Settings и скачай/обнови `yt-dlp` и FFmpeg, если приложение попросит.
4. Вставь ссылку и нажми download.

#### macOS

1. Скачай macOS `.dmg` или `.zip` из GitHub Actions artifacts или Releases, когда релиз будет опубликован.
2. Если это `.dmg`, открой его и перетащи `motionxamon` в `Applications`.
3. Если macOS покажет предупреждение о разработчике, открой System Settings → Privacy & Security и разреши запуск приложения.
4. При первом запуске открой Settings и скачай/обнови `yt-dlp` и FFmpeg, если приложение попросит.
5. Вставь ссылку и нажми download.

На данный момент приложение не подписано Apple Developer ID, поэтому macOS может требовать ручное разрешение первого запуска.

### Как пользоваться

1. Открой `motionxamon`.
2. Вставь ссылку на видео в поле URL.
3. Нажми кнопку обработки ссылки.
4. Выбери качество/формат.
5. Выбери папку сохранения.
6. Дождись окончания загрузки.

Можно вставлять несколько ссылок списком: приложение поставит их в очередь и скачает пачкой.

### Разработка

Установи зависимости:

```powershell
npm install
npm run setup
```

`setup` скачивает локальные инструменты в `bin/`:

- `yt-dlp.exe`
- `ffmpeg.exe`
- `ffprobe.exe`

Эти бинарники не коммитятся в git. Готовая portable/app сборка тоже не включает их внутрь: приложение умеет скачать/обновить инструменты из Settings в пользовательскую папку.

Запуск локального web-сервера:

```powershell
npm start
```

Открой:

```text
http://localhost:4117
```

Запуск Electron-окна:

```powershell
npm run electron
```

### Сборка

Windows installer:

```powershell
npm run dist:win
```

Windows portable:

```powershell
npm run dist:portable
```

macOS DMG/ZIP:

```bash
npm run dist:mac
```

macOS сборку лучше делать на macOS. В репозитории есть GitHub Actions workflow, который собирает Windows и macOS артефакты на соответствующих runner-ах.

Результаты сборки появляются в:

```text
release/
```

### Ограничения

Приложение предназначено для публичных видео, которые тебе разрешено скачивать. Оно не обходит приватные аккаунты, DRM, paywall, login restrictions и другие ограничения доступа.

## English

### What It Is

`motionxamon` is a local desktop app for saving videos from links. Paste a public video URL, choose an available quality, and download the file to your computer.

Supported sites depend on `yt-dlp`: Instagram, YouTube, TikTok, Pinterest, Vimeo, X/Twitter, Reddit, and many others, as long as the link is public and accessible without bypassing restrictions.

### Installing A Ready Build

#### Windows

1. Download the latest Windows `.exe` from GitHub Actions artifacts or Releases once a release is published.
2. Run `motionxamon <version>.exe`.
3. On first launch, open Settings and download/update `yt-dlp` and FFmpeg if the app asks for them.
4. Paste a video link and press download.

#### macOS

1. Download the macOS `.dmg` or `.zip` from GitHub Actions artifacts or Releases once a release is published.
2. If it is a `.dmg`, open it and drag `motionxamon` into `Applications`.
3. If macOS warns about the developer, open System Settings → Privacy & Security and allow the app to run.
4. On first launch, open Settings and download/update `yt-dlp` and FFmpeg if the app asks for them.
5. Paste a video link and press download.

The app is not currently signed with an Apple Developer ID, so macOS may require manual approval on first launch.

### How To Use

1. Open `motionxamon`.
2. Paste a video URL into the URL field.
3. Process the link.
4. Choose a quality/format.
5. Choose the save folder.
6. Wait for the download to finish.

You can paste multiple links at once: the app will queue them and download them in a batch.

### Development

Install dependencies:

```bash
npm install
npm run setup
```

`setup` downloads local tools into `bin/`:

- `yt-dlp.exe`
- `ffmpeg.exe`
- `ffprobe.exe`

These binaries are intentionally not committed to git. Packaged app builds do not include them either: the app can download/update tools from Settings into the user data folder.

Run the local web server:

```bash
npm start
```

Open:

```text
http://localhost:4117
```

Run the Electron window:

```bash
npm run electron
```

### Building

Windows installer:

```bash
npm run dist:win
```

Windows portable:

```bash
npm run dist:portable
```

macOS DMG/ZIP:

```bash
npm run dist:mac
```

Build macOS artifacts on macOS. This repository includes a GitHub Actions workflow that builds Windows and macOS artifacts on the appropriate runners.

Build outputs are written to:

```text
release/
```

### Limitations

This tool is meant for public videos you are allowed to download. It does not bypass private accounts, DRM, paywalls, platform login restrictions, or other access controls.
