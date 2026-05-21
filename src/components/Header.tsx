import React from "react";
import { Film, Video, Share2, Compass } from "lucide-react";

export function Header() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-rose-500/10 via-amber-500/10 to-indigo-500/10 border border-white/5 mb-4 shadow-sm animate-fade-in">
        <Video className="w-8 h-8 text-rose-500 animate-pulse" />
      </div>
      
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold tracking-tight text-white mb-3">
        Minimalist <span className="bg-gradient-to-r from-rose-400 via-amber-300 to-indigo-400 bg-clip-text text-transparent">Streamloader</span>
      </h1>
      
      <p className="max-w-xl mx-auto text-sm sm:text-base text-zinc-400 font-sans leading-relaxed">
        Вставьте ссылку на открытое видео из **Instagram Reels**, **YouTube**, **Pinterest** или **Vimeo**, выберите желаемое разрешение и скачайте напрямую без регистрации.
      </p>

      {/* Target Platforms Badges */}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-900 text-rose-400 border border-zinc-800">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          Instagram Reels
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-900 text-red-400 border border-zinc-800">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
          YouTube Video / Shorts
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-900 text-rose-500 border border-zinc-800">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
          Pinterest Pin
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-900 text-sky-400 border border-zinc-800">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          Vimeo Player
        </span>
      </div>
    </div>
  );
}
