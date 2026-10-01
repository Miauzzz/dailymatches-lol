// --- Tipado del entorno (Env bindings) para Cloudflare Workers ---
export interface Env {
  RIOT_API_KEY: string;
  MONGO_URI: string;
  MONGO_DB_NAME: string;
}

// --- Interfaces de Riot API ---

export interface RiotAccountInfo {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

export interface SummonerExtra {
  id: string;
  accountId: string;
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

export interface LeagueEntry {
  leagueId: string;
  summonerId: string;
  queueType: string; // 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR'
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
}

export interface MatchDetails {
  metadata: {
    dataVersion: string;
    matchId: string;
    participants: string[];
  };
  info: {
    queueId: number;
    gameDuration: number;
    participants: MatchParticipant[];
    [key: string]: unknown;
  };
}

export interface MatchParticipant {
  puuid: string;
  win: boolean;
  [key: string]: unknown;
}

// --- Interfaces de MongoDB (documentos) ---

export interface SummonerDocument {
  _id?: unknown;
  puuid: string;
  alias: string;
  summoner: string;
  tagline: string;
  server: string;
  summoner_level: number | null;
  soloq_wins: number;
  soloq_losses: number;
  soloq_tier: string | null;
  soloq_rank: string | null;
  soloq_lp: number | null;
  flexq_wins: number;
  flexq_losses: number;
  flexq_tier: string | null;
  flexq_rank: string | null;
  flexq_lp: number | null;
  last_update: string; // ISO 8601 string (stored/returned by Data API)
}

// --- Interfaces de payloads de entrada ---

export interface AddSummonerPayload {
  summoner_name?: string;
  tagline?: string;
  server?: string;
  alias?: string;
}

// --- Interfaces de respuesta interna ---

export interface LogicResult {
  message?: string;
  error?: string;
  status: number;
}

// --- Tipos de cola ---

export type QueueType = 'soloq' | 'flexq';
