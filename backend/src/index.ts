import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { jwt } from 'hono/jwt';
import jwtLib from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { createServer } from 'http';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

dotenv.config();

const prisma = new PrismaClient();
const app = new Hono();

app.use('*', cors());

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// Health
app.get('/health', (c) => c.json({ status: 'ok' }));

// Auth
const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
app.post('/auth/login', async (c) => {
  const body = await c.req.json();
  const parse = loginSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Invalid payload' }, 400);
  const { username, password } = parse.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return c.json({ error: 'Invalid credentials' }, 401);
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return c.json({ error: 'Invalid credentials' }, 401);
  const token = jwtLib.sign({ sub: user.id, username }, JWT_SECRET, { expiresIn: '2d' });
  return c.json({ token });
});

// Auth middleware
app.use('/api/*', jwt({ secret: JWT_SECRET }));

function userIdFromContext(c: any): string {
  const payload = c.get('jwtPayload') as { sub?: string } | undefined;
  return payload?.sub || '';
}

// Cameras CRUD
const cameraSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  rtspUrl: z.string().min(1),
  enabled: z.boolean().optional(),
  fps: z.number().int().min(1).max(60).optional(),
});

app.get('/api/cameras', async (c) => {
  const userId = userIdFromContext(c);
  const cameras = await prisma.camera.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
  return c.json(cameras);
});

app.post('/api/cameras', async (c) => {
  const userId = userIdFromContext(c);
  const body = await c.req.json();
  const { success, data } = cameraSchema.safeParse(body);
  if (!success) return c.json({ error: 'Invalid payload' }, 400);
  const camera = await prisma.camera.create({ data: { ...data, ownerId: userId } });
  return c.json(camera);
});

app.put('/api/cameras/:id', async (c) => {
  const userId = userIdFromContext(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const { success, data } = cameraSchema.partial().safeParse(body);
  if (!success) return c.json({ error: 'Invalid payload' }, 400);
  const cam = await prisma.camera.findFirst({ where: { id, ownerId: userId } });
  if (!cam) return c.json({ error: 'Not found' }, 404);
  const updated = await prisma.camera.update({ where: { id }, data });
  // Notify worker if running/fps changed could be handled here
  return c.json(updated);
});

app.delete('/api/cameras/:id', async (c) => {
  const userId = userIdFromContext(c);
  const id = c.req.param('id');
  const cam = await prisma.camera.findFirst({ where: { id, ownerId: userId } });
  if (!cam) return c.json({ error: 'Not found' }, 404);
  await prisma.alert.deleteMany({ where: { cameraId: id } });
  await prisma.camera.delete({ where: { id } });
  return c.json({ ok: true });
});

// Start/Stop camera processing (delegated to worker)
app.post('/api/cameras/:id/start', async (c) => {
  const userId = userIdFromContext(c);
  const id = c.req.param('id');
  const cam = await prisma.camera.findFirst({ where: { id, ownerId: userId } });
  if (!cam) return c.json({ error: 'Not found' }, 404);
  await prisma.camera.update({ where: { id }, data: { running: true } });
  // Inform worker
  await fetch(`${process.env.WORKER_URL || 'http://worker:8081'}/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cameraId: id, rtspUrl: cam.rtspUrl, fps: cam.fps })
  });
  broadcast({ type: 'camera_state', cameraId: id, running: true });
  return c.json({ ok: true });
});

app.post('/api/cameras/:id/stop', async (c) => {
  const userId = userIdFromContext(c);
  const id = c.req.param('id');
  const cam = await prisma.camera.findFirst({ where: { id, ownerId: userId } });
  if (!cam) return c.json({ error: 'Not found' }, 404);
  await prisma.camera.update({ where: { id }, data: { running: false } });
  await fetch(`${process.env.WORKER_URL || 'http://worker:8081'}/stop`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cameraId: id })
  });
  broadcast({ type: 'camera_state', cameraId: id, running: false });
  return c.json({ ok: true });
});

// Alerts
app.get('/api/alerts', async (c) => {
  const userId = userIdFromContext(c);
  const cameraId = c.req.query('cameraId') || undefined;
  const take = Math.min(parseInt(c.req.query('take') || '20', 10), 100);
  const skip = parseInt(c.req.query('skip') || '0', 10);
  const where: any = { camera: { ownerId: userId } };
  if (cameraId) where.cameraId = cameraId;
  const alerts = await prisma.alert.findMany({ where, orderBy: { detectedAt: 'desc' }, take, skip });
  return c.json(alerts);
});

// Worker posts alerts here
app.post('/api/alerts', async (c) => {
  const body = await c.req.json();
  const schema = z.object({ cameraId: z.string(), label: z.string().default('face'), score: z.number().optional(), snapshotUrl: z.string().optional(), payload: z.any().optional() });
  const { success, data } = schema.safeParse(body);
  if (!success) return c.json({ error: 'Invalid payload' }, 400);
  const alert = await prisma.alert.create({ data });
  broadcast({ type: 'alert', alert });
  return c.json(alert);
});

// WebSocket for realtime alerts on separate port
const wsPort = Number(process.env.WS_PORT || 8082);
const wss = new WebSocketServer({ port: wsPort });

type ServerEvent =
  | { type: 'alert'; alert: any }
  | { type: 'camera_state'; cameraId: string; running: boolean };

const wsClients = new Set<any>();

function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event);
  for (const client of wsClients) {
    if (client.readyState === 1) client.send(payload);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', 'http://localhost');
  const token = url.searchParams.get('token') || '';
  try {
    jwtLib.verify(token, JWT_SECRET);
  } catch {
    ws.close();
    return;
  }
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

serve({ fetch: app.fetch, port: Number(process.env.PORT || 8080) });
console.log(`Backend listening on :${process.env.PORT || 8080}, WS :${wsPort}`); 