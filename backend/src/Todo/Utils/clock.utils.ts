import { Injectable } from '@nestjs/common';

export abstract class Clock {
  abstract today(): string;
  abstract now(): Date;
}
 
@Injectable()
export class SystemClock extends Clock {
  today(): string {
    return this.now().toISOString().slice(0, 10);
  }
  now(): Date {
    return new Date();
  }
}
 