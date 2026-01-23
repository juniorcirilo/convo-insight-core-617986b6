import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { profiles, userRoles, refreshTokens } from '../db/schema/index.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error.js';
import { eq, and, sql } from 'drizzle-orm';

interface AccessTokenPayload {
  userId: string;
  email: string;
  role: 'admin' | 'supervisor' | 'agent';
}

interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
}

export class AuthService {
  static async register(
    email: string,
    password: string,
    fullName: string,
    role: 'admin' | 'supervisor' | 'agent' = 'agent'
  ) {
    // Check if user exists
    const existingUser = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
    
    if (existingUser.length > 0) {
      throw new AppError(409, 'User already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const [user] = await db.insert(profiles).values({
      email,
      passwordHash,
      fullName,
      isApproved: role === 'admin', // Auto-approve admins
      isActive: true,
    }).returning();

    // Assign role
    await db.insert(userRoles).values({
      userId: user.id,
      role,
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role,
    };
  }

  static async login(email: string, password: string) {
    // Find user
    const [user] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);

    if (!user) {
      throw new AppError(401, 'Invalid credentials');
    }

    if (!user.isActive) {
      throw new AppError(403, 'Account is deactivated');
    }

    if (!user.isApproved) {
      throw new AppError(403, 'Account is pending approval');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Get user role
    const [userRole] = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, user.id))
      .limit(1);

    if (!userRole) {
      throw new AppError(500, 'User role not found');
    }

    // Generate tokens
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: userRole.role,
    });

    const refreshToken = await this.generateRefreshToken(user.id, user.tokenVersion || 0);

    // Update last login
    await db
      .update(profiles)
      .set({ lastLoginAt: new Date() })
      .where(eq(profiles.id, user.id));

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: userRole.role,
      },
      accessToken,
      refreshToken,
    };
  }

  static async refreshAccessToken(refreshToken: string) {
    // Find refresh token
    const [tokenRecord] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, refreshToken))
      .limit(1);

    if (!tokenRecord) {
      throw new AppError(401, 'Invalid refresh token');
    }

    // Check expiration
    if (new Date() > tokenRecord.expiresAt) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, tokenRecord.id));
      throw new AppError(401, 'Refresh token expired');
    }

    // Get user
    const [user] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, tokenRecord.userId))
      .limit(1);

    if (!user || !user.isActive) {
      throw new AppError(401, 'User not found or inactive');
    }

    // Get role
    const [userRole] = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, user.id))
      .limit(1);

    // Generate new access token
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: userRole?.role || 'agent',
    });

    return { accessToken };
  }

  static async logout(refreshToken: string) {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
  }

  static async revokeAllTokens(userId: string) {
    // Delete all refresh tokens
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    
    // Increment token version
    await db
      .update(profiles)
      .set({ tokenVersion: sql`token_version + 1` })
      .where(eq(profiles.id, userId));
  }

  private static generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });
  }

  private static async generateRefreshToken(userId: string, tokenVersion: number): Promise<string> {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db.insert(refreshTokens).values({
      userId,
      token,
      expiresAt,
    });

    return token;
  }
}
