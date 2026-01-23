import { Request, Response } from 'express';
import { authService } from '../services/authService.js';
import { AuthRequest } from '../middleware/auth.js';

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, full_name } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const result = await authService.register({ email, password, full_name });
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({ error: message });
    }
  },

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const result = await authService.login({ email, password });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      res.status(401).json({ error: message });
    }
  },

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token is required' });
        return;
      }

      const tokens = await authService.refresh(refreshToken);
      res.json(tokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';
      res.status(401).json({ error: message });
    }
  },

  async logout(req: Request, res: Response): Promise<void> {
    // In a stateless JWT system, logout is handled client-side
    // However, you could implement token blacklisting here if needed
    res.json({ message: 'Logged out successfully' });
  },

  async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const profile = await authService.getProfile(req.user.userId);
      res.json(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get profile';
      res.status(404).json({ error: message });
    }
  },

  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const profile = await authService.updateProfile(req.user.userId, req.body);
      res.json(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      res.status(400).json({ error: message });
    }
  },
};
