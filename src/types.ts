export type Platform = "instagram" | "youtube" | "pinterest" | "vimeo" | "tiktok" | "reddit" | "twitter" | "vk" | "yandex" | "dailymotion" | "twitch" | "unknown";

export interface DownloadFormat {
  id: string;
  label: string;
  resolution: string;
  size: string;
  url: string;
  isReal: boolean;
}

export interface VideoDetails {
  title: string;
  thumbnail: string;
  duration?: string;
  platform: Platform;
  originalUrl: string;
  formats: DownloadFormat[];
  note?: string;
}

export interface HistoryItem {
  id: string;
  title: string;
  platform: Platform;
  thumbnail: string;
  url: string;
  timestamp: string;
  resolution: string;
  savedPath?: string;
  savedDir?: string;
}

export interface CompletedDownload {
  savedPath?: string;
  savedDir?: string;
}

export interface DownloadProgress {
  active: boolean;
  progress: number;
  status: string;
  savedPath?: string;
  savedDir?: string;
  error?: string;
}
