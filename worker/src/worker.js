import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8080';
const PORT = Number(process.env.PORT || 8081);

const cameraIntervals = new Map();

function startCamera(cameraId) {
  if (cameraIntervals.has(cameraId)) return;
  const interval = setInterval(async () => {
    try {
      const alert = {
        cameraId,
        label: 'face',
        score: Math.random(),
        payload: { note: 'fake alert from node worker', t: Date.now() }
      };
      await axios.post(`${BACKEND_URL}/api/alerts`, alert, { timeout: 5000 });
    } catch (err) {
      // swallow errors to keep running
    }
  }, 1000);
  cameraIntervals.set(cameraId, interval);
}

function stopCamera(cameraId) {
  const itv = cameraIntervals.get(cameraId);
  if (itv) {
    clearInterval(itv);
    cameraIntervals.delete(cameraId);
  }
}

app.post('/start', (req, res) => {
  const { cameraId } = req.body || {};
  if (!cameraId) return res.status(400).json({ error: 'cameraId required' });
  startCamera(cameraId);
  res.json({ ok: true });
});

app.post('/stop', (req, res) => {
  const { cameraId } = req.body || {};
  if (!cameraId) return res.status(400).json({ error: 'cameraId required' });
  stopCamera(cameraId);
  res.json({ ok: true });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Worker listening on :${PORT}, backend: ${BACKEND_URL}`);
}); 