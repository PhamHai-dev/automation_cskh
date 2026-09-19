import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

export const signTestToken = (userId: number, roles: string[]) => {
  return jwt.sign({ id: userId, roles }, env.JWT_SECRET, { expiresIn: '15m' });
};
