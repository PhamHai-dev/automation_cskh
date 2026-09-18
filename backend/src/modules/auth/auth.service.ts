import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../prisma/client';
import { env } from '../../config/env';

export class AuthService {
  async login(email: string, password: string, reqInfo: { ip?: string; userAgent?: string }) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.logAudit(null, email, 'FAILED', 'User not found', reqInfo);
      throw new Error('Invalid credentials');
    }

    if (!user.active) {
      await this.logAudit(user.id, email, 'DISABLED', 'Account disabled', reqInfo);
      throw new Error('Account disabled');
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      await this.logAudit(user.id, email, 'FAILED', 'Invalid password', reqInfo);
      throw new Error('Invalid credentials');
    }

    await this.logAudit(user.id, email, 'SUCCESS', null, reqInfo);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() }
    });

    const accessToken = jwt.sign(
      { id: user.id, roles: user.roles },
      env.JWT_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
    );

    const refreshTokenString = crypto.randomUUID() + crypto.randomUUID();
    const refreshTokenHash = await bcrypt.hash(refreshTokenString, 10);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.authSession.create({
      data: {
        user_id: user.id,
        refresh_token_hash: refreshTokenHash,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        expires_at: expiresAt,
        last_used_at: new Date(),
      }
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
      },
      accessToken,
      refreshToken: refreshTokenString,
    };
  }

  async refresh(refreshToken: string, reqInfo: { ip?: string; userAgent?: string }) {
    const sessions = await prisma.authSession.findMany({
      where: {
        revoked_at: null,
        expires_at: { gt: new Date() }
      },
      include: { user: true }
    });

    let validSession = null;
    let validUser = null;

    for (const session of sessions) {
      const isMatch = await bcrypt.compare(refreshToken, session.refresh_token_hash);
      if (isMatch) {
        validSession = session;
        validUser = session.user;
        break;
      }
    }

    if (!validSession || !validUser) {
      throw new Error('Invalid refresh token');
    }

    if (!validUser.active) {
      throw new Error('Account disabled');
    }

    const accessToken = jwt.sign(
      { id: validUser.id, roles: validUser.roles },
      env.JWT_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
    );

    await prisma.authSession.update({
      where: { id: validSession.id },
      data: {
        last_used_at: new Date(),
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
      }
    });

    return { accessToken };
  }

  async logout(userId: number, refreshToken: string) {
    const sessions = await prisma.authSession.findMany({
      where: { user_id: userId, revoked_at: null }
    });

    for (const session of sessions) {
      const isMatch = await bcrypt.compare(refreshToken, session.refresh_token_hash);
      if (isMatch) {
        await prisma.authSession.update({
          where: { id: session.id },
          data: { revoked_at: new Date() }
        });
        break;
      }
    }
  }

  private async logAudit(userId: number | null, email: string, status: any, reason: string | null, reqInfo: { ip?: string; userAgent?: string }) {
    await prisma.loginAudit.create({
      data: {
        user_id: userId,
        email_attempted: email,
        status,
        reason,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
      }
    });
  }
}
