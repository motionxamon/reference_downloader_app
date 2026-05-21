import React, { useEffect, useState } from "react";
import { AlertTriangle, DownloadCloud, RefreshCw, Wrench } from "lucide-react";
import type { ToolsStatus } from "./SettingsModal";

export function ToolStatusPanel() {
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const response = await fetch("/api/tools");
    const data = await response.json();
    if (response.ok) setTools(data);
  };

  useEffect(() => {
    refresh().catch(() => setMessage("Не удалось проверить инструменты."));
  }, []);

  const installTools = async () => {
    setBusy(true);
    setMessage(tools?.ready ? "Обновляем инструменты..." : "Скачиваем инструменты...");
    try {
      const response = await fetch("/api/tools/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: Boolean(tools?.ready) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось скачать инструменты.");
      setTools(data);
      setMessage("Инструменты готовы.");
    } catch (error: any) {
      setMessage(error.message || "Не удалось скачать инструменты.");
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(tools?.ready);

  return (
    <section className={`w-full max-w-3xl mx-auto rounded-2xl border p-4 ${ready ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/25 bg-rose-500/5"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${ready ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-rose-500/20 bg-rose-500/10 text-rose-300"}`}>
              {ready ? <Wrench className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                {ready ? "Инструменты готовы" : "Нужно скачать инструменты"}
              </h3>
              <p className="text-[11px] text-zinc-500">
                Без yt-dlp и FFmpeg скачивание и склейка видео не будут работать.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {tools?.tools.map((tool) => (
              <div key={tool.name} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-200">{tool.name}</span>
                  <span className={tool.installed ? "text-[10px] font-semibold text-emerald-300" : "text-[10px] font-semibold text-rose-300"}>
                    {tool.installed ? "есть" : "нет"}
                  </span>
                </div>
                <p className="mt-0.5 max-w-52 truncate font-mono text-[10px] text-zinc-600">
                  {tool.version || "version unknown"}
                </p>
              </div>
            ))}
          </div>

          {message && <p className="mt-2 text-xs text-zinc-400">{message}</p>}
        </div>

        <button
          type="button"
          onClick={installTools}
          disabled={busy}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:pointer-events-none disabled:opacity-60 ${ready ? "border border-zinc-700 text-zinc-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300" : "bg-white text-black hover:bg-zinc-200"}`}
        >
          {busy ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-zinc-500 border-t-emerald-300 animate-spin" />
          ) : ready ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <DownloadCloud className="h-3.5 w-3.5" />
          )}
          {ready ? "Обновить" : "Скачать"}
        </button>
      </div>
    </section>
  );
}
