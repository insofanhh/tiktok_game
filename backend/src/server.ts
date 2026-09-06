import 'dotenv/config';
import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { z } from 'zod';
import { GameEngine } from './game/game-engine.js';
import type { GameAction, GameState, IncomingGift, ViewerIdentity } from './game/types.js';
import type { EventSink, LiveEventSource, SourceStatus } from './integrations/event-source.js';
import { EulerStreamSource } from './integrations/euler-stream.js';
import { MockTikTokSource } from './integrations/mock-tiktok.js';
import {
  normalizeTikTokUsername,
  RuntimeSettingsStore,
  type RuntimeSettings,
} from './settings/runtime-settings.js';

interface ServerToClientEvents {
  'game:state': (state: GameState) => void;
  'game:action': (action: GameAction) => void;
  'source:status': (status: SourceStatus) => void;
  'settings:runtime': (settings: PublicRuntimeSettings) => void;
}

interface ClientToServerEvents {
  'game:request-state': () => void;
}

const env = z.object({
  PORT: z.coerce.number().int().positive().default(4100),
  HOST: z.string().default('127.0.0.1'),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  TIKTOK_MODE: z.enum(['mock', 'live']).default('mock'),
  TIKTOK_USERNAME: z.string().default(''),
  EULER_API_KEY: z.string().default(''),
  MOCK_INTERVAL_MS: z.coerce.number().int().min(0).default(2400),
  ROUND_DURATION_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
}).parse(process.env);

const viewerSchema = z.object({
  userId: z.string().min(1).max(100),
  uniqueId: z.string().min(1).max(100),
  nickname: z.string().min(1).max(80),
  avatarUrl: z.url().optional(),
});
const memberSchema = z.object({ viewer: viewerSchema });
const likeSchema = z.object({ viewer: viewerSchema, count: z.number().int().min(1).max(100000).default(1) });
const chatSchema = z.object({ viewer: viewerSchema, comment: z.string().max(200) });
const giftSchema = z.object({
  viewer: viewerSchema,
  giftName: z.string().min(1).max(100),
  repeatCount: z.number().int().min(1).max(100).default(1),
  diamondCount: z.number().int().min(1).max(1_000_000).optional(),
});
const sourceSettingsSchema = z.object({
  mode: z.enum(['mock', 'live']),
  username: z.string().max(100).default(''),
});
const roundSettingsSchema = z.object({
  roundDurationMinutes: z.number().int().min(1).max(120),
});

interface PublicRuntimeSettings extends RuntimeSettings {
  hasEulerApiKey: boolean;
  roundStartedAt: number;
  source: SourceStatus;
}

function toViewer(input: z.infer<typeof viewerSchema>): ViewerIdentity {
  const viewer: ViewerIdentity = {
    userId: input.userId,
    uniqueId: input.uniqueId,
    nickname: input.nickname,
  };
  if (input.avatarUrl) viewer.avatarUrl = input.avatarUrl;
  return viewer;
}

const app = express();
const httpServer = createServer(app);
const allowedOrigins = env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim());
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: allowedOrigins },
});
const engine = new GameEngine({ gridSize: 20 });
const settingsStore = new RuntimeSettingsStore(new URL('../data/runtime-settings.json', import.meta.url));
let runtimeSettings = await settingsStore.load({
  mode: env.TIKTOK_MODE,
  username: normalizeTikTokUsername(env.TIKTOK_USERNAME),
  roundDurationMinutes: env.ROUND_DURATION_MINUTES,
});
engine.reset(runtimeSettings.roundDurationMinutes * 60_000);
let roundStartedAt = engine.getState().round.startedAt;
let source: LiveEventSource | null = null;
let sourceTransition: Promise<void> = Promise.resolve();

let sourceStatus: SourceStatus = {
  mode: env.TIKTOK_MODE === 'live' ? 'tiktok' : 'mock',
  connected: false,
  label: 'Đang khởi tạo nguồn sự kiện',
};

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '32kb' }));

function publishState(): void {
  io.emit('game:state', engine.getState());
}

function processChat(viewer: ViewerIdentity, comment: string): GameAction | null {
  const action = engine.handleChat(viewer, comment);
  if (action) {
    io.emit('game:action', action);
    publishState();
  }
  return action;
}

function processGift(viewer: ViewerIdentity, gift: IncomingGift): GameAction[] {
  const actions = engine.handleGift(viewer, gift);
  for (const action of actions) io.emit('game:action', action);
  publishState();
  return actions;
}

function processJoin(viewer: ViewerIdentity): GameAction[] {
  return publishActions(engine.handleJoin(viewer));
}
function processLike(viewer: ViewerIdentity, count: number): GameAction[] {
  return publishActions(engine.handleLike(viewer, count));
}
function publishActions(actions: GameAction[]): GameAction[] {
  for (const action of actions) io.emit('game:action', action);
  publishState();
  return actions;
}
const sink: EventSink = {
  onJoin: processJoin,
  onLike: processLike,
  onChat: processChat,
  onGift: processGift,
  onStatus: (status) => {
    sourceStatus = status;
    io.emit('source:status', status);
  },
};

function requireLiveConfig(value: string, name: 'TIKTOK_USERNAME' | 'EULER_API_KEY'): string {
  if (!value) throw new Error(`${name} is required in live mode`);
  return value;
}

function createEventSource(settings: RuntimeSettings): LiveEventSource {
  if (settings.mode === 'mock') return new MockTikTokSource(sink, env.MOCK_INTERVAL_MS);
  return new EulerStreamSource(
    requireLiveConfig(settings.username, 'TIKTOK_USERNAME'),
    sink,
    requireLiveConfig(env.EULER_API_KEY, 'EULER_API_KEY'),
  );
}

async function activateSource(settings: RuntimeSettings, persist: boolean): Promise<void> {
  if (source) {
    await source.stop();
    source = null;
  }

  const changed = runtimeSettings.mode !== settings.mode || runtimeSettings.username !== settings.username;
  runtimeSettings = settings;
  if (changed) {
    engine.reset(settings.roundDurationMinutes * 60_000);
    roundStartedAt = engine.getState().round.startedAt;
    publishState();
    publishRuntimeSettings();
  }
  if (persist) await settingsStore.save(settings);

  sink.onStatus({
    mode: settings.mode === 'live' ? 'tiktok' : 'mock',
    connected: false,
    label: settings.mode === 'live'
      ? `Đang kết nối @${settings.username}`
      : 'Đang khởi động TikTok Mock',
  });

  source = createEventSource(settings);
  try {
    await source.start();
  } catch (error: unknown) {
    const label = error instanceof Error ? error.message : 'Không thể khởi động nguồn TikTok';
    if (sourceStatus.label !== label) {
      sink.onStatus({ mode: sourceStatus.mode, connected: false, label });
    }
    throw error;
  }
}

function queueSourceActivation(settings: RuntimeSettings, persist: boolean): Promise<void> {
  const transition = sourceTransition.then(() => activateSource(settings, persist));
  sourceTransition = transition.catch(() => undefined);
  return transition;
}

function publicSettings(): PublicRuntimeSettings {
  return {
    ...runtimeSettings,
    hasEulerApiKey: Boolean(env.EULER_API_KEY),
    roundStartedAt,
    source: sourceStatus,
  };
}

function publishRuntimeSettings(): void {
  io.emit('settings:runtime', publicSettings());
}

app.get('/health', (_request, response) => {
  response.json({ ok: true, source: sourceStatus, version: engine.getState().version });
});

app.get('/api/state', (_request, response) => {
  response.json(engine.getState());
});

app.get('/api/settings', (_request, response) => {
  response.json(publicSettings());
});

app.post('/api/settings/source', async (request, response) => {
  const parsed = sourceSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Cấu hình nguồn phát không hợp lệ' });
    return;
  }

  const settings: RuntimeSettings = {
    mode: parsed.data.mode,
    username: normalizeTikTokUsername(parsed.data.username),
    roundDurationMinutes: runtimeSettings.roundDurationMinutes,
  };
  if (settings.mode === 'live' && !settings.username) {
    response.status(400).json({ error: 'Vui lòng nhập username TikTok đang livestream' });
    return;
  }
  if (settings.mode === 'live' && !env.EULER_API_KEY) {
    response.status(400).json({ error: 'Euler API key chưa được cấu hình trên backend' });
    return;
  }

  try {
    await queueSourceActivation(settings, true);
    response.status(sourceStatus.retryAt ? 202 : 200).json(publicSettings());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Không thể kết nối TikTok Live';
    response.status(502).json({ error: message, settings: publicSettings() });
  }
});

app.post('/api/settings/round', async (request, response) => {
  const parsed = roundSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Thời gian mỗi vòng phải từ 1 đến 120 phút' });
    return;
  }

  const nextSettings: RuntimeSettings = {
    ...runtimeSettings,
    roundDurationMinutes: parsed.data.roundDurationMinutes,
  };

  try {
    await settingsStore.save(nextSettings);
    runtimeSettings = nextSettings;
    engine.reset(runtimeSettings.roundDurationMinutes * 60_000, true);
    roundStartedAt = engine.getState().round.startedAt;
    publishState();
    publishRuntimeSettings();
    response.json(publicSettings());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Không thể lưu thời gian vòng';
    response.status(500).json({ error: message });
  }
});

app.use('/api/mock', (_request, response, next) => {
  if (runtimeSettings.mode !== 'mock') { response.status(403).json({ error: 'Chỉ dùng được trong chế độ Mock' }); return; }
  next();
});
app.post('/api/mock/join', (request, response) => {
  const parsed = memberSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: parsed.error.flatten() }); return; }
  response.json({ actions: processJoin(toViewer(parsed.data.viewer)), state: engine.getState() });
});
app.post('/api/mock/like', (request, response) => {
  const parsed = likeSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: parsed.error.flatten() }); return; }
  response.json({ actions: processLike(toViewer(parsed.data.viewer), parsed.data.count), state: engine.getState() });
});
app.post('/api/mock/finish', (_request, response) => {
  const state = engine.finishRound();
  publishState();
  response.json(state);
});
app.post('/api/round/restart', (_request, response) => {
  const state = engine.reset(runtimeSettings.roundDurationMinutes * 60_000, true);
  roundStartedAt = state.round.startedAt;
  publishState();
  publishRuntimeSettings();
  response.json(state);
});
app.post('/api/mock/chat', (request, response) => {
  const parsed = chatSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  response.json({ action: processChat(toViewer(parsed.data.viewer), parsed.data.comment), state: engine.getState() });
});

app.post('/api/mock/gift', (request, response) => {
  const parsed = giftSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  response.json({
    actions: processGift(toViewer(parsed.data.viewer), {
      giftName: parsed.data.giftName,
      repeatCount: parsed.data.repeatCount,
      ...(parsed.data.diamondCount !== undefined ? { diamondCount: parsed.data.diamondCount } : {}),
    }),
    state: engine.getState(),
  });
});

app.post('/api/mock/reset', (_request, response) => {
  const state = engine.reset();
  roundStartedAt = state.round.startedAt;
  publishRuntimeSettings();
  io.emit('game:state', state);
  response.json(state);
});

io.on('connection', (socket) => {
  socket.emit('game:state', engine.getState());
  socket.emit('source:status', sourceStatus);
  socket.emit('settings:runtime', publicSettings());
  socket.on('game:request-state', () => socket.emit('game:state', engine.getState()));
});

httpServer.listen(env.PORT, env.HOST, () => {
  console.info(`TikGame backend listening on http://${env.HOST}:${env.PORT}`);
  void queueSourceActivation(runtimeSettings, false).catch((error: unknown) => {
    console.error(error);
  });
});

let publishedRoundStatus = engine.getState().round.status;
const roundTimer = setInterval(() => {
  engine.finishIfExpired();
  const restarted = engine.restartIfDue();
  const state = engine.getState();
  if (restarted) {
    roundStartedAt = state.round.startedAt;
    publishRuntimeSettings();
  }
  const status = state.round.status;
  if (restarted || status !== publishedRoundStatus) {
    publishedRoundStatus = status;
    publishState();
  }
}, 250);

async function shutdown(): Promise<void> {
  clearInterval(roundTimer);
  await sourceTransition;
  if (source) await source.stop();
  io.close();
  httpServer.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
