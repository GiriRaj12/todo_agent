import { Module } from "@nestjs/common";
import { TodosService } from "./Services/todoapp.service";
import { TodosController } from "./Controllers/todo.controller";
import { DbService } from "./Services/db.service";
import { Clock, SystemClock } from "./Utils/clock.utils";



@Module({
    imports: [],
    controllers: [
        TodosController
    ],
    providers: [TodosService, DbService, { provide: Clock, useClass: SystemClock }],
    exports: [TodosService, { provide: Clock, useClass: SystemClock }]
})

export class TodoAppModule {};