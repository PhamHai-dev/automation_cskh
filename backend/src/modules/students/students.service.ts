import { StudentsRepository } from './students.repository';
import { CreateStudentDTO, UpdateStudentDTO } from './students.types';

class CustomError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class StudentsService {
  private repository: StudentsRepository;

  constructor() {
    this.repository = new StudentsRepository();
  }

  async getAllStudents() {
    return this.repository.findAll();
  }

  async getStudentById(id: number) {
    const student = await this.repository.findById(id);
    if (!student) throw new CustomError('Student not found', 404);
    return student;
  }

  async createStudent(data: CreateStudentDTO, currentUserId?: number) {
    // Basic duplication check
    if (data.phone && data.phone.trim().length > 0) {
      const existing = await this.repository.findByPhone(data.phone.trim());
      if (existing) throw new CustomError('Student with this phone already exists', 409);
    }
    if (data.email && data.email.trim().length > 0) {
      const existing = await this.repository.findByEmail(data.email.trim());
      if (existing) throw new CustomError('Student with this email already exists', 409);
    }
    return this.repository.create(data, currentUserId);
  }

  async updateStudent(id: number, data: UpdateStudentDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new CustomError('Student not found', 404);

    if (data.phone && data.phone.trim().length > 0 && data.phone.trim() !== existing.phone) {
      const duplicatePhone = await this.repository.findByPhone(data.phone.trim());
      if (duplicatePhone) throw new CustomError('Student with this phone already exists', 409);
    }
    if (data.email && data.email.trim().length > 0 && data.email.trim() !== existing.email) {
      const duplicateEmail = await this.repository.findByEmail(data.email.trim());
      if (duplicateEmail) throw new CustomError('Student with this email already exists', 409);
    }

    return this.repository.update(id, data);
  }
}
