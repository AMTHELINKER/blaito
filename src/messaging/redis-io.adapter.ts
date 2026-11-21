import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/** Socket.IO partagé entre instances de l'API via Redis (pub/sub). */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = new Redis(this.redisUrl, { lazyConnect: true });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  async close(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
  }
}
