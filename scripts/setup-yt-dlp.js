import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { chmod, cp, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const binDir = path.join(root, "bin");

const tools = process.platform === "win32"
  ? [
      {
        name: "yt-dlp",
        target: path.join(binDir, "yt-dlp.exe"),
        url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
      },
      {
        name: "ffmpeg",
        target: path.join(binDir, "ffmpeg.exe"),
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip",
        zipEntries: ["ffmpeg.exe", "ffprobe.exe"]
      }
    ]
  : [
      {
        name: "yt-dlp",
        target: path.join(binDir, "yt-dlp"),
        url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
      }
    ];

mkdirSync(binDir, { recursive: true });

try {
  for (const tool of tools) {
    if (existsSync(tool.target)) {
      console.log(`${tool.name} already exists: ${tool.target}`);
      continue;
    }

    if (tool.zipEntries) {
      await downloadZipTool(tool);
    } else {
      await download(tool.url, tool.target);
      if (process.platform !== "win32") await chmod(tool.target, 0o755);
      console.log(`Downloaded ${tool.name}: ${tool.target}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function downloadZipTool(tool) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "motionxamon-"));
  const archive = path.join(tempDir, `${tool.name}.zip`);

  try {
    console.log(`Downloading ${tool.name} archive...`);
    await download(tool.url, archive);
    await expandArchive(archive, tempDir);

    const files = await listFiles(tempDir);
    for (const entry of tool.zipEntries) {
      const found = files.find((file) => path.basename(file).toLowerCase() === entry.toLowerCase());
      if (!found) throw new Error(`${entry} was not found in ${tool.name} archive.`);
      await cp(found, path.join(binDir, entry), { force: true });
      console.log(`Installed ${entry}: ${path.join(binDir, entry)}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function expandArchive(archive, destination) {
  return new Promise((resolve, reject) => {
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

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? await listFiles(fullPath) : [fullPath];
  }));
  return files.flat();
}

function download(source, destination, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error(`Too many redirects while downloading ${source}.`));
  }

  return new Promise((resolve, reject) => {
    https.get(source, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const location = new URL(response.headers.location, source).toString();
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
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}
