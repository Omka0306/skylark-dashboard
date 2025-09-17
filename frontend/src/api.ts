import axios from 'axios';
import { API_URL } from './auth';
import { authHeader } from './auth';

export const http = axios.create({ baseURL: API_URL });

export async function login(username: string, password: string) {
  const res = await http.post('/auth/login', { username, password });
  return res.data as { token: string };
}

export interface Camera {
  id: string;
  name: string;
  location?: string;
  rtspUrl: string;
  enabled: boolean;
  fps: number;
  running: boolean;
}

export async function listCameras(): Promise<Camera[]> {
  const res = await http.get('/api/cameras', { headers: authHeader() });
  return res.data;
}

export async function createCamera(body: Partial<Camera>): Promise<Camera> {
  const res = await http.post('/api/cameras', body, { headers: authHeader() });
  return res.data;
}

export async function updateCamera(id: string, body: Partial<Camera>): Promise<Camera> {
  const res = await http.put(`/api/cameras/${id}`, body, { headers: authHeader() });
  return res.data;
}

export async function deleteCamera(id: string): Promise<void> {
  await http.delete(`/api/cameras/${id}`, { headers: authHeader() });
}

export interface Alert {
  id: string;
  cameraId: string;
  label: string;
  score?: number;
  snapshotUrl?: string;
  detectedAt: string;
}

export async function fetchAlerts(cameraId?: string, take = 20, skip = 0): Promise<Alert[]> {
  const params: { take: number; skip: number; cameraId?: string } = { take, skip };
  if (cameraId) params.cameraId = cameraId;
  const res = await http.get('/api/alerts', { params, headers: authHeader() });
  return res.data;
}

export async function startCamera(id: string) {
  await http.post(`/api/cameras/${id}/start`, {}, { headers: authHeader() });
}

export async function stopCamera(id: string) {
  await http.post(`/api/cameras/${id}/stop`, {}, { headers: authHeader() });
} 