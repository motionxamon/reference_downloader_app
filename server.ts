import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cp, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import https from "node:https";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

type Platform = "instagram" | "youtube" | "pinterest" | "vimeo" | "tiktok" | "reddit" | "twitter" | "vk" | "yandex" | "dailymotion" | "twitch" | "unknown";

type Job = {
  id: string;
  url: string;
  formatId: string;
  progress: number;
  speed: string;
  eta: string;
  output: string;
  outputDir: string;
  status: "queued" | "running" | "done" | "error" | "canceled";
  logs: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
  child?: ChildProcessWithoutNullStreams;
};

const appRoot = process.env.MOTIONXAMON_APP_ROOT || process.cwd();
const toolsDir = process.env.MOTIONXAMON_TOOLS_DIR || path.join(appRoot, "bin");
const toolsManifestPath = path.join(toolsDir, "tools-manifest.json");
const app = express();
const port = Number(process.env.PORT || 4117);
const defaultDownloadsDir = process.env.MOTIONXAMON_DEFAULT_DOWNLOADS_DIR || path.join(appRoot, "downloads");
let currentDownloadsDir = defaultDownloadsDir;
const allowedDownloadDirs = new Set<string>([defaultDownloadsDir]);
const jobs = new Map<string, Job>();
const pendingJobs: Job[] = [];
let activeDownloads = 0;

const downloadSettings = {
  maxConcurrentDownloads: clampNumber(Number(process.env.MOTIONXAMON_MAX_DOWNLOADS || 2), 1, 6),
  rateLimit: "",
  concurrentFragments: 1,
  retries: 10
};

mkdirSync(defaultDownloadsDir, { recursive: true });
mkdirSync(toolsDir, { recursive: true });

app.use(express.json({ limit: "1mb" }));
app.use("/downloads", express.static(defaultDownloadsDir));

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sanitizeRateLimit(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+(?:\.\d+)?[KMG]?$/i.test(text)) return text.toUpperCase();
  throw new Error("Лимит скорости должен быть пустым или в формате 500K, 2M, 1G.");
}

function isSupportedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function detectPlatform(value: string): Platform {
  if (/youtube\.com|youtu\.be|shorts/i.test(value)) return "youtube";
  if (/vimeo\.com/i.test(value)) return "vimeo";
  if (/pinterest\.com|pin\.it|pinimg\.com/i.test(value)) return "pinterest";
  if (/instagram\.com/i.test(value)) return "instagram";
  if (/tiktok\.com/i.test(value)) return "tiktok";
  if (/reddit\.com|redd\.it/i.test(value)) return "reddit";
  if (/(twitter\.com|x\.com)/i.test(value)) return "twitter";
  if (/(vk\.com|vkvideo\.ru)/i.test(value)) return "vk";
  if (/(yandex\.[a-z.]+\/video|yandex\.[a-z.]+\/efir)/i.test(value)) return "yandex";
  if (/dailymotion\.com|dai\.ly/i.test(value)) return "dailymotion";
  if (/twitch\.tv/i.test(value)) return "twitch";
  return "unknown";
}

function platformFromExtractor(extractor?: string, fallback: Platform = "unknown"): Platform {
  const value = String(extractor || "").toLowerCase();
  if (value.includes("youtube")) return "youtube";
  if (value.includes("vimeo")) return "vimeo";
  if (value.includes("pinterest")) return "pinterest";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("reddit")) return "reddit";
  if (value.includes("twitter") || value === "x") return "twitter";
  if (value === "vk" || value.startsWith("vk:")) return "vk";
  if (value.includes("yandex")) return "yandex";
  if (value.includes("dailymotion")) return "dailymotion";
  if (value.includes("twitch")) return "twitch";
  return fallback;
}

function isDirectVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return /\.(mp4|mov|m4v|webm)(?:$|\?)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function titleFromUrl(value: string) {
  try {
    const url = new URL(value);
    const basename = decodeURIComponent(path.basename(url.pathname));
    return basename || "Direct video file";
  } catch {
    return "Direct video file";
  }
}

function localYtDlpCandidates() {
  return [
    process.env.YT_DLP_PATH,
    path.join(toolsDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"),
    path.join(appRoot, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"),
    path.join(appRoot, "node_modules", ".bin", process.platform === "win32" ? "yt-dlp.cmd" : "yt-dlp")
  ].filter(Boolean) as string[];
}

function resolveYtDlp() {
  for (const candidate of localYtDlpCandidates()) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue;
    return candidate;
  }
  return null;
}

function localFfmpegCandidates() {
  return [
    process.env.FFMPEG_PATH,
    path.join(toolsDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
    path.join(appRoot, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
  ].filter(Boolean) as string[];
}

function resolveFfmpeg() {
  for (const candidate of localFfmpegCandidates()) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue;
    return candidate;
  }
  return null;
}

function getToolVersion(command: string | null, args: string[]) {
  if (!command) return "";
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    return output.split(/\r?\n/)[0] || "";
  } catch {
    return "";
  }
}

type ToolManifest = Record<string, { latestTag?: string; installedAt?: string }>;
type ToolDefinition = {
  name: string;
  target: string;
  url: string;
  latestApi?: string;
  assetPattern?: RegExp;
  zipEntries?: string[];
};

function readToolsManifest(): ToolManifest {
  try {
    return JSON.parse(readFileSync(toolsManifestPath, "utf8"));
  } catch {
    return {};
  }
}

function writeToolsManifest(manifest: ToolManifest) {
  mkdirSync(toolsDir, { recursive: true });
  writeFileSync(toolsManifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "motionxamon"
      }
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => {
        if ((response.statusCode || 0) >= 400) {
          reject(new Error(`GitHub API returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
    request.setTimeout(8000, () => {
      request.destroy(new Error("GitHub API timeout"));
    });
  });
}

async function latestToolInfo(tool: Pick<ToolDefinition, "latestApi" | "assetPattern">) {
  if (!tool.latestApi) return { tagName: "", assetUrl: "" };
  try {
    const release = await fetchJson(tool.latestApi);
    const asset = Array.isArray(release.assets) && tool.assetPattern
      ? release.assets.find((item: any) => tool.assetPattern?.test(String(item.name || "")))
      : undefined;

    return {
      tagName: String(release.tag_name || "").trim(),
      assetUrl: String(asset?.browser_download_url || "").trim()
    };
  } catch {
    return { tagName: "", assetUrl: "" };
  }
}

const toolDefinitions: ToolDefinition[] = process.platform === "win32"
  ? [
      {
        name: "yt-dlp",
        target: path.join(toolsDir, "yt-dlp.exe"),
        url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
        latestApi: "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
        assetPattern: /^yt-dlp\.exe$/i
      },
      {
        name: "ffmpeg",
        target: path.join(toolsDir, "ffmpeg.exe"),
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip",
        latestApi: "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest",
        assetPattern: /^ffmpeg-.*-win64-gpl\.zip$/i,
        zipEntries: ["ffmpeg.exe", "ffprobe.exe"]
      }
    ]
  : [
      {
        name: "yt-dlp",
        target: path.join(toolsDir, "yt-dlp"),
        url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
        latestApi: "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
        assetPattern: /^yt-dlp$/i
      }
    ];

async function toolsStatus() {
  const ytDlp = resolveYtDlp();
  const ffmpeg = resolveFfmpeg();
  const manifest = readToolsManifest();
  const toolStatuses = await Promise.all(toolDefinitions.map(async (tool) => {
    const installed = existsSync(tool.target);
    const latest = await latestToolInfo(tool);
    const latestTag = latest.tagName;
    const version = tool.name === "yt-dlp"
      ? getToolVersion(ytDlp, ["--version"])
      : getToolVersion(ffmpeg, ["-version"]).replace(/^ffmpeg version\s+/i, "");
    const installedTag = tool.name === "yt-dlp" ? version : manifest[tool.name]?.latestTag || "";
    const upToDate = installed && latestTag ? installedTag === latestTag : false;
    const updateAvailable = installed && latestTag ? installedTag !== latestTag : false;

    return {
      name: tool.name,
      path: tool.target,
      installed,
      version,
      installedTag,
      latestTag,
      upToDate,
      updateAvailable,
      status: !installed ? "missing" : latestTag ? (upToDate ? "ready" : "update") : "unknown"
    };
  }));

  return {
    toolsDir,
    ytDlp,
    ffmpeg,
    ready: Boolean(ytDlp) && (process.platform !== "win32" || Boolean(ffmpeg)),
    updateAvailable: toolStatuses.some((tool) => tool.updateAvailable),
    unknown: toolStatuses.some((tool) => tool.status === "unknown"),
    tools: toolStatuses
  };
}

async function installTools(force = false) {
  mkdirSync(toolsDir, { recursive: true });
  const manifest = readToolsManifest();

  for (const tool of toolDefinitions) {
    if (!force && existsSync(tool.target)) continue;
    const latest = await latestToolInfo(tool);
    const latestTag = latest.tagName;
    const downloadUrl = latest.assetUrl || tool.url;

    if ("zipEntries" in tool && tool.zipEntries) {
      await downloadZipTool({ ...tool, url: downloadUrl });
    } else {
      await download(downloadUrl, tool.target);
    }

    manifest[tool.name] = {
      latestTag,
      installedAt: new Date().toISOString()
    };
  }

  writeToolsManifest(manifest);
  return await toolsStatus();
}

async function downloadZipTool(tool: { name: string; target: string; url: string; zipEntries?: string[] }) {
  if (!tool.zipEntries) return;
  const tempDir = await mkdtemp(path.join(tmpdir(), "motionxamon-"));
  const archive = path.join(tempDir, `${tool.name}.zip`);

  try {
    await download(tool.url, archive);
    await expandArchive(archive, tempDir);

    const files = await listFiles(tempDir);
    for (const entry of tool.zipEntries) {
      const found = files.find((file) => path.basename(file).toLowerCase() === entry.toLowerCase());
      if (!found) throw new Error(`${entry} was not found in ${tool.name} archive.`);
      await cp(found, path.join(toolsDir, entry), { force: true });
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function expandArchive(archive: string, destination: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`
    ], { windowsHide: true });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Expand-Archive failed with code ${code}`));
    });
  });
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? await listFiles(fullPath) : [fullPath];
  }));
  return files.flat();
}

function download(source: string, destination: string, redirects = 0): Promise<void> {
  if (redirects > 5) {
    return Promise.reject(new Error(`Too many redirects while downloading ${source}.`));
  }

  return new Promise((resolve, reject) => {
    https.get(source, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
        response.resume();
        const location = new URL(response.headers.location || "", source).toString();
        download(location, destination, redirects + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${source}`));
        return;
      }

      const file = createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    }).on("error", reject);
  });
}

function runYtDlp(args: string[], onData?: (text: string) => void) {
  const command = resolveYtDlp();
  if (!command) {
    throw new Error("yt-dlp не найден. Открой настройки и нажми «Скачать/обновить инструменты».");
  }

  const child = spawn(command, args, {
    cwd: appRoot,
    windowsHide: true,
    shell: process.platform === "win32" && command.endsWith(".cmd")
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    onData?.(text);
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    onData?.(text);
  });

  return {
    child,
    result: new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr.trim() || stdout.trim() || `yt-dlp exited with code ${code}`));
      });
    })
  };
}

function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
}

function normalizeDir(value: string) {
  return path.resolve(value);
}

function resolveDownloadDir(value?: string) {
  if (!value) return currentDownloadsDir;
  const resolved = normalizeDir(value);
  if (!allowedDownloadDirs.has(resolved)) {
    throw new Error("Эта папка не была выбрана через приложение.");
  }
  return resolved;
}

function formatDuration(seconds?: number) {
  if (!seconds) return undefined;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatFileSize(bytes?: number) {
  return formatBytes(bytes) || "размер при скачивании";
}

function formatBitrate(format: any) {
  const value = Number(format.tbr || format.vbr || format.abr || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function uniqueMp4Formats(formats: any[]) {
  const byResolution = new Map<string, any>();

  for (const format of formats) {
    if (format.ext !== "mp4" || !format.height || format.vcodec === "none") continue;
    const key = `${format.height}p-${format.fps || ""}`;
    const current = byResolution.get(key);
    const currentScore = current ? formatBitrate(current) || Number(current.filesize || current.filesize_approx || 0) : 0;
    const nextScore = formatBitrate(format) || Number(format.filesize || format.filesize_approx || 0);

    if (!current || nextScore > currentScore) {
      byResolution.set(key, format);
    }
  }

  return Array.from(byResolution.values())
    .sort((a, b) => (b.height || 0) - (a.height || 0) || formatBitrate(b) - formatBitrate(a))
    .slice(0, 5);
}

async function getRemoteSize(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    const length = Number(response.headers.get("content-length"));
    return Number.isFinite(length) && length > 0 ? length : undefined;
  } catch {
    return undefined;
  }
}

function parseProgress(line: string, job: Job) {
  const percent = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  const speed = line.match(/at\s+([^\s]+\/s)/);
  const eta = line.match(/ETA\s+([^\s]+)/);
  const destination = line.match(/\[download\]\s+Destination:\s+(.+)/);
  const merged = line.match(/\[Merger\]\s+Merging formats into\s+"(.+)"/);

  if (percent) job.progress = Number(percent[1]);
  if (speed) job.speed = speed[1];
  if (eta) job.eta = eta[1];
  if (destination) job.output = destination[1].trim();
  if (merged) job.output = merged[1].trim();
  if (line.includes("has already been downloaded")) job.progress = 100;
}

function newestFileInDir(dir: string) {
  try {
    return readdirSync(dir)
      .map((name) => path.join(dir, name))
      .filter((filePath) => {
        try {
          return statSync(filePath).isFile();
        } catch {
          return false;
        }
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  } catch {
    return undefined;
  }
}

function serializeJob(job: Job) {
  const { child: _child, ...safeJob } = job;
  return safeJob;
}

function cleanError(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/\s+/g, " ")
    .replace(appRoot, ".")
    .trim();
}

function friendlyError(error: unknown, url = "") {
  const message = cleanError(error);
  const platform = detectPlatform(url);

  if (/ffmpeg/i.test(message) && /(not installed|not found|avconv|merg|postprocess)/i.test(message)) {
    return "FFmpeg не найден. Он нужен, чтобы сшивать отдельные видео- и аудиопотоки в один файл. Запусти npm.cmd run setup, затем пересобери приложение.";
  }

  if (platform === "pinterest" && /No video formats found/i.test(message)) {
    return "Pinterest распознан, но по этой ссылке не найден видеопоток. Чаще всего это обычный image pin, карусель без видео или Pinterest не отдает видеоформаты для этого URL. Попробуй открыть сам pin с видео и вставить его полную ссылку, не короткую pin.it.";
  }

  if (/Video unavailable/i.test(message)) {
    return "Видео недоступно для скачивания по этой публичной ссылке. Оно может быть удалено, ограничено по региону или требовать вход на платформу.";
  }

  if (/Requested format is not available/i.test(message)) {
    return "Платформа отдала метаданные, но выбранный формат недоступен. Попробуй вариант \"Лучшее качество\".";
  }

  return message;
}

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: Boolean(resolveYtDlp()),
    ytDlp: resolveYtDlp(),
    ffmpeg: resolveFfmpeg(),
    ffmpegOk: Boolean(resolveFfmpeg()),
    tools: await toolsStatus(),
    downloadsDir: currentDownloadsDir,
    activeDownloads,
    queuedDownloads: pendingJobs.length,
    settings: downloadSettings
  });
});

app.get("/api/settings", (_req, res) => {
  res.json(downloadSettings);
});

app.post("/api/settings", (req, res) => {
  try {
    downloadSettings.maxConcurrentDownloads = clampNumber(Number(req.body?.maxConcurrentDownloads), 1, 6);
    downloadSettings.concurrentFragments = clampNumber(Number(req.body?.concurrentFragments), 1, 8);
    downloadSettings.retries = clampNumber(Number(req.body?.retries), 0, 50);
    downloadSettings.rateLimit = sanitizeRateLimit(req.body?.rateLimit);
    processQueue();
    res.json(downloadSettings);
  } catch (error) {
    res.status(400).json({ error: friendlyError(error) });
  }
});

app.get("/api/tools", async (_req, res) => {
  res.json(await toolsStatus());
});

app.post("/api/tools/install", async (req, res) => {
  try {
    const force = Boolean(req.body?.force);
    res.json(await installTools(force));
  } catch (error) {
    res.status(500).json({ error: friendlyError(error) });
  }
});

app.get("/api/downloads-dir", (_req, res) => {
  res.json({ path: currentDownloadsDir });
});

app.post("/api/select-folder-modern", async (_req, res) => {
  if (process.platform !== "win32") {
    res.status(501).json({ error: "Выбор папки пока реализован только для Windows." });
    return;
  }

  const initialDir = currentDownloadsDir.replace(/'/g, "''");
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
class FileOpenDialog {}

[ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFileOpenDialog
{
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
    void GetResults(out IntPtr ppenum);
    void GetSelectedItems(out IntPtr ppsai);
}

[ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem
{
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, out IntPtr ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
}

public static class ModernFolderPicker
{
    const uint FOS_PICKFOLDERS = 0x00000020;
    const uint FOS_FORCEFILESYSTEM = 0x00000040;
    const uint FOS_PATHMUSTEXIST = 0x00000800;
    const uint FOS_FILEMUSTEXIST = 0x00001000;
    const uint SIGDN_FILESYSPATH = 0x80058000;
    const int ERROR_CANCELLED = unchecked((int)0x800704C7);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        out IShellItem ppv);

    public static string Pick(string initialPath)
    {
        var dialog = (IFileOpenDialog)new FileOpenDialog();
        uint options;
        dialog.GetOptions(out options);
        dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_FILEMUSTEXIST);
        dialog.SetTitle("Выбери папку для сохранения видео");
        dialog.SetOkButtonLabel("Выбрать папку");

        if (!String.IsNullOrWhiteSpace(initialPath) && Directory.Exists(initialPath))
        {
            IShellItem folder;
            var shellItemGuid = typeof(IShellItem).GUID;
            SHCreateItemFromParsingName(initialPath, IntPtr.Zero, shellItemGuid, out folder);
            dialog.SetFolder(folder);
        }

        int hr = dialog.Show(IntPtr.Zero);
        if (hr == ERROR_CANCELLED) return "";
        if (hr != 0) Marshal.ThrowExceptionForHR(hr);

        IShellItem result;
        dialog.GetResult(out result);
        IntPtr pathPtr;
        result.GetDisplayName(SIGDN_FILESYSPATH, out pathPtr);
        try { return Marshal.PtrToStringUni(pathPtr); }
        finally { Marshal.FreeCoTaskMem(pathPtr); }
    }
}
'@
[ModernFolderPicker]::Pick('${initialDir}')
`;

  try {
    const { stdout } = await runProcess("powershell.exe", ["-NoProfile", "-STA", "-Command", script]);
    const selected = stdout.trim();
    if (!selected) {
      res.status(409).json({ canceled: true });
      return;
    }

    const resolved = normalizeDir(selected);
    mkdirSync(resolved, { recursive: true });
    currentDownloadsDir = resolved;
    allowedDownloadDirs.add(resolved);
    res.json({ path: resolved });
  } catch (error) {
    res.status(500).json({ error: friendlyError(error) });
  }
});

app.post("/api/select-folder", async (_req, res) => {
  if (process.platform !== "win32") {
    res.status(501).json({ error: "Выбор папки пока реализован только для Windows." });
    return;
  }

  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = 'Выбери папку для сохранения видео'",
    "$dialog.ShowNewFolderButton = $true",
    `$dialog.SelectedPath = '${currentDownloadsDir.replace(/'/g, "''")}'`,
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.SelectedPath }"
  ].join("; ");

  try {
    const { stdout } = await runProcess("powershell.exe", ["-NoProfile", "-STA", "-Command", script]);
    const selected = stdout.trim();
    if (!selected) {
      res.status(409).json({ canceled: true });
      return;
    }

    const resolved = normalizeDir(selected);
    mkdirSync(resolved, { recursive: true });
    currentDownloadsDir = resolved;
    allowedDownloadDirs.add(resolved);
    res.json({ path: resolved });
  } catch (error) {
    res.status(500).json({ error: friendlyError(error) });
  }
});

app.post("/api/open-folder", (req, res) => {
  if (process.platform !== "win32") {
    res.status(501).json({ error: "Открытие папки пока реализовано только для Windows." });
    return;
  }

  const targetPath = String(req.body?.path || currentDownloadsDir);
  const resolved = path.resolve(targetPath);
  const folder = existsSync(resolved) ? resolved : path.dirname(resolved);

  try {
    if (existsSync(resolved) && path.extname(resolved)) {
      spawn("explorer.exe", [`/select,${resolved}`], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("explorer.exe", [folder], { detached: true, stdio: "ignore" }).unref();
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: friendlyError(error) });
  }
});

app.post("/api/open-file", (req, res) => {
  if (process.platform !== "win32") {
    res.status(501).json({ error: "Открытие файла пока реализовано только для Windows." });
    return;
  }

  const targetPath = String(req.body?.path || "");
  const resolved = path.resolve(targetPath);

  if (!targetPath || !existsSync(resolved) || !statSync(resolved).isFile()) {
    res.status(404).json({ error: "Файл не найден." });
    return;
  }

  try {
    spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Start-Process -LiteralPath '${resolved.replace(/'/g, "''")}'`
    ], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: friendlyError(error) });
  }
});

app.post("/api/process", async (req, res) => {
  const url = String(req.body?.url || "").trim();

  if (!isSupportedUrl(url)) {
    res.status(400).json({ success: false, error: "Вставь корректную http/https ссылку." });
    return;
  }

  try {
    if (isDirectVideoUrl(url)) {
      const platform = detectPlatform(url);
      const size = await getRemoteSize(url);

      res.json({
        success: true,
        title: titleFromUrl(url),
        thumbnail: "",
        platform,
        originalUrl: url,
        formats: [
          {
            id: "direct",
            label: "Прямой видеофайл",
            resolution: /_(\d{3,4})w\./i.test(url) ? `${url.match(/_(\d{3,4})w\./i)?.[1]}w` : "Original",
            size: formatFileSize(size),
            url,
            isReal: true
          }
        ],
        note: "Это прямая ссылка на видеофайл. Ее можно скачивать без анализа страницы Pinterest."
      });
      return;
    }

    const { result } = runYtDlp([
      "--dump-single-json",
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      url
    ]);
    const { stdout } = await result;
    const info = JSON.parse(stdout);
    const platform = platformFromExtractor(info.extractor_key || info.extractor, detectPlatform(info.webpage_url || url));
    const mp4Formats = Array.isArray(info.formats) ? uniqueMp4Formats(info.formats) : [];
    const formats = mp4Formats.length > 0
      ? mp4Formats.map((format: any, index: number) => ({
          id: `format:${format.format_id || index}`,
          label: "MP4",
          resolution: format.height ? `${format.height}p${format.fps ? ` ${format.fps}fps` : ""}` : "MP4",
          size: formatFileSize(format.filesize || format.filesize_approx),
          url,
          isReal: true
        }))
      : [
          {
            id: "best",
            label: "MP4 auto",
            resolution: info.height ? `${info.height}p` : "Auto",
            size: formatFileSize(info.filesize || info.filesize_approx),
            url,
            isReal: true
          }
        ];

    res.json({
      success: true,
      title: info.title || "Видео",
      thumbnail: info.thumbnail || "",
      platform,
      originalUrl: info.webpage_url || url,
      formats,
      duration: formatDuration(info.duration),
      note: "Метаданные получены через локальный yt-dlp. Скачивание сохранит файл на этот компьютер, в папку downloads."
    });
  } catch (error) {
    res.status(422).json({ success: false, error: friendlyError(error, url) });
  }
});

function downloadArgs(job: Job) {
  const exactFormat = job.formatId.startsWith("format:") ? job.formatId.slice("format:".length) : "";
  const format = exactFormat
    ? `${exactFormat}+ba[ext=m4a]/${exactFormat}+bestaudio/${exactFormat}/best[ext=mp4]/best`
    : "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best";
  const ffmpeg = resolveFfmpeg();

  return [
    "--newline",
    "--no-playlist",
    "--restrict-filenames",
    "--merge-output-format",
    "mp4",
    "--retries",
    String(downloadSettings.retries),
    "--fragment-retries",
    String(downloadSettings.retries),
    "--concurrent-fragments",
    String(downloadSettings.concurrentFragments),
    ...(downloadSettings.rateLimit ? ["--limit-rate", downloadSettings.rateLimit] : []),
    ...(ffmpeg ? ["--ffmpeg-location", path.dirname(ffmpeg)] : []),
    "-f",
    format,
    "-P",
    job.outputDir,
    "-o",
    "%(title).120B [%(id)s].%(ext)s",
    job.url
  ];
}

function runDownloadJob(job: Job) {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.logs.push(`Starting download ${job.id}`);

  try {
    const { child, result } = runYtDlp(downloadArgs(job), (text) => {
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        job.logs.push(line);
        if (job.logs.length > 120) job.logs.shift();
        parseProgress(line, job);
      }
    });
    job.child = child;

    result
      .then(() => {
        if (job.status === "canceled") return;
        job.progress = 100;
        if (job.output && !path.isAbsolute(job.output)) {
          job.output = path.join(job.outputDir, job.output);
        }
        if (!job.output) {
          job.output = newestFileInDir(job.outputDir) || "";
        }
        job.status = "done";
        job.finishedAt = new Date().toISOString();
      })
      .catch((error) => {
        if (job.status !== "canceled") {
          job.status = "error";
          job.error = friendlyError(error, job.url);
          job.finishedAt = new Date().toISOString();
        }
      })
      .finally(() => {
        job.child = undefined;
        activeDownloads = Math.max(0, activeDownloads - 1);
        processQueue();
      });
  } catch (error) {
    job.status = "error";
    job.error = friendlyError(error, job.url);
    job.finishedAt = new Date().toISOString();
    activeDownloads = Math.max(0, activeDownloads - 1);
    processQueue();
  }
}

function processQueue() {
  while (activeDownloads < downloadSettings.maxConcurrentDownloads && pendingJobs.length > 0) {
    const job = pendingJobs.shift();
    if (!job || job.status !== "queued") continue;
    activeDownloads += 1;
    runDownloadJob(job);
  }
}

function enqueueDownload(url: string, formatId: string, outputDir: string) {
  const id = randomUUID();
  const job: Job = {
    id,
    url,
    formatId,
    progress: 0,
    speed: "",
    eta: "",
    output: "",
    outputDir,
    status: "queued",
    logs: [],
    startedAt: new Date().toISOString()
  };
  jobs.set(id, job);
  pendingJobs.push(job);
  processQueue();
  return job;
}

function cancelJob(job: Job) {
  if (job.status === "done" || job.status === "error" || job.status === "canceled") return job;

  if (job.status === "queued") {
    const index = pendingJobs.findIndex((pending) => pending.id === job.id);
    if (index >= 0) pendingJobs.splice(index, 1);
    job.progress = 0;
  }

  job.status = "canceled";
  job.error = "Загрузка остановлена.";
  job.finishedAt = new Date().toISOString();

  if (job.child && !job.child.killed) {
    job.child.kill("SIGTERM");
  }

  processQueue();
  return job;
}

app.post("/api/download", (req, res) => {
  const url = String(req.body?.url || "").trim();
  const formatId = String(req.body?.formatId || "best");
  const requestedOutputDir = req.body?.outputDir ? String(req.body.outputDir) : undefined;

  if (!isSupportedUrl(url)) {
    res.status(400).json({ error: "Вставь корректную http/https ссылку." });
    return;
  }

  let outputDir: string;
  try {
    outputDir = resolveDownloadDir(requestedOutputDir);
    mkdirSync(outputDir, { recursive: true });
  } catch (error) {
    res.status(400).json({ error: friendlyError(error, url) });
    return;
  }

  try {
    const job = enqueueDownload(url, formatId, outputDir);
    res.json({ id: job.id, status: job.status });
  } catch (error) {
    res.status(500).json({ error: friendlyError(error, url) });
  }
});

app.post("/api/download-batch", (req, res) => {
  const urls = Array.isArray(req.body?.urls)
    ? req.body.urls.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];
  const formatId = String(req.body?.formatId || "best");
  const requestedOutputDir = req.body?.outputDir ? String(req.body.outputDir) : undefined;

  if (urls.length === 0) {
    res.status(400).json({ error: "Добавь хотя бы одну http/https ссылку." });
    return;
  }

  const invalid = urls.find((url) => !isSupportedUrl(url));
  if (invalid) {
    res.status(400).json({ error: `Некорректная ссылка: ${invalid}` });
    return;
  }

  let outputDir: string;
  try {
    outputDir = resolveDownloadDir(requestedOutputDir);
    mkdirSync(outputDir, { recursive: true });
  } catch (error) {
    res.status(400).json({ error: friendlyError(error) });
    return;
  }

  try {
    const created = urls.map((url) => enqueueDownload(url, formatId, outputDir));
    res.json({
      jobs: created.map((job) => serializeJob(job)),
      maxConcurrentDownloads: downloadSettings.maxConcurrentDownloads
    });
  } catch (error) {
    res.status(500).json({ error: friendlyError(error) });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Задача не найдена." });
    return;
  }
  res.json(serializeJob(job));
});

app.post("/api/jobs/:id/cancel", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Задача не найдена." });
    return;
  }
  res.json(serializeJob(cancelJob(job)));
});

app.post("/api/jobs/cancel", (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id: unknown) => String(id))
    : [];
  const targetJobs = ids.length > 0
    ? ids.map((id) => jobs.get(id)).filter(Boolean) as Job[]
    : Array.from(jobs.values()).filter((job) => job.status === "queued" || job.status === "running");

  res.json({ canceled: targetJobs.map((job) => serializeJob(cancelJob(job))) });
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(appRoot, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(port, "127.0.0.1", () => {
    console.log(`motionxamon: http://localhost:${port}`);
  });
}

start();
