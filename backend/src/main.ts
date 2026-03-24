import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1', {
    exclude: ['docs', 'docs/(.*)'], // Swagger doesn't need the prefix
  });
  app.enableCors();
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Mobile Agent Studio')
    .setDescription('AI-powered Android phone automation API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(3000);
}
bootstrap();
