import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorMiddleware } from './middlewares/error.middleware';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { packagesRouter } from './modules/packages/packages.routes';
import { teachersRouter } from './modules/teachers/teachers.routes';
import { studentsRouter } from './modules/students/students.routes';
import { classesRouter } from './modules/classes/classes.routes';
import { enrollmentsRouter } from './modules/enrollments/enrollments.routes';
import { classSessionsRouter } from './modules/class-sessions/class-sessions.routes';
import { attendanceRouter } from './modules/attendance/attendance.routes';
import { importsRouter } from './modules/imports/imports.routes';
import { careRouter } from './modules/care/care.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { zaloRouter } from './modules/zalo/zalo.routes';

import { automationRouter } from './modules/automation/automation.routes';

const app: Express = express();

// Middlewares
app.use(helmet());
app.use(cors({
  origin: 'http://localhost:5173', // or frontend origin
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Healthcheck endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/settings/users', usersRouter);
app.use('/api/v1/packages', packagesRouter);
app.use('/api/v1/teachers', teachersRouter);
app.use('/api/v1/students', studentsRouter);
app.use('/api/v1/classes', classesRouter);
app.use('/api/v1/enrollments', enrollmentsRouter);
app.use('/api/v1/classes/:classId/sessions', classSessionsRouter);
app.use('/api/v1/classes/:classId/sessions/:sessionId/attendance', attendanceRouter);
app.use('/api/v1/imports', importsRouter);
app.use('/api/v1', careRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/zalo', zaloRouter);
app.use('/api/v1/automation', automationRouter);

// Error handling
app.use(errorMiddleware);

export { app };
