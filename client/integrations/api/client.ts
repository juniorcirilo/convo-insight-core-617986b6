// API Client para substituir o Supabase Client
import type { User, Session } from './types';

declare global {
  interface ImportMetaEnv {
    VITE_API_URL?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

let accessToken: string | null = localStorage.getItem('access_token');
let refreshToken: string | null = localStorage.getItem('refresh_token');

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Attach access token for most endpoints. Skip only auth endpoints that create/refresh sessions.
  if (accessToken && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register') && !endpoint.includes('/auth/refresh')) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && refreshToken && !endpoint.includes('/auth/')) {
      // Try to refresh token
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        const retryResponse = await fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers,
        });
        
        if (!retryResponse.ok) {
          throw new ApiError(retryResponse.status, await retryResponse.text());
        }
        
        return retryResponse.json();
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, error.error || response.statusText);
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(`Network error: ${error}`);
  }
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      accessToken = data.accessToken;
      localStorage.setItem('access_token', accessToken!);
      return true;
    }
    
    // Refresh failed, clear tokens
    apiClient.auth.signOut();
    return false;
  } catch {
    apiClient.auth.signOut();
    return false;
  }
}

export const apiClient = {
  auth: {
    signUp: async (email: string, password: string, fullName?: string) => {
      try {
        const data: any = await request('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName }),
        });
        return { data: { user: data.user }, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },

    signIn: async (email: string, password: string) => {
      try {
        const data: any = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        
        accessToken = data.accessToken;
        refreshToken = data.refreshToken;
        localStorage.setItem('access_token', accessToken!);
        localStorage.setItem('refresh_token', refreshToken!);
        
        return { data: { user: data.user, session: { user: data.user, access_token: data.accessToken } }, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },

    signOut: async () => {
      accessToken = null;
      refreshToken = null;
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      return { error: null };
    },

    getSession: async () => {
      if (!accessToken) {
        return { data: { session: null }, error: null };
      }

      try {
        const user: any = await request('/auth/me');
        return {
          data: {
            session: {
              user,
              access_token: accessToken,
            },
          },
          error: null,
        };
      } catch {
        return { data: { session: null }, error: null };
      }
    },

    getUser: async () => {
      if (!accessToken) {
        return { data: { user: null }, error: null };
      }

      try {
        const user = await request('/auth/me');
        return { data: { user }, error: null };
      } catch (error: any) {
        return { data: { user: null }, error: { message: error.message } };
      }
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      // Initial check
      apiClient.auth.getSession().then(({ data }) => {
        callback('INITIAL_SESSION', data.session);
      });

      // Return unsubscribe function
      return {
        data: { subscription: { unsubscribe: () => {} } },
      };
    },
  },

  from: (table: string) => ({
    select: (columns = '*') => {
      // Internal builder state
      const state: any = {
        columns,
        filters: [],
        inFilters: [],
        orders: [],
        limit: undefined,
        range: undefined,
      };

      const buildQueryString = () => {
        const params = new URLSearchParams();
        for (const f of state.filters) {
          params.append(f.column, String(f.value));
        }
        for (const f of state.inFilters) {
          // join values with comma
          params.append(f.column, f.values.join(','));
        }
        if (state.limit) params.append('limit', String(state.limit));
        if (state.range) params.append('range', `${state.range[0]}:${state.range[1]}`);
        return params.toString();
      };

      const builder: any = {
        eq: (column: string, value: any) => {
          state.filters.push({ column, value });
          return builder;
        },
        in: (column: string, values: any[]) => {
          state.inFilters.push({ column, values });
          return builder;
        },
        order: (column: string, _options?: any) => {
          state.orders.push(column);
          return builder;
        },
        limit: (count: number) => {
          state.limit = count;
          return builder;
        },
        range: (from: number, to: number) => {
          state.range = [from, to];
          return builder;
        },
        // thenable so `await query` works like official supabase client
        then: async (resolve: any, _reject: any) => {
          try {
            const q = buildQueryString();
            const path = q ? `/${table}?${q}` : `/${table}`;
            const data = await request(path);
            const result = { data, error: null };
            return resolve ? resolve(result) : result;
          } catch (err: any) {
            const result = { data: null, error: { message: err.message || String(err) } };
            return resolve ? resolve(result) : result;
          }
        },
      };

      return builder;
    },

    insert: (values: any) => ({
      select: async () => {
        try {
          const data = await request(`/${table}`, {
            method: 'POST',
            body: JSON.stringify(values),
          });
          return { data, error: null };
        } catch (error: any) {
          return { data: null, error: { message: error.message } };
        }
      },
    }),

    update: (values: any) => ({
      eq: (column: string, value: any) => ({
        select: async () => {
          try {
            const data = await request(`/${table}/${value}`, {
              method: 'PUT',
              body: JSON.stringify(values),
            });
            return { data, error: null };
          } catch (error: any) {
            return { data: null, error: { message: error.message } };
          }
        },
      }),
    }),

    delete: () => ({
      eq: async (column: string, value: any) => {
        try {
          await request(`/${table}/${value}`, {
            method: 'DELETE',
          });
          return { error: null };
        } catch (error: any) {
          return { error: { message: error.message } };
        }
      },
    }),
  }),

  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, file: File) => {
        try {
          // Get signed upload URL
          const { url, key }: any = await request('/storage/upload', {
            method: 'POST',
            body: JSON.stringify({ key: `${bucket}/${path}`, contentType: file.type }),
          });

          // Upload file
          await fetch(url, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          });

          return { data: { path: key }, error: null };
        } catch (error: any) {
          return { data: null, error: { message: error.message } };
        }
      },

      getPublicUrl: (path: string) => {
        return {
          data: { publicUrl: `${API_URL}/storage/download?key=${path}` },
        };
      },

      createSignedUrl: async (path: string, expiresIn: number) => {
        try {
          const { url }: any = await request(`/storage/download?key=${path}`);
          return { data: { signedUrl: url }, error: null };
        } catch (error: any) {
          return { data: null, error: { message: error.message } };
        }
      },

      remove: async (paths: string[]) => {
        try {
          await Promise.all(paths.map(path => 
            request(`/storage/delete`, {
              method: 'POST',
              body: JSON.stringify({ key: path }),
            })
          ));
          return { data: null, error: null };
        } catch (error: any) {
          return { data: null, error: { message: error.message } };
        }
      },
    }),
  },

  functions: {
    invoke: async (functionName: string, options?: { body?: any; headers?: any }) => {
      try {
        const data = await request(`/functions/${functionName}`, {
          method: 'POST',
          body: options?.body ? JSON.stringify(options.body) : undefined,
          headers: options?.headers,
        });
        return { data, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },
  },

  rpc: async (functionName: string, params: any) => {
    try {
      const data = await request(`/rpc/${functionName}`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  channel: (channelName: string) => ({
    on: (event: string, filter: any, callback: any) => ({
      subscribe: () => ({}),
    }),
  }),

  removeChannel: (channel: any) => {
    // No-op for now - realtime not implemented yet
    console.log('[apiClient] removeChannel called (no-op)');
  },
};

// Para compatibilidade com o código existente
export const supabase = apiClient;
