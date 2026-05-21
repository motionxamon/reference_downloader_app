import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Download, ExternalLink, Film, Info, Monitor, Play, Square } from "lucide-react";
import { CompletedDownload, DownloadFormat, DownloadProgress, VideoDetails } from "../types";

interface InfoCardProps {
  details: VideoDetails;
  onSaveHistory: (format: DownloadFormat, completed: CompletedDownload) => void;
  onDownloadProgress: (progress: DownloadProgress) => void;
}

type DownloadJob = {
  id: string;
  progress: number;
  speed?: string;
  eta?: string;
  output?: string;
  outputDir?: string;
  status: "queued" | "running" | "done" | "error" | "canceled";
  error?: string;
};

export function InfoCard({ details, onSaveHistory, onDownloadProgress }: InfoCardProps) {
  const [selectedFormatId, setSelectedFormatId] = useState(details.formats[0]?.id || "best");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [downloadingFormatId, setDownloadingFormatId] = useState<string | null>(null);
  const [completedFormatId, setCompletedFormatId] = useState<string | null>(null);
  const [completedPath, setCompletedPath] = useState<string | undefined>();
  const [progress, setProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFormatId(details.formats[0]?.id || "best");
    setCompletedFormatId(null);
    setCompletedPath(undefined);
    setDownloadError(null);
  }, [details]);

  const selectedFormat = details.formats.find((format) => format.id === selectedFormatId) || details.formats[0];

  const openFile = async (path?: string) => {
    if (!path) return;
    await fetch("/api/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    });
  };

  const handleDownload = async () => {
    if (!selectedFormat) return;

    if (completedPath && completedFormatId === selectedFormat.id) {
      await openFile(completedPath);
      return;
    }

    setDownloadingFormatId(selectedFormat.id);
    setCompletedFormatId(null);
    setCompletedPath(undefined);
    setDownloadError(null);
    setProgress(0);
    onDownloadProgress({ active: true, progress: 0, status: "Выбери папку для сохранения..." });

    try {
      const folder = await chooseFolder();
      if (!folder) {
        setDownloadingFormatId(null);
        onDownloadProgress({ active: false, progress: 0, status: "" });
        return;
      }

      onDownloadProgress({ active: true, progress: 0, status: "Запускаем локальную загрузку..." });
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: selectedFormat.url || details.originalUrl,
          formatId: selectedFormat.id,
          outputDir: folder
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось запустить загрузку.");

      setCurrentJobId(data.id);
      const job = await pollJob(data.id);
      const savedPath = job.output;
      const savedDir = job.outputDir || folder;

      setCurrentJobId(null);
      setDownloadingFormatId(null);
      setCompletedFormatId(selectedFormat.id);
      setCompletedPath(savedPath);
      onDownloadProgress({
        active: false,
        progress: 100,
        status: "Файл сохранен.",
        savedPath,
        savedDir
      });
      onSaveHistory(selectedFormat, { savedPath, savedDir });
    } catch (error: any) {
      const message = error.message || "Ошибка скачивания.";
      setCurrentJobId(null);
      setDownloadingFormatId(null);
      setDownloadError(message);
      onDownloadProgress({ active: false, progress, status: "", error: message });
    }
  };

  const stopDownload = async () => {
    if (!currentJobId) return;
    await fetch(`/api/jobs/${currentJobId}/cancel`, { method: "POST" });
    setCurrentJobId(null);
    setDownloadingFormatId(null);
    setDownloadError("Загрузка остановлена.");
    onDownloadProgress({ active: false, progress, status: "Загрузка остановлена." });
  };

  const chooseFolder = async () => {
    const response = await fetch("/api/select-folder-modern", { method: "POST" });
    if (response.status === 409) return null;

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось выбрать папку.");
    return data.path as string;
  };

  const pollJob = async (jobId: string): Promise<DownloadJob> => {
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const response = await fetch(`/api/jobs/${jobId}`);
      const job = await response.json() as DownloadJob;
      if (!response.ok) throw new Error(job.error || "Не удалось прочитать статус загрузки.");

      const nextProgress = Math.max(0, Math.min(100, Number(job.progress) || 0));
      const status = [job.speed, job.eta ? `ETA ${job.eta}` : ""].filter(Boolean).join(" · ")
        || (job.status === "queued" ? "В очереди..." : job.status === "running" ? "Скачиваем..." : "Файл сохранен.");

      setProgress(nextProgress);
      onDownloadProgress({
        active: job.status === "queued" || job.status === "running",
        progress: nextProgress,
        status,
        savedPath: job.output,
        savedDir: job.outputDir
      });

      if (job.status === "done") return job;
      if (job.status === "canceled") throw new Error("Загрузка остановлена.");
      if (job.status === "error") throw new Error(job.error || "yt-dlp вернул ошибку.");
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "youtube": return <span className="bg-red-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase font-display tracking-widest">YouTube</span>;
      case "instagram": return <span className="bg-gradient-to-tr from-amber-500 to-rose-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase font-display tracking-widest">Instagram</span>;
      case "pinterest": return <span className="bg-rose-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase font-display tracking-widest">Pinterest</span>;
      case "vimeo": return <span className="bg-sky-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md uppercase font-display tracking-widest">Vimeo</span>;
      default: return <span className="bg-zinc-800 text-zinc-300 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase font-display tracking-widest">Video</span>;
    }
  };

  const isDownloading = Boolean(downloadingFormatId);
  const isCompleted = selectedFormat ? completedFormatId === selectedFormat.id : false;

  return (
    <div className="w-full bg-[#161920] border border-slate-800/70 rounded-2xl overflow-hidden shadow-2xl transition hover:border-slate-700/80 animate-fade-in">
      <div className="flex flex-col md:flex-row border-b border-zinc-800">
        <div className="relative w-full md:w-48 lg:w-56 h-36 md:h-auto bg-zinc-950 flex-shrink-0">
          {details.thumbnail ? (
            <img src={details.thumbnail} alt={details.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-700">
              <Film className="w-10 h-10" />
            </div>
          )}
          {details.duration && (
            <span className="absolute bottom-2 right-2 bg-black/85 text-white/90 text-[10px] font-mono font-medium px-2 py-0.5 rounded-md">
              {details.duration}
            </span>
          )}
          <div className="absolute top-2 left-2">{getPlatformIcon(details.platform)}</div>
        </div>

        <div className="p-6 flex flex-col justify-between flex-1 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono text-zinc-500 tracking-wider">Метаданные получены</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            </div>
            <h2 className="text-lg font-semibold text-white tracking-tight leading-snug line-clamp-2" title={details.title}>
              {details.title}
            </h2>
            <p className="text-xs text-zinc-400 mt-2 line-clamp-1 font-mono hover:text-white transition">
              <a href={details.originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                <span>{details.originalUrl}</span>
                <ExternalLink className="w-3 h-3 text-zinc-500" />
              </a>
            </p>
          </div>

          {details.note && (
            <div className="flex gap-2 p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl text-xs text-zinc-400">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-sans">{details.note}</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <h3 className="text-xs font-mono text-zinc-500 tracking-wider uppercase mb-4 flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5" />
          Формат скачивания
        </h3>

        {downloadError && (
          <div className="mb-4 flex gap-2 rounded-xl border border-rose-900/60 bg-rose-950/20 p-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p>{downloadError}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Выбери вариант</span>
            <select
              value={selectedFormatId}
              onChange={(event) => setSelectedFormatId(event.target.value)}
              disabled={isDownloading}
              className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 outline-none transition focus:border-emerald-500/50 disabled:opacity-60"
            >
              {details.formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.resolution} · {format.label} · {format.size}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            {isDownloading && (
              <button
                type="button"
                onClick={stopDownload}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-500/30 px-4 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/10"
              >
                <Square className="w-3.5 h-3.5" />
                Стоп
              </button>
            )}

            <button
              onClick={handleDownload}
              disabled={isDownloading || !selectedFormat}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-xs font-semibold tracking-wide transition active:scale-95 disabled:pointer-events-none sm:min-w-40 ${
                isCompleted ? "bg-emerald-500 text-black hover:bg-emerald-400" : "bg-white text-black hover:bg-zinc-200 disabled:opacity-60"
              }`}
            >
              {isDownloading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                  <span>{progress > 0 ? `${progress.toFixed(0)}%` : "Скачивание..."}</span>
                </>
              ) : isCompleted ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Готово</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Скачать видео</span>
                </>
              )}
            </button>
          </div>
        </div>

        {selectedFormat && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="rounded-md bg-zinc-950 px-2 py-1 font-mono">{selectedFormat.resolution}</span>
            <span>{selectedFormat.label}</span>
            <span className="text-emerald-400/90">{selectedFormat.size}</span>
          </div>
        )}
      </div>
    </div>
  );
}
