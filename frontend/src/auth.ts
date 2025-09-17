import create from 'zustand';

interface AuthState {
  token: string | null;
  setToken: (t: string | null) => void;
  bootstrap: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  setToken: (t) => {
    if (t) localStorage.setItem('token', t); else localStorage.removeItem('token');
    set({ token: t });
  },
  bootstrap: () => {
    const t = localStorage.getItem('token');
    set({ token: t });
  }
}));

export function authHeader() {
  const t = useAuthStore.getState().token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
export const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE || 'http://localhost:8888'; 