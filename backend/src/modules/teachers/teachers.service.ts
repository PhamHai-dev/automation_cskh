import { TeachersRepository } from './teachers.repository';
import { CreateTeacherDTO, UpdateTeacherDTO } from './teachers.types';
import bcrypt from 'bcrypt';

class CustomError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class TeachersService {
  private repository: TeachersRepository;

  constructor() {
    this.repository = new TeachersRepository();
  }

  async getAllTeachers() {
    return this.repository.findAll();
  }

  async getTeacherById(id: number) {
    const teacher = await this.repository.findById(id);
    if (!teacher || !(teacher.roles as string[]).includes('TEACHER')) {
      throw new CustomError('Teacher not found', 404);
    }
    return teacher;
  }

  async createTeacher(data: CreateTeacherDTO, creatorId: number) {
    // Generate a default password if not provided
    const plainPassword = data.password || Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    
    return this.repository.create(data, creatorId, passwordHash);
  }

  async updateTeacher(id: number, data: UpdateTeacherDTO) {
    const teacher = await this.repository.findById(id);
    if (!teacher || !(teacher.roles as string[]).includes('TEACHER')) {
      throw new CustomError('Teacher not found', 404);
    }

    return this.repository.update(id, data);
  }
}
