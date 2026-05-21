import React, { useEffect, useMemo, useState } from "react";
import { Check, DownloadCloud, RefreshCw } from "lucide-react";
import type { ToolsStatus } from "./SettingsModal";

type ToolState = NonNullable<ToolsStatus["tools"][number]["status"]>;

const toolClasses: Record<ToolState, string> = {
  ready: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  update: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  unknown: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  missing: "border-rose-500/25 bg-rose-500/10 text-rose-300"
};

export function ToolStatusPanel() {
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const response = await fetch("/api/tools");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось проверить инструменты.");
    setTools(data);
    return data as ToolsStatus;
  };

  useEffect(() => {
    refresh().catch(() => setMessage("Не удалось проверить инструменты."));
  }, []);

  const state = useMemo(() => {
    const missing = Boolean(tools && !tools.ready);
    const update = Boolean(tools?.updateAvailable || tools?.unknown);
    const ready = Boolean(tools?.ready && !update);

    return {
      missing,
      update,
      ready,
      label: missing ? "Скачать" : update ? "Обновить" : ready ? "Готово" : "Проверка",
      note: missing ? "без tools не работает" : update ? "нужно обновить" : ready ? "обновление не требуется" : "проверяем tools"
    };
  }, [tools]);

  const installTools = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tools/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: Boolean(tools?.ready) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось скачать инструменты.");
      setTools(data);
      setMessage(data.updateAvailable || data.unknown ? "Проверь обновления еще раз." : "Готово.");
    } catch (error: any) {
      setMessage(error.message || "Не удалось скачать инструменты.");
    } finally {
      setBusy(false);
    }
  };

  const Icon = state.missing ? DownloadCloud : state.update ? RefreshCw : Check;

  return (
    <section className="w-full max-w-3xl mx-auto -mt-3">
      <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/55 px-2 py-1.5 shadow-lg shadow-black/10">
        {tools?.tools.map((tool) => {
          const status = tool.status || (tool.installed ? "unknown" : "missing");
          const version = tool.version || (tool.installed ? "version unknown" : "нет");
          const title = `${tool.name}: ${version}${tool.latestTag ? ` / latest ${tool.latestTag}` : ""}`;

          return (
            <span
              key={tool.name}
              title={title}
              className={`inline-flex h-6 min-w-0 items-center gap-1 rounded-lg border px-2 text-[10px] font-semibold ${toolClasses[status]}`}
            >
              <span>{tool.name}</span>
              <span className="max-w-20 truncate font-mono opacity-70">{version}</span>
            </span>
          );
        })}

        {!tools && (
          <span className="inline-flex h-6 items-center rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[10px] font-semibold text-zinc-400">
            проверка tools
          </span>
        )}

        <span className={`px-1.5 text-[10px] font-semibold ${state.ready ? "text-emerald-300" : state.missing ? "text-rose-300" : "text-amber-300"}`}>
          {message || state.note}
        </span>

        <button
          type="button"
          onClick={state.ready ? refresh : installTools}
          disabled={busy || !tools}
          className={`inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold transition disabled:opacity-60 ${
            state.ready
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
              : state.update
                ? "border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
                : "border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
          }`}
          title={state.ready ? "Проверить еще раз" : state.label}
        >
          <Icon className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          {state.label}
        </button>
      </div>
    </section>
  );
}
