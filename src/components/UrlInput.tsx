import React, { useEffect, useState } from "react";
import { ArrowRight, Clipboard, Download, Link2, X } from "lucide-react";

interface UrlInputProps {
  onProcess: (url: string) => void;
  onBatchDownload: (text: string, formatId: string) => void;
  onStopBatch: () => void;
  isLoading: boolean;
  isBatchLoading?: boolean;
  initialUrl?: string;
}

export function UrlInput({ onProcess, onBatchDownload, onStopBatch, isLoading, isBatchLoading = false, initialUrl = "" }: UrlInputProps) {
  const [url, setUrl] = useState(initialUrl);
  const [batchFormatId, setBatchFormatId] = useState("best");

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  const extractUrls = (value: string) => value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const urls = extractUrls(url);
    if (urls.length > 1) onBatchDownload(url, batchFormatId);
    else if (urls[0]) onProcess(urls[0]);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch {
      // Clipboard can be unavailable in some browser contexts.
    }
  };

  const getDetectedPlatform = () => {
    const urls = extractUrls(url);
    if (urls.length > 1) return `${urls.length} links`;
    const value = urls[0] || url.trim();
    if (!value) return null;
    if (/youtube\.com|youtu\.be|shorts/i.test(value)) return "youtube";
    if (/vimeo\.com/i.test(value)) return "vimeo";
    if (/pinterest\.com|pin\.it|pinimg\.com/i.test(value)) return "pinterest";
    if (/instagram\.com/i.test(value)) return "instagram";
    if (/tiktok\.com/i.test(value)) return "tiktok";
    if (/reddit\.com|redd\.it/i.test(value)) return "reddit";
    if (/twitter\.com|x\.com/i.test(value)) return "twitter";
    if (/vk\.com|vkvideo\.ru/i.test(value)) return "vk";
    if (/yandex\./i.test(value)) return "yandex";
    if (/dailymotion\.com|dai\.ly/i.test(value)) return "dailymotion";
    if (/twitch\.tv/i.test(value)) return "twitch";
    if (/\.(mp4|mov|m4v|webm)(?:$|\?)/i.test(value)) return "direct video";
    if (/^https?:\/\//i.test(value)) return "auto";
    return null;
  };

  const platform = getDetectedPlatform();
  const urls = extractUrls(url);
  const isBatch = urls.length > 1;
  const platformStyle = platform
    ? "border-emerald-500/60 shadow-emerald-950/30 shadow-lg focus-within:ring-2 focus-within:ring-emerald-500/10"
    : "border-slate-800 focus-within:border-slate-700 focus-within:ring-2 focus-within:ring-white/5";

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className={`relative transition-all duration-300 rounded-2xl bg-[#161920] border ${platformStyle} p-2 flex items-start gap-1`}>
        <div className="pl-3 pt-3 flex items-center justify-center text-zinc-500">
          <Link2 className={`w-5 h-5 transition-colors ${platform ? "text-emerald-400" : ""}`} />
        </div>

        <textarea
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={"Вставь одну ссылку для анализа или несколько ссылок для очереди\nhttps://youtube.com/...\nhttps://vimeo.com/..."}
          required
          disabled={isLoading}
          rows={3}
          className="min-h-24 w-full resize-y bg-transparent border-0 text-white placeholder-zinc-500 text-sm focus:outline-none py-3 px-2 disabled:opacity-50"
        />

        <div className="flex items-center gap-1.5 pr-1 pt-1.5">
          {url && (
            <button
              type="button"
              onClick={() => setUrl("")}
              title="Очистить"
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {!url && (
            <button
              type="button"
              onClick={handlePaste}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold hover:bg-zinc-700 transition"
              title="Вставить из буфера"
            >
              <Clipboard className="w-3.5 h-3.5" />
              Вставить
            </button>
          )}

          <button
            type="submit"
            disabled={isLoading || isBatchLoading || !url.trim()}
            className="flex items-center justify-center px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs tracking-wide transition hover:bg-zinc-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none gap-1"
          >
            {isLoading || isBatchLoading ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
            ) : isBatch ? (
              <>
                <span>Скачать</span>
                <Download className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Анализ</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 animate-fade-in text-[10px] font-mono tracking-wider uppercase">
        {platform ? (
          <span className="px-2 py-0.5 rounded-md border text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Распознано: {platform}
          </span>
        ) : <span />}

        {isBatch && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-500">Параметры пачки</span>
            <select
              value={batchFormatId}
              onChange={(event) => setBatchFormatId(event.target.value)}
              disabled={isBatchLoading}
              className="h-8 rounded-lg border border-zinc-800 bg-zinc-950 px-2 text-[10px] font-semibold text-zinc-200 outline-none focus:border-emerald-500/50 disabled:opacity-60"
            >
              <option value="best">Лучшее качество</option>
              <option value="mp4">Предпочесть MP4</option>
            </select>
            {isBatchLoading && (
              <button
                type="button"
                onClick={onStopBatch}
                className="h-8 rounded-lg border border-rose-500/30 px-3 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-500/10"
              >
                Стоп
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
