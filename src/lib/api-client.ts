import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // If error is 401 and we haven't tried to refresh yet
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // If already refreshing, wait for new token
            return new Promise((resolve) => {
              this.refreshSubscribers.push((token: string) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(this.client(originalRequest));
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const refreshToken = localStorage.getItem('refresh_token');
            
            if (!refreshToken) {
              throw new Error('No refresh token');
            }

            const { data } = await axios.post(`${API_URL}/auth/refresh`, {
              refreshToken,
            });

            const { accessToken } = data.data;
            localStorage.setItem('access_token', accessToken);

            // Notify all waiting requests
            this.refreshSubscribers.forEach((callback) => callback(accessToken));
            this.refreshSubscribers = [];

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed - logout user
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            window.location.href = '/auth';
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async login(email: string, password: string) {
    const { data } = await this.client.post('/auth/login', { email, password });
    return data.data;
  }

  async register(email: string, password: string, fullName: string) {
    const { data } = await this.client.post('/auth/register', {
      email,
      password,
      fullName,
    });
    return data.data;
  }

  async logout() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      await this.client.post('/auth/logout', { refreshToken });
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  }

  // Generic request methods
  async get<T = any>(url: string, config?: any): Promise<T> {
    const { data } = await this.client.get(url, config);
    return data.data;
  }

  async post<T = any>(url: string, body?: any, config?: any): Promise<T> {
    const { data } = await this.client.post(url, body, config);
    return data.data;
  }

  async put<T = any>(url: string, body?: any, config?: any): Promise<T> {
    const { data } = await this.client.put(url, body, config);
    return data.data;
  }

  async patch<T = any>(url: string, body?: any, config?: any): Promise<T> {
    const { data } = await this.client.patch(url, body, config);
    return data.data;
  }

  async delete<T = any>(url: string, config?: any): Promise<T> {
    const { data } = await this.client.delete(url, config);
    return data.data;
  }

  // File upload
  async uploadFile(bucket: string, file: File, onProgress?: (progress: number) => void) {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await this.client.post(`/storage/${bucket}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });

    return data.data;
  }

  // Get file URL
  getFileUrl(bucket: string, fileName: string): string {
    return `${API_URL}/storage/${bucket}/${fileName}`;
  }

  // Get presigned URL
  async getPresignedUrl(bucket: string, fileName: string, expirySeconds = 3600): Promise<string> {
    const { data } = await this.client.get(
      `/storage/${bucket}/${fileName}/url?expiry=${expirySeconds}`
    );
    return data.data.url;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
