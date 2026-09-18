/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  const bcrypt = require('bcrypt');
  const password_hash = bcrypt.hashSync('password123', 10);

  // 1. Create ADMIN User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@gmail.com' },
    update: {
      password_hash: password_hash
    },
    create: {
      name: 'Super Admin',
      email: 'admin@gmail.com',
      password_hash: password_hash,
      roles: ['ADMIN'],
      active: true,
    },
  });
  console.log(`Created admin user with id: ${admin.id}`);

  // 2. Create CS User (Optional for testing)
  const cs = await prisma.user.upsert({
    where: { email: 'cs@automation_cskh.local' },
    update: {
      password_hash: password_hash
    },
    create: {
      name: 'CS Manager',
      email: 'cs@automation_cskh.local',
      password_hash: password_hash,
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
