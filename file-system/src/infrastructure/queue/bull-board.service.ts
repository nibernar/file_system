import { Injectable } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { FILE_PROCESSING_QUEUE_NAME } from './file-processing.queue';

@Injectable()
export class BullBoardService {
  private serverAdapter: ExpressAdapter;

  constructor(
    @InjectQueue(FILE_PROCESSING_QUEUE_NAME) private fileQueue: Queue,
  ) {
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [new BullAdapter(this.fileQueue)],
      serverAdapter: this.serverAdapter,
    });
  }

  getRouter() {
    return this.serverAdapter.getRouter();
  }
}
