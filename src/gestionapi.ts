import type {
  Env,
  RiotAccountInfo,
  SummonerExtra,
  LeagueEntry,
  MatchDetails,
  AddSummonerPayload,
  LogicResult,
  QueueType,
} from './types';
import { findOne, insertOne, updateOne } from './db';

// --- Configuración de constantes (idéntica al Python) ---

const SOLOQ_QUEUE_ID = 420;
const FLEXQ_QUEUE_ID = 440;
const VALID_QUEUES: Record<QueueType, number> = {
  soloq: SOLOQ_QUEUE_ID,
  flexq: FLEXQ_QUEUE_ID,
};

// Mapeo de server (plataforma) a host de API
const PLATFORM_HOSTS: Record<string, string> = {
  na1:  'na1.api.riotgames.com',
  la1:  'la1.api.riotgames.com',
  la2:  'la2.api.riotgames.com',
  br1:  'br1.api.riotgames.com',
  euw1: 'euw1.api.riotgames.com',
  eun1: 'eun1.api.riotgames.com',
  tr1:  'tr1.api.riotgames.com',
  ru:   'ru.api.riotgames.com',
  kr:   'kr.api.riotgames.com',
  jp1:  'jp1.api.riotgames.com',
  oc1:  'oc1.api.riotgames.com',
};

// Mapeo de server a endpoint regional (match/v5, account/v1)
const PLATFORM_TO_REGIONAL: Record<string, string> = {
  na1:  'americas',
  la1:  'americas',
  la2:  'americas',
  br1:  'americas',
  euw1: 'europe',
  eun1: 'europe',
  tr1:  'europe',
  ru:   'europe',
  kr:   'asia',
  jp1:  'asia',
  oc1:  'sea',
};

// --- FUNCIONES AUXILIARES ---

async function getSummonerInfo(
  summonerName: string,
  tagline: string,
  region: string,
  apiKey: string
): Promise<RiotAccountInfo | null> {
  const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${summonerName}/${tagline}?api_key=${apiKey}`;
  const response = await fetch(url);
  return response.status === 200 ? (response.json() as Promise<RiotAccountInfo>) : null;
}

async function getAccountByPuuid(
  puuid: string,
  region: string,
  apiKey: string
): Promise<RiotAccountInfo | null> {
  const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}?api_key=${apiKey}`;
  const response = await fetch(url);
  return response.status === 200 ? (response.json() as Promise<RiotAccountInfo>) : null;
}

async function getSummonerExtra(
  puuid: string,
  server: string,
  apiKey: string
): Promise<SummonerExtra | null> {
  const platform = PLATFORM_HOSTS[server];
  const url = `https://${platform}/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${apiKey}`;
  const response = await fetch(url);
  return response.status === 200 ? (response.json() as Promise<SummonerExtra>) : null;
}

async function getLeagueInfo(
  puuid: string,
  server: string,
  apiKey: string
): Promise<LeagueEntry[] | null> {
  const platform = PLATFORM_HOSTS[server];
  const url = `https://${platform}/lol/league/v4/entries/by-puuid/${puuid}?api_key=${apiKey}`;
  const response = await fetch(url);
  return response.status === 200 ? (response.json() as Promise<LeagueEntry[]>) : null;
}

async function getMatches(
  puuid: string,
  region: string,
  apiKey: string
): Promise<string[]> {
  // Zona horaria America/Santiago — equivale al pytz del Python
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' })
  );

  // Reconstruir como Date real en la zona Chile para obtener timestamps correctos
  const chileTzOffset = getChileOffsetMs();
  const nowChile = new Date(Date.now() + chileTzOffset);

  const hour = nowChile.getUTCHours();

  let startTime: Date;
  if (hour < 4) {
    // Pertenece al día anterior
    startTime = new Date(Date.UTC(
      nowChile.getUTCFullYear(),
      nowChile.getUTCMonth(),
      nowChile.getUTCDate() - 1,
      4, 0, 0, 0
    ));
  } else {
    startTime = new Date(Date.UTC(
      nowChile.getUTCFullYear(),
      nowChile.getUTCMonth(),
      nowChile.getUTCDate(),
      4, 0, 0, 0
    ));
  }
  // startTime está en "hora Chile UTC-offset", convertir a UTC real
  const startTimeUtc = new Date(startTime.getTime() - chileTzOffset);
  const endTimeUtc = new Date(startTimeUtc.getTime() + 24 * 60 * 60 * 1000);

  const startEpoch = Math.floor(startTimeUtc.getTime() / 1000);
  const endEpoch = Math.floor(endTimeUtc.getTime() / 1000);

  const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${startEpoch}&endTime=${endEpoch}&api_key=${apiKey}`;
  const response = await fetch(url);
  return response.status === 200 ? (response.json() as Promise<string[]>) : [];
}

/**
 * Obtiene el offset de la zona horaria America/Santiago respecto a UTC en milisegundos.
 * Chile usa CLT (UTC-4) o CLST (UTC-3) según horario de verano.
 */
function getChileOffsetMs(): number {
  const now = new Date();
  // Generar un string formateado en la zona Chile y parsearlo para calcular el offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

  const chileDate = new Date(Date.UTC(
    parseInt(get('year')),
    parseInt(get('month')) - 1,
    parseInt(get('day')),
    parseInt(get('hour')),
    parseInt(get('minute')),
    parseInt(get('second'))
  ));
  return chileDate.getTime() - now.getTime();
}

async function getMatchDetails(
  matchId: string,
  region: string,
  apiKey: string
): Promise<MatchDetails | null> {
  const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${apiKey}`;
  const response = await fetch(url);
  return response.status === 200 ? (response.json() as Promise<MatchDetails>) : null;
}

async function processMatches(
  puuid: string,
  queueType: QueueType,
  region: string,
  apiKey: string
): Promise<[number, number]> {
  const matches = await getMatches(puuid, region, apiKey);
  let wins = 0;
  let losses = 0;
  const targetQueue = VALID_QUEUES[queueType];

  for (const matchId of matches) {
    const matchDetails = await getMatchDetails(matchId, region, apiKey);
    if (matchDetails && matchDetails.info.queueId === targetQueue) {
      if (matchDetails.info.gameDuration >= 300) {
        for (const participant of matchDetails.info.participants) {
          if (participant.puuid === puuid) {
            if (participant.win) {
              wins += 1;
            } else {
              losses += 1;
            }
            break;
          }
        }
      }
    }
  }
  return [wins, losses];
}

function getQueueLeagueInfo(
  leagueInfo: LeagueEntry[],
  queueType: QueueType
): [string | null, string | null, number | null] {
  const targetQueue = queueType === 'soloq' ? 'RANKED_SOLO_5x5' : 'RANKED_FLEX_SR';
  for (const entry of leagueInfo) {
    if (entry.queueType === targetQueue) {
      return [entry.tier, entry.rank, entry.leaguePoints];
    }
  }
  return [null, null, null];
}

/**
 * Formatea la hora actual en Chile como HH:MM (equivalente a strftime("%H:%M")).
 */
function formatChileTime(): string {
  const formatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(new Date());
}

/**
 * Obtiene la fecha actual en Chile como Date.
 */
function getNowChile(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' })
  );
}

// --- LÓGICA PRINCIPAL (equivalente a las funciones de gestionapi.py) ---

export async function logicGetQueueStats(
  queueType: string,
  server: string,
  alias: string,
  env: Env
): Promise<LogicResult> {
  const chileTzOffset = getChileOffsetMs();
  const nowChile = new Date(Date.now() + chileTzOffset);

  if (!(queueType in VALID_QUEUES)) {
    return { error: 'Tipo de cola inválido', status: 400 };
  }
  if (!(server in PLATFORM_HOSTS)) {
    return {
      error: `Servidor inválido. Válidos: ${JSON.stringify(Object.keys(PLATFORM_HOSTS))}`,
      status: 400,
    };
  }

  const qt = queueType as QueueType;
  const region = PLATFORM_TO_REGIONAL[server];
  alias = alias.toLowerCase();

  const summonerData = await findOne(env, { alias, server });
  if (!summonerData) {
    return { error: 'No existe el invocador en la base de datos', status: 404 };
  }

  // Reset diario (Lógica 4 AM) — idéntica al Python
  const lastUpdateRaw = summonerData.last_update;
  const lastUpdate = new Date(lastUpdateRaw);
  const lastUpdateChile = new Date(lastUpdate.getTime() + chileTzOffset);

  // game_day = (fecha - 4 horas).date()
  const gameDayNow = new Date(nowChile.getTime() - 4 * 60 * 60 * 1000);
  const gameDayLast = new Date(lastUpdateChile.getTime() - 4 * 60 * 60 * 1000);

  const gameDayNowDate = `${gameDayNow.getUTCFullYear()}-${gameDayNow.getUTCMonth()}-${gameDayNow.getUTCDate()}`;
  const gameDayLastDate = `${gameDayLast.getUTCFullYear()}-${gameDayLast.getUTCMonth()}-${gameDayLast.getUTCDate()}`;

  if (gameDayNowDate > gameDayLastDate) {
    await updateOne(
      env,
      { puuid: summonerData.puuid },
      {
        $set: {
          [`${qt}_wins`]: 0,
          [`${qt}_losses`]: 0,
          last_update: new Date().toISOString(),
        },
      }
    );
  }

  const puuid = summonerData.puuid;

  // Auto-sync: actualizar summoner name y tagline desde Riot
  const riotAccount = await getAccountByPuuid(puuid, region, env.RIOT_API_KEY);
  if (riotAccount) {
    const riotName = (riotAccount.gameName ?? '').toLowerCase();
    const riotTag = (riotAccount.tagLine ?? '').toLowerCase();
    if (riotName && riotTag) {
      if (riotName !== summonerData.summoner || riotTag !== summonerData.tagline) {
        await updateOne(
          env,
          { puuid },
          { $set: { summoner: riotName, tagline: riotTag } }
        );
      }
    }
  }

  const [wins, losses] = await processMatches(puuid, qt, region, env.RIOT_API_KEY);

  const leagueInfo = await getLeagueInfo(puuid, server, env.RIOT_API_KEY);
  const [tier, rank, lp] = leagueInfo
    ? getQueueLeagueInfo(leagueInfo, qt)
    : [null, null, null];

  // Actualizar BD
  const nowIso = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    [`${qt}_wins`]: wins,
    [`${qt}_losses`]: losses,
    [`${qt}_tier`]: tier,
    [`${qt}_rank`]: rank,
    [`${qt}_lp`]: lp,
    last_update: nowIso,
  };

  await updateOne(env, { puuid }, { $set: updateData });

  const leagueStatus =
    tier && rank && lp !== null
      ? `| ${tier} ${rank} (${lp} LP)`
      : '| Sin rango';

  const formattedLastUpdate = formatChileTime();

  return {
    message: `Victorias: ${wins} / Derrotas: ${losses} ${leagueStatus} (Act. ${formattedLastUpdate})`,
    status: 200,
  };
}

export async function logicAddSummoner(
  data: AddSummonerPayload,
  env: Env
): Promise<LogicResult> {
  const summonerName = (data.summoner_name ?? '').toLowerCase();
  const tagline = (data.tagline ?? '').toLowerCase();
  const server = (data.server ?? '').toLowerCase();
  const alias = (data.alias ?? '').toLowerCase();

  if (!summonerName || !tagline || !server || !alias) {
    return {
      message: 'Faltan datos (summoner_name, tagline, server, alias)',
      status: 400,
    };
  }
  if (!(server in PLATFORM_HOSTS)) {
    return {
      message: `Servidor inválido. Válidos: ${JSON.stringify(Object.keys(PLATFORM_HOSTS))}`,
      status: 400,
    };
  }

  const existing = await findOne(env, { alias, server });
  if (existing) {
    return {
      message: `Ya existe un invocador con alias '${alias}' en el servidor '${server}'`,
      status: 400,
    };
  }

  const region = PLATFORM_TO_REGIONAL[server];

  const summonerInfo = await getSummonerInfo(summonerName, tagline, region, env.RIOT_API_KEY);
  if (!summonerInfo || !('puuid' in summonerInfo)) {
    return {
      message: "No existe el invocador en Riot o la respuesta no contiene 'puuid'",
      status: 404,
    };
  }

  const puuid = summonerInfo.puuid;

  const existingByPuuid = await findOne(env, { puuid, server });
  if (existingByPuuid) {
    return { message: 'El invocador ya existe en la base de datos', status: 400 };
  }

  const summonerExtra = await getSummonerExtra(puuid, server, env.RIOT_API_KEY);

  const leagueInfo = await getLeagueInfo(puuid, server, env.RIOT_API_KEY);
  const [soloqTier, soloqRank, soloqLp] = leagueInfo
    ? getQueueLeagueInfo(leagueInfo, 'soloq')
    : [null, null, null];
  const [flexqTier, flexqRank, flexqLp] = leagueInfo
    ? getQueueLeagueInfo(leagueInfo, 'flexq')
    : [null, null, null];

  const newSummoner = {
    puuid,
    alias,
    summoner: summonerName,
    tagline,
    server,
    summoner_level: summonerExtra?.summonerLevel ?? null,
    soloq_wins: 0,
    soloq_losses: 0,
    soloq_tier: soloqTier,
    soloq_rank: soloqRank,
    soloq_lp: soloqLp,
    flexq_wins: 0,
    flexq_losses: 0,
    flexq_tier: flexqTier,
    flexq_rank: flexqRank,
    flexq_lp: flexqLp,
    last_update: new Date().toISOString(),
  };

  await insertOne(env, newSummoner);
  return { message: 'Invocador agregado exitosamente', status: 201 };
}
