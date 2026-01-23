import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { profiles } from '../db/schema/auth.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt.js';

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export const authService = {
  async register(data: RegisterData) {
    // Check if user exists
    const existingUser = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, data.email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('User already exists');
    }

    // Hash password
    const hashedPassword = await hashPassword(data.password);

    // Create user
    const [newUser] = await db
      .insert(profiles)
      .values({
        email: data.email,
        password_hash: hashedPassword,
        full_name: data.full_name,
      })
      .returning();

    // Generate tokens
    const tokens = generateTokenPair({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role || undefined,
    });

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
      },
      ...tokens,
    };
  },

  async login(data: LoginData) {
    // Find user
    const [user] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, data.email))
      .limit(1);

    if (!user || !user.password_hash) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await comparePassword(data.password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Generate tokens
    const tokens = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role || undefined,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      ...tokens,
    };
  },

  async refresh(refreshToken: string) {
    try {
      const payload = verifyRefreshToken(refreshToken);

      // Verify user still exists
      const [user] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, payload.userId))
        .limit(1);

      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const tokens = generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role || undefined,
      });

      return tokens;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  },

  async getProfile(userId: string) {
    const [user] = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        full_name: profiles.full_name,
        avatar_url: profiles.avatar_url,
        role: profiles.role,
        phone: profiles.phone,
        created_at: profiles.created_at,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  },

  async updateProfile(userId: string, data: Partial<RegisterData & { full_name?: string; phone?: string; avatar_url?: string }>) {
    const updateData: any = {};

    if (data.full_name !== undefined) updateData.full_name = data.full_name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;

    if (data.password) {
      updateData.password_hash = await hashPassword(data.password);
    }

    const [updatedUser] = await db
      .update(profiles)
      .set(updateData)
      .where(eq(profiles.id, userId))
      .returning({
        id: profiles.id,
        email: profiles.email,
        full_name: profiles.full_name,
        avatar_url: profiles.avatar_url,
        role: profiles.role,
        phone: profiles.phone,
      });

    if (!updatedUser) {
      throw new Error('User not found');
    }

    return updatedUser;
  },
};
