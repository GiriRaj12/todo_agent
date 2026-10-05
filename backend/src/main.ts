import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
   const app = await NestFactory.create(AppModule);
 
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Todo API')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-session-id', in: 'header' }, 'session-id')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });
 
  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
}

bootstrap();
