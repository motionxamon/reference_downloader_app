import React, { useEffect, useState } from "react";
import { DownloadCloud, RotateCcw, Save, SlidersHorizontal, X } from "lucide-react";

export type DownloadSettings = {
  maxConcurrentDownloads: number;
  rateLimit: string;
  concurrentFragments: number;
  retries: number;
};

export type ToolsStatus = {
  toolsDir: string;
  ready: boolean;
  tools: Array<{
    name: string;
    path: string;
    installed: boolean;
    version?: string;
  }>;
};

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onToolsChange?: (tools: ToolsStatus) => void;
}

const defaults: DownloadSettings = {
  maxConcurrentDownloads: 2,
  rateLimit: "",
  concurrentFragments: 1,
  retries: 10
};

export function SettingsModal({ open, onClose, onToolsChange }: SettingsModalProps) {
  const [settings, setSettings] = useState<DownloadSettings>(defaults);
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [status, setStatus] = useState("");
  const [toolsBusy, setToolsBusy] = useState(false);

  const refreshTools = async () => {
    const response = await fetch("/api/tools");
    const data = await response.json();
    if (response.ok) {
      setTools(data);
      onToolsChange?.(data);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => setSettings({ ...defaults, ...data }))
      .catch(() => setStatus("Не удалось прочитать настройки."));
    refreshTools().catch(() => setStatus("Не удалось прочитать статус инструментов."));
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setStatus("Сохраняем...");
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Не удалось сохранить настройки.");
      return;
    }
    setSettings(data);
    onClose();
  };

  const installTools = async (force: boolean) => {
    setToolsBusy(true);
    setStatus(force ? "Обновляем yt-dlp и FFmpeg..." : "Скачиваем yt-dlp и FFmpeg...");
    try {
      const response = await fetch("/api/tools/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось скачать инструменты.");
      setTools(data);
      onToolsChange?.(data);
      setStatus("Инструменты готовы.");
    } catch (error: any) {
      setStatus(error.message || "Не удалось скачать инструменты.");
    } finally {
      setToolsBusy(false);
    }
  };

  const updateNumber = (key: keyof DownloadSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: Number(value) }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#161920] shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-indigo-300">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Настройки загрузки</h2>
              <p className="text-[11px] text-zinc-500">Очередь, скорость, yt-dlp и FFmpeg</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-900 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Инструменты</h3>
              <p className="mt-1 truncate text-[11px] font-mono text-zinc-600">{tools?.toolsDir || "..."}</p>
            </div>

            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {tools?.tools.map((tool) => (
                <div key={tool.name} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-200">{tool.name}</span>
                    <span className={tool.installed ? "text-[10px] text-emerald-300" : "text-[10px] text-rose-300"}>
                      {tool.installed ? "есть" : "нет"}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-zinc-600">{tool.version || "version unknown"}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => installTools(Boolean(tools?.ready))}
              disabled={toolsBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-xs font-semibold text-zinc-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:pointer-events-none disabled:opacity-60"
            >
              {toolsBusy ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-zinc-500 border-t-emerald-300 animate-spin" />
              ) : (
                <DownloadCloud className="h-3.5 w-3.5" />
              )}
              {tools?.ready ? "Обновить инструменты" : "Скачать инструменты"}
            </button>
          </div>

          <label className="block">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">Параллельные скачивания</span>
              <span className="font-mono text-xs text-emerald-300">{settings.maxConcurrentDownloads}</span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              value={settings.maxConcurrentDownloads}
              onChange={(event) => updateNumber("maxConcurrentDownloads", event.target.value)}
              className="w-full accent-emerald-400"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">Фрагменты на одну загрузку</span>
              <span className="font-mono text-xs text-emerald-300">{settings.concurrentFragments}</span>
            </div>
            <input
              type="range"
              min="1"
              max="8"
              value={settings.concurrentFragments}
              onChange={(event) => updateNumber("concurrentFragments", event.target.value)}
              className="w-full accent-emerald-400"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-zinc-200">Лимит скорости</span>
              <input
                value={settings.rateLimit}
                onChange={(event) => setSettings((current) => ({ ...current, rateLimit: event.target.value }))}
                placeholder="пусто, 500K, 2M"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 font-mono text-xs text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-emerald-500/50"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-zinc-200">Повторы при ошибке</span>
              <input
                type="number"
                min="0"
                max="50"
                value={settings.retries}
                onChange={(event) => updateNumber("retries", event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 font-mono text-xs text-zinc-200 outline-none transition focus:border-emerald-500/50"
              />
            </label>
          </div>

          {status && <p className="text-xs text-zinc-400">{status}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-4">
          <button
            type="button"
            onClick={() => setSettings(defaults)}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:bg-zinc-950 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200"
          >
            <Save className="h-3.5 w-3.5" />
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
