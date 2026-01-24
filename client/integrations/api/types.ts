// Types for API compatibility
export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  status?: string;
  isActive: boolean;
  role: 'admin' | 'supervisor' | 'agent';
}

export interface Session {
  user: User;
  access_token: string;
}

export interface AuthError {
  message: string;
  status?: number;
}

export interface AuthResponse {
  data: {
    user: User | null;
    session: Session | null;
  } | null;
  error: AuthError | null;
}
