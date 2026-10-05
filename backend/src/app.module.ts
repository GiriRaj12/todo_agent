import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { TodoAppModule } from './Todo/todo-app.module';
import { ConfigModule } from '@nestjs/config';
import { SessionMiddleware } from './Middlewares/session.middleware';
import { TodosController } from './Todo/Controllers/todo.controller';
import { AiModule } from './AIModule/ai.module';
import { ChatController } from './AIModule/Controllers/ai.chat.controller';
import { AiStatusController } from './AIModule/Controllers/ai.status.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule,
    TodoAppModule,
    AiModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes(TodosController, ChatController, AiStatusController);
  }
}
