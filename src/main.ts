import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS para Angular en desarrollo y producción (incluyendo dominios de Railway)
  const frontendEnv = process.env.FRONTEND_URL?.trim();
  const allowedOrigins: string[] = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
  ];
  if (frontendEnv && frontendEnv !== '*') {
    const list = frontendEnv.split(',').map((u) => u.trim().replace(/\/$/, ''));
    allowedOrigins.push(...list);
  }

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (frontendEnv === '*') return callback(null, true);

      const cleanOrigin = origin.replace(/\/$/, '');
      const isAllowed =
        allowedOrigins.includes(cleanOrigin) ||
        cleanOrigin.endsWith('.railway.app') ||
        cleanOrigin.endsWith('.up.railway.app') ||
        cleanOrigin.endsWith('.netlify.app') ||
        cleanOrigin.includes('localhost') ||
        cleanOrigin.includes('127.0.0.1');

      if (isAllowed || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Prefijo global para la API REST
  app.setGlobalPrefix('api');

  // Validación y transformación automática de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 AurumDash Backend listo en: http://0.0.0.0:${port}/api`);
}

void bootstrap();
