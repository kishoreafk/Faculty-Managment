import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  maxRedirects: 0,
  timeout: 30_000
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const onLogin = window.location.pathname === '/login' || window.location.pathname === '/signup';

    if (status === 401 && !onLogin) {
      const message = (error.response?.data as { error?: string } | undefined)?.error;
      if (message?.toLowerCase().includes('deactivat') || message?.toLowerCase().includes('removed')) {
        localStorage.setItem('loginError', 'Your account has been deactivated or removed. Please contact admin.');
      } else {
        localStorage.setItem('loginError', 'Your session has expired. Please sign in again.');
      }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Swallow.
  }
}

export default api;

