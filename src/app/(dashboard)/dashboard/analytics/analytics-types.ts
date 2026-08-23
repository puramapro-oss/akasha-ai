// =============================================================================
// AKASHA AI — Analytics Types
// Types pour la page analytics
// =============================================================================

export interface UsageDaily {
  date: string;
  chat_count: number;
  image_count: number;
  audio_count: number;
  code_count: number;
}

export interface UsageStats {
  todayTotal: number;
  monthTotal: number;
}

export interface KPICardData {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}
