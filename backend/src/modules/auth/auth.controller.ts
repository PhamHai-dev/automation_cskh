import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { loginSchema } from './auth.schema';

const authService = new AuthService();

export class AuthController {
  async login(req: Request, res: Response) {
    try {
      const validated = loginSchema.parse({ body: req.body });
      const { email, password } = validated.body;
      const reqInfo = { ip: req.ip, userAgent: req.get('user-agent') };

      const result = await authService.login(email, password, reqInfo);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({
        accessToken: result.accessToken,
        user: result.user
      });
    } catch (error: any) {
      if (error.message === 'Account disabled') {
        res.status(403).json({ message: error.message });
      } else {
        res.status(401).json({ message: error.message });
      }
    }
  }

  async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ message: 'No refresh token' });
      }

      const reqInfo = { ip: req.ip, userAgent: req.get('user-agent') };
      const result = await authService.refresh(refreshToken, reqInfo);

      res.json({ accessToken: result.accessToken });
    } catch (error: any) {
      res.clearCookie('refreshToken');
      res.status(401).json({ message: error.message });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken && req.user) {
        await authService.logout(req.user.id, refreshToken);
      }
      res.clearCookie('refreshToken');
      res.json({ message: 'Logged out' });
    } catch (error: any) {
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }

  async me(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // Return detailed user if needed, or just from token
    res.json(req.user);
  }
}
