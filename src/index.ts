import { Hono } from 'hono';
import type { Env, AddSummonerPayload } from './types';
import { logicGetQueueStats, logicAddSummoner } from './gestionapi';

const app = new Hono<{ Bindings: Env }>();

// --- RUTA 1: GET /summoner/:queue_type/:server/:alias ---
// Equivale a: @app.route(route="summoner/{queue_type}/{server}/{alias}", methods=["GET"])
app.get('/summoner/:queue_type/:server/:alias', async (c) => {
  try {
    const queueType = c.req.param('queue_type');
    const server = c.req.param('server');
    const alias = c.req.param('alias');

    const resultado = await logicGetQueueStats(queueType, server, alias, c.env);

    if ('error' in resultado && resultado.error) {
      return c.text(resultado.error, resultado.status as 400 | 404 | 500);
    }

    return c.text(resultado.message!, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.text(`Error interno: ${message}`, 500);
  }
});

// --- RUTA 2: POST /summoner ---
// Equivale a: @app.route(route="summoner", methods=["POST"])
app.post('/summoner', async (c) => {
  try {
    let reqBody: AddSummonerPayload;
    try {
      reqBody = await c.req.json<AddSummonerPayload>();
    } catch {
      return c.text('JSON inválido', 400);
    }

    const resultado = await logicAddSummoner(reqBody, c.env);
    return c.text(resultado.message!, resultado.status as 200 | 201 | 400 | 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.text(`Error: ${message}`, 500);
  }
});

// --- RUTA 3: GET /test ---
// Equivale a: @app.route(route="test", methods=["GET"])
app.get('/test', (c) => {
  return c.text('¡La API está viva y gestionapi se importó correctamente!', 200);
});

export default app;
