import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { profiles, userRoles } from '../db/schema/auth.js';
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

// We'll store passwords in a separate table or add it to the schema
// For now, let's use a simplified approach with email as the identifier
export const authService = {
  async register(data: RegisterData) {
    // Check if user exists
    const existingUser = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, data.email!))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('User already exists');
    }

    // TODO: Password needs to be stored - this requires schema update
    // For now, we'll just create the profile
    const [newUser] = await db
      .insert(profiles)
      .values({
        id: crypto.randomUUID(),
        email: data.email,
        full_name: data.full_name || 'User',
      })
      .returning();

    // Create default role
    await db.insert(userRoles).values({
      user_id: newUser.id,
      role: 'agent',
    });

    // Generate tokens
    const tokens = generateTokenPair({
      userId: newUser.id,
      email: newUser.email!,
      role: 'agent',
    });

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        role: 'agent',
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

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Get user role
    const [roleData] = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.user_id, user.id))
      .limit(1);

    // TODO: Verify password - needs password storage
    // For now, we'll skip password verification

    // Generate tokens
    const tokens = generateTokenPair({
      userId: user.id,
      email: user.email!,
      role: roleData?.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: roleData?.role,
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

      // Get user role
      const [roleData] = await db
        .select()
        .from(userRoles)
        .where(eq(userRoles.user_id, user.id))
        .limit(1);

      // Generate new tokens
      const tokens = generateTokenPair({
        userId: user.id,
        email: user.email!,
        role: roleData?.role,
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
        created_at: profiles.created_at,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    // Get user role
    const [roleData] = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.user_id, user.id))
      .limit(1);

    return {
      ...user,
      role: roleData?.role,
    };
  },

  async updateProfile(userId: string, data: Partial<RegisterData & { full_name?: string; avatar_url?: string }>) {
    const updateData: any = {};

    if (data.full_name !== undefined) updateData.full_name = data.full_name;
    if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;

    if (Object.keys(updateData).length === 0) {
      return this.getProfile(userId);
    }

    updateData.updated_at = new Date();

    const [updatedUser] = await db
      .update(profiles)
      .set(updateData)
      .where(eq(profiles.id, userId))
      .returning({
        id: profiles.id,
        email: profiles.email,
        full_name: profiles.full_name,
        avatar_url: profiles.avatar_url,
      });

    if (!updatedUser) {
      throw new Error('User not found');
    }

    // Get user role
    const [roleData] = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.user_id, updatedUser.id))
      .limit(1);

    return {
      ...updatedUser,
      role: roleData?.role,
    };
  },
};
