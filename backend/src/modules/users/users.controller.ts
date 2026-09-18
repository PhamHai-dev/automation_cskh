import { Request, Response } from 'express';
import { UsersService } from './users.service';
import { createUserSchema, updateUserSchema } from './users.schema';

const usersService = new UsersService();

export class UsersController {
  async list(req: Request, res: Response) {
    try {
      const users = await usersService.listUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const user = await usersService.getUser(id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const validated = createUserSchema.parse({ body: req.body });
      const user = await usersService.createUser(validated.body, req.user!.id);
      res.status(201).json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Invalid request' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const validated = updateUserSchema.parse({ body: req.body });
      const user = await usersService.updateUser(id, validated.body);
      res.json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Invalid request' });
    }
  }

  async enable(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const user = await usersService.enableUser(id);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async disable(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (id === req.user?.id) {
        return res.status(400).json({ message: 'Cannot disable yourself' });
      }
      const user = await usersService.disableUser(id);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async revokeSessions(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      await usersService.revokeSessions(id);
      res.json({ message: 'Sessions revoked' });
    } catch (error: any) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}
