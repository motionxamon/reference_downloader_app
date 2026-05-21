import React from "react";
import { ExternalLink, Film, FolderOpen, History, Trash2 } from "lucide-react";
import { HistoryItem } from "../types";

interface HistoryListProps {
  history: HistoryItem[];
  onClear: () => void;
}

export function HistoryList({ history, onClear }: HistoryListProps) {
  const openFolder = async (event: React.MouseEvent, item: HistoryItem) => {
    event.stopPropagation();
    await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: item.savedDir || item.savedPath })
    });
  };

  const openOriginal = (item: HistoryItem) => {
    window.open(item.url, "_blank", "noopener,noreferrer");
  };

  if (history.length === 0) {
    return (
      <div className="w-full bg-zinc-950/40 border border-zinc-900 rounded-2xl p-8 text-center">
        <div className="mx-auto w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center border border-zinc-800 text-zinc-600 mb-3">
          <History className="w-5 h-5" />
        </div>
        <h4 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">
          История загрузок пустая
        </h4>
        <p className="text-xs text-zinc-600 font-sans max-w-xs mx-auto">
          После успешного скачивания здесь появятся название и папка сохранения.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#161920] border border-slate-800/80 rounded-2xl p-6 transition hover:border-slate-700/80 animate-fade-in">
      <div className="flex items-center justify-between mb-4 border-b border-zinc-800/80 pb-3">
        <h3 className="text-xs font-mono text-zinc-400 tracking-wider uppercase flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          История ({history.length})
        </h3>
        <button
          onClick={onClear}
          title="Очистить историю"
          className="text-xs text-zinc-500 hover:text-rose-400 inline-flex items-center gap-1.5 transition px-2 py-1 rounded-lg hover:bg-rose-500/5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Очистить</span>
        </button>
      </div>

      <div className="divide-y divide-zinc-800/50 max-h-72 overflow-y-auto pr-1">
        {history.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-3 gap-3">
            <button
              type="button"
              onClick={() => openOriginal(item)}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left hover:bg-zinc-950/40"
              title="Открыть исходное видео"
            >
              <div className="w-10 h-8 rounded bg-zinc-950 overflow-hidden border border-zinc-800 shrink-0 flex items-center justify-center text-zinc-500">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.title} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                ) : (
                  <Film className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="truncate text-xs sm:text-sm font-semibold text-zinc-200 group-hover:text-white transition">
                    {item.title}
                  </h4>
                  <ExternalLink className="h-3 w-3 shrink-0 text-zinc-600 group-hover:text-zinc-300" />
                </div>
                <p className="mt-0.5 truncate text-[10px] font-mono text-zinc-600">
                  {item.savedDir || "Папка не сохранена"}
                </p>
              </div>
            </button>

            {(item.savedPath || item.savedDir) && (
              <button
                type="button"
                onClick={(event) => openFolder(event, item)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Открыть папку
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
