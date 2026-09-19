import { prisma } from '../../prisma/client';
import { CreateStudentDTO, UpdateStudentDTO } from './students.types';

export class StudentsRepository {
  async findAll() {
    return prisma.student.findMany({
      orderBy: { created_at: 'desc' }
    });
  }

  async findById(id: number) {
    return prisma.student.findUnique({
      where: { id }
    });
  }

  async findByPhone(phone: string) {
    return prisma.student.findFirst({
      where: { phone }
    });
  }

  async findByEmail(email: string) {
    return prisma.student.findFirst({
      where: { email }
    });
  }

  async create(data: CreateStudentDTO) {
    const dob = data.date_of_birth ? new Date(data.date_of_birth) : undefined;
    return prisma.student.create({ 
      data: {
        ...data,
        date_of_birth: dob
      }
    });
  }

  async update(id: number, data: UpdateStudentDTO) {
    const dob = data.date_of_birth ? new Date(data.date_of_birth) : undefined;
    
    // Create an object without undefined values manually or just let Prisma ignore undefined
    return prisma.student.update({
      where: { id },
      data: {
        ...data,
        date_of_birth: dob
      }
    });
  }
}
