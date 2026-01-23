import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: 'admin' | 'supervisor' | 'agent';
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        email: string;
        role: 'admin' | 'supervisor' | 'agent';
      };
      
      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...roles: Array<'admin' | 'supervisor' | 'agent'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    
    next();
  };
};
