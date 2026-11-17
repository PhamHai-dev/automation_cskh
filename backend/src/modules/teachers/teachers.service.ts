import { TeachersRepository } from './teachers.repository';
import {
  CreateTeacherDTO,
  UpdateTeacherDTO,
  ProvisionAccountDTO,
  UpdateMyTeacherProfileDTO,
  TeacherListFilters,
  TeacherListResult,
} from './teachers.types';
import bcrypt from 'bcrypt';
import { AppError } from '../../middlewares/error.middleware';

export class TeachersService {
  private repository: TeachersRepository;

  constructor() {
    this.repository = new TeachersRepository();
  }

  async getAllTeachers(filters?: TeacherListFilters) {
    return this.repository.findAll(filters);
  }

  async getTeachersWithMeta(filters?: TeacherListFilters): Promise<TeacherListResult> {
    const data = await this.repository.findAll(filters);
    const meta = await this.repository.computeMeta(filters, data);
    return { data, meta };
  }

  async getTeacherById(id: number) {
    const teacher = await this.repository.findById(id);
    if (!teacher) {
      throw new AppError(404, 'Không tìm thấy giáo viên');
    }
    return teacher;
  }

  async createTeacher(data: CreateTeacherDTO) {
    return this.repository.create(data);
  }

  async updateTeacher(id: number, data: UpdateTeacherDTO) {
    const teacher = await this.repository.findById(id);
    if (!teacher) {
      throw new AppError(404, 'Không tìm thấy giáo viên');
    }
    return this.repository.update(id, data);
  }

  async getMyProfile(userId: number) {
    const teacher = await this.repository.findByUserId(userId);
    if (!teacher) {
      throw new AppError(404, 'Không tìm thấy hồ sơ giáo viên liên kết với tài khoản');
    }
    return teacher;
  }

  async updateMyProfile(userId: number, data: UpdateMyTeacherProfileDTO) {
    const teacher = await this.repository.findByUserId(userId);
    if (!teacher) {
      throw new AppError(404, 'Không tìm thấy hồ sơ giáo viên liên kết với tài khoản');
    }
    return this.repository.updateMyContact(
      teacher.id,
      userId,
      data,
      { phone: teacher.phone, email: teacher.email },
    );
  }

  async provisionAccount(id: number, data: ProvisionAccountDTO, creatorId?: number) {
    const plainPassword = data.password || '123456';
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    return this.repository.provisionAccount(id, data.email, passwordHash, creatorId);
  }
}
