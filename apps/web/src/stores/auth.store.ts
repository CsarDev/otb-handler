import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type User = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  permissions: string[];
};

export type AuthState = {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
};

export type AuthActions = {
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
};

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (identifier: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const data = await request<{ accessToken: string; user: User }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password }),
          });
          set({
            user: data.user,
            accessToken: data.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null });
        try {
          const data = await request<{ user: User; accessToken: string }>('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
          });
          set({
            user: data.user,
            accessToken: data.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await request('/auth/logout', { method: 'POST' });
        } finally {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
          });
        }
      },

      refresh: async () => {
        try {
          const data = await request<{ accessToken: string }>('/auth/refresh', {
            method: 'POST',
          });
          set({ accessToken: data.accessToken });
        } catch {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
          });
        }
      },

      loadUser: async () => {
        const { accessToken } = get();
        if (!accessToken) return;

        try {
          const data = await request<{ user: User }>('/auth/me', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          set({ user: data.user, isAuthenticated: true });
        } catch {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
