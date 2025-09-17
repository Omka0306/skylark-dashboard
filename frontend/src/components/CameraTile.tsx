import { useEffect, useRef, useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { Camera, Alert } from '../api';
import { startCamera, stopCamera, fetchAlerts, updateCamera } from '../api';
import { MEDIA_BASE, WS_URL, useAuthStore } from '../auth';

async function startWhep(video: HTMLVideoElement, streamPath: string) {
  const pc = new RTCPeerConnection();
  const ms = new MediaStream();
  video.srcObject = ms;
  video.play().catch(() => {});
  pc.ontrack = (ev) => ms.addTrack(ev.track);
  pc.addTransceiver('video', { direction: 'recvonly' });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const resp = await fetch(`${MEDIA_BASE}/whep/${streamPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/sdp' },
    body: offer.sdp || ''
  });
  const answerSdp = await resp.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  return pc;
}

export default function CameraTile({ camera }: { camera: Camera }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    fetchAlerts(camera.id, 5, 0).then(setAlerts).catch(() => {});
  }, [camera.id]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'alert' && msg.alert.cameraId === camera.id) {
        setAlerts((prev) => [msg.alert, ...prev].slice(0, 5));
      }
      if (msg.type === 'camera_state' && msg.cameraId === camera.id) {
        // noop
      }
    };
    return () => ws.close();
  }, [camera.id, token]);

  async function handleStart() {
    setLoading(true);
    try {
      await startCamera(camera.id);
      await updateCamera(camera.id, { running: true });
      if (videoRef.current) {
        pcRef.current = await startWhep(videoRef.current, `camera-${camera.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    try {
      await stopCamera(camera.id);
      await updateCamera(camera.id, { running: false });
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="subtitle1">{camera.name} {camera.location && <Chip label={camera.location} size="small" sx={{ ml: 1 }} />}</Typography>
          <Box bgcolor="#000" position="relative">
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%' }} />
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={loading} onClick={handleStart}>Start</Button>
            <Button variant="outlined" disabled={loading} onClick={handleStop}>Stop</Button>
          </Stack>
          <Stack spacing={0.5}>
            {alerts.map(a => (
              <MuiAlert key={a.id} severity="info">{new Date(a.detectedAt).toLocaleTimeString()} - {a.label}{a.score ? ` (${a.score.toFixed(2)})` : ''}</MuiAlert>
            ))}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
} 