import React, { useEffect, useState } from "react";
import { CloudLightning, FolderOpen, Play, Settings, Square } from "lucide-react";
import { UrlInput } from "./components/UrlInput";
import { InfoCard } from "./components/InfoCard";
import { HistoryList } from "./components/HistoryList";
import { SettingsModal } from "./components/SettingsModal";
import { ToolStatusPanel } from "./components/ToolStatusPanel";
import { CompletedDownload, DownloadFormat, DownloadProgress, HistoryItem, VideoDetails } from "./types";

const idleProgress: DownloadProgress = {
  active: false,
  progress: 0,
  status: ""
};

type BatchJob = {
  id: string;
  url: string;
  progress: number;
  status: "queued" | "running" | "done" | "error" | "canceled";
  output?: string;
  outputDir?: string;
  error?: string;
};

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoDetails, setVideoDetails] = useState<VideoDetails | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>(idleProgress);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("motionxamon_download_history");
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      // History is a convenience feature; ignore corrupted localStorage.
    }
  }, []);

  const handleSaveHistory = (format: DownloadFormat, completed: CompletedDownload) => {
    if (!videoDetails) return;

    const newItem: HistoryItem = {
      id: `${Date.now()}-${format.id}`,
      title: videoDetails.title,
      platform: videoDetails.platform,
      thumbnail: videoDetails.thumbnail,
      url: videoDetails.originalUrl,
      timestamp: new Date().toISOString(),
      resolution: format.resolution,
      savedPath: completed.savedPath,
      savedDir: completed.savedDir
    };

    const updated = [newItem, ...history.filter((item) => item.url !== newItem.url)].slice(0, 15);
    setHistory(updated);
    localStorage.setItem("motionxamon_download_history", JSON.stringify(updated));
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem("motionxamon_download_history");
    localStorage.removeItem("vortex_download_history");
  };

  const openFolder = async (path?: string) => {
    if (!path) return;
    await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    });
  };

  const openFile = async (path?: string) => {
    if (!path) return;
    await fetch("/api/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    });
  };

  const chooseFolder = async () => {
    const response = await fetch("/api/select-folder-modern", { method: "POST" });
    if (response.status === 409) return null;

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось выбрать папку.");
    return data.path as string;
  };

  const handleProcessUrl = async (targetUrl: string) => {
    setLoading(true);
    setError(null);
    setVideoDetails(null);
    setBatchJobs([]);
    setUrl(targetUrl);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Не удалось прочитать ссылку.");
      }

      setVideoDetails({
        title: data.title,
        thumbnail: data.thumbnail,
        platform: data.platform,
        originalUrl: data.originalUrl,
        formats: data.formats,
        note: data.note,
        duration: data.duration
      });
    } catch (error: any) {
      setError(error.message || "Не удалось обработать URL. Проверь ссылку и попробуй еще раз.");
    } finally {
      setLoading(false);
    }
  };

  const refreshBatchJobs = async (jobs: BatchJob[]) => {
    const updated = await Promise.all(jobs.map(async (job) => {
      const response = await fetch(`/api/jobs/${job.id}`);
      if (!response.ok) return job;
      return await response.json() as BatchJob;
    }));

    setBatchJobs(updated);
    return updated;
  };

  const pollBatchJobs = async (jobs: BatchJob[]) => {
    let current = jobs;

    while (current.some((job) => job.status === "queued" || job.status === "running")) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const updated = await refreshBatchJobs(current);

      current = updated;
      const done = updated.filter((job) => job.status === "done").length;
      const failed = updated.filter((job) => job.status === "error").length;
      const canceled = updated.filter((job) => job.status === "canceled").length;
      const totalProgress = updated.reduce((sum, job) => sum + Math.max(0, Math.min(100, Number(job.progress) || 0)), 0);
      setDownloadProgress({
        active: updated.some((job) => job.status === "queued" || job.status === "running"),
        progress: updated.length ? totalProgress / updated.length : 0,
        status: `Очередь: готово ${done}/${updated.length}${failed ? `, ошибок ${failed}` : ""}${canceled ? `, остановлено ${canceled}` : ""}`,
        savedDir: updated.find((job) => job.outputDir)?.outputDir
      });
    }
  };

  const handleBatchDownload = async (text: string, formatId: string) => {
    const urls = text
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => /^https?:\/\//i.test(item));

    if (urls.length === 0) {
      setError("Добавь одну или несколько http/https ссылок для очереди.");
      return;
    }

    setBatchLoading(true);
    setError(null);
    setVideoDetails(null);
    setDownloadProgress({ active: true, progress: 0, status: "Выбери папку для очереди..." });

    try {
      const folder = await chooseFolder();
      if (!folder) {
        setDownloadProgress(idleProgress);
        return;
      }

      const response = await fetch("/api/download-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, outputDir: folder, formatId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось запустить очередь.");

      const jobs = data.jobs.map((job: BatchJob) => ({ ...job, progress: 0, outputDir: folder }));
      setBatchJobs(jobs);
      setDownloadProgress({
        active: true,
        progress: 0,
        status: `Очередь запущена: ${jobs.length} ссылок, параллельно до ${data.maxConcurrentDownloads || 2}`,
        savedDir: folder
      });
      await pollBatchJobs(jobs);
    } catch (error: any) {
      const message = error.message || "Ошибка очереди.";
      setError(message);
      setDownloadProgress({ active: false, progress: 0, status: "", error: message });
    } finally {
      setBatchLoading(false);
    }
  };

  const stopBatch = async () => {
    const activeIds = batchJobs
      .filter((job) => job.status === "queued" || job.status === "running")
      .map((job) => job.id);
    if (activeIds.length === 0) return;

    await fetch("/api/jobs/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: activeIds })
    });

    const updated = await refreshBatchJobs(batchJobs);
    const canceled = updated.filter((job) => job.status === "canceled").length;
    setBatchLoading(false);
    setDownloadProgress({
      active: false,
      progress: 0,
      status: canceled ? `Остановлено задач: ${canceled}` : "Очередь остановлена.",
      savedDir: updated.find((job) => job.outputDir)?.outputDir
    });
  };

  const showProgress = downloadProgress.active || downloadProgress.status || downloadProgress.error || downloadProgress.savedDir;

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-slate-200 font-sans flex flex-col selection:bg-indigo-500/30 selection:text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-900/80 bg-[#0D0F14] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 active:scale-95 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-extrabold tracking-tight text-white font-display">
              motion<span className="text-indigo-400 bg-gradient-to-r from-indigo-400 to-rose-400 bg-clip-text text-transparent">xamon</span>
            </h1>
            <span className="text-[9px] text-zinc-500 tracking-wider font-mono">LOCAL VIDEO DOWNLOADER</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-950 rounded-lg border border-transparent hover:border-slate-800/80 transition"
          title="Настройки"
        >
          <Settings className="w-4 h-4" />
        </button>
      </header>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col gap-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto mb-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display">
            Вставь ссылку или список ссылок
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
            Одна ссылка открывает выбор формата. Несколько ссылок можно настроить и отправить в очередь.
          </p>
        </div>

        <ToolStatusPanel />

        <div className="w-full max-w-3xl mx-auto">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1 font-mono">
            Video URL / Batch Queue
          </label>
          <UrlInput
            onProcess={handleProcessUrl}
            onBatchDownload={handleBatchDownload}
            onStopBatch={stopBatch}
            isLoading={loading}
            isBatchLoading={batchLoading}
            initialUrl={url}
          />

          {showProgress && (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-[#161920] p-4 shadow-lg shadow-black/10">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-200">
                    {downloadProgress.error ? "Ошибка скачивания" : downloadProgress.active ? "Загрузка видео" : "Готово"}
                  </p>
                  <p className="mt-1 truncate text-[11px] font-mono text-zinc-500">
                    {downloadProgress.error || downloadProgress.status || "Файл сохранен"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {downloadProgress.savedPath && (
                    <button
                      type="button"
                      onClick={() => openFile(downloadProgress.savedPath)}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                    >
                      <Play className="h-4 w-4" />
                      Открыть видео
                    </button>
                  )}
                  {downloadProgress.active && (
                    <button
                      type="button"
                      onClick={stopBatch}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/10"
                    >
                      <Square className="h-4 w-4" />
                      Стоп
                    </button>
                  )}
                  {downloadProgress.savedDir && (
                    <button
                      type="button"
                      onClick={() => openFolder(downloadProgress.savedDir)}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Папка
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-950">
                <div
                  className={`h-full transition-all ${downloadProgress.error ? "bg-rose-500" : "bg-gradient-to-r from-indigo-500 to-emerald-400"}`}
                  style={{ width: `${Math.max(0, Math.min(100, downloadProgress.progress || 0))}%` }}
                />
              </div>
            </div>
          )}

          {batchJobs.length > 0 && (
            <div className="mt-4 divide-y divide-zinc-800/70 rounded-2xl border border-zinc-800 bg-zinc-950/50">
              {batchJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => job.output ? openFile(job.output) : undefined}
                      className="block max-w-full truncate text-left text-[11px] font-mono text-zinc-300 transition hover:text-white disabled:pointer-events-none"
                      disabled={!job.output}
                    >
                      {job.url}
                    </button>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-900">
                      <div
                        className={`h-full ${job.status === "error" ? "bg-rose-500" : job.status === "canceled" ? "bg-zinc-600" : job.status === "done" ? "bg-emerald-400" : "bg-indigo-500"}`}
                        style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }}
                      />
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${
                    job.status === "done"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                      : job.status === "error"
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-300"
                        : job.status === "canceled"
                          ? "border-zinc-600 bg-zinc-900 text-zinc-400"
                          : "border-indigo-500/20 bg-indigo-500/10 text-indigo-300"
                  }`}>
                    {job.status === "queued" ? "очередь" : job.status === "running" ? `${Math.round(job.progress || 0)}%` : job.status === "done" ? "готово" : job.status === "canceled" ? "стоп" : "ошибка"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="w-full max-w-3xl mx-auto bg-rose-950/20 border border-rose-900/50 p-4 rounded-2xl flex gap-3 animate-fade-in">
            <div className="p-1 rounded-lg bg-rose-500/10 text-rose-400 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-rose-200">Ошибка обработки ссылки</h4>
              <p className="text-xs text-rose-400/90 mt-1 line-clamp-3">{error}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="w-full max-w-3xl mx-auto py-16 flex flex-col items-center justify-center gap-4 bg-[#161920]/40 border border-slate-800/60 rounded-3xl animate-pulse">
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
              <CloudLightning className="w-5 h-5 text-indigo-400 absolute animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-slate-300">Анализируем видео...</p>
              <p className="text-[11px] text-slate-500 font-mono">Проверяем доступные форматы через локальный yt-dlp</p>
            </div>
          </div>
        )}

        {!loading && videoDetails && (
          <div className="w-full max-w-4xl mx-auto">
            <InfoCard
              details={videoDetails}
              onSaveHistory={handleSaveHistory}
              onDownloadProgress={setDownloadProgress}
            />
          </div>
        )}

        <div className="w-full max-w-4xl mx-auto mt-6">
          <HistoryList history={history} onClear={handleClearHistory} />
        </div>
      </main>
    </div>
  );
}
