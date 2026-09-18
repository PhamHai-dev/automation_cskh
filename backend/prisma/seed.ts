/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Create ADMIN User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@automation_cskh.local' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'admin@automation_cskh.local',
      // password: "password123" (should be hashed, using a dummy hash here for seed)
      password_hash: '$2b$10$dummyhashedpasswordforsimplicity000000000000000000',
      roles: ['ADMIN'],
      active: true,
    },
  });
  console.log(`Created admin user with id: ${admin.id}`);

  // 2. Create CS User (Optional for testing)
  const cs = await prisma.user.upsert({
    where: { email: 'cs@automation_cskh.local' },
    update: {},
    create: {
      name: 'CS Manager',
      email: 'cs@automation_cskh.local',
      password_hash: '$2b$10$dummyhashedpasswordforsimplicity000000000000000000',
      roles: ['CS'],
      active: true,
    },
  });
  console.log(`Created cs user with id: ${cs.id}`);

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
