import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import '../setup.js';
import WebSocket from 'ws';
import {
  REALTIME_PATH,
  REALTIME_SUBPROTOCOL,
  type RealtimeServerEvent,
} from '@academy/types';
import {
  attachRealtime,
  broadcastChange,
  broadcastPublic,
  broadcastToUser,
  closeRealtime,
  realtimeAnonymousCount,
  realtimeConnectionCount,
} from '../../src/realtime/hub.js';

/**
 * The hub, with real sockets.
 *
 * The mapping tests next door pin down *what* an action should reach; this
 * pins down that it reaches the right sockets and no others — the property the
 * whole design rests on now that anonymous visitors share the endpoint.
 *
 * No database is involved: an anonymous handshake never touches Prisma, which
 * is exactly why this can run in the unit suite. The authenticated paths are
 * covered by the handshake refusals, which reject before any lookup.
 */

let server: Server;
let port: number;

const clients: WebSocket[] = [];

function url(): string {
  return `ws://127.0.0.1:${port}${REALTIME_PATH}`;
}

/** Opens an anonymous socket and resolves once the server says it is ready. */
async function connectAnonymous(): Promise<{
  socket: WebSocket;
  received: RealtimeServerEvent[];
}> {
  const socket = new WebSocket(url(), [REALTIME_SUBPROTOCOL]);
  clients.push(socket);

  const received: RealtimeServerEvent[] = [];
  socket.on('message', (raw) => received.push(JSON.parse(raw.toString()) as RealtimeServerEvent));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket never became ready')), 5_000);
    socket.on('message', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  return { socket, received };
}

/** A broadcast is synchronous, but delivery is a network hop. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}

beforeAll(async () => {
  server = createServer();
  attachRealtime(server);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      port = typeof address === 'object' && address ? address.port : 0;
      resolve();
    });
  });
});

afterEach(async () => {
  for (const socket of clients.splice(0)) socket.close();
  await settle();
});

afterAll(async () => {
  closeRealtime();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('the realtime hub', () => {
  it('accepts a visitor with no credential and tells them what they are', async () => {
    const { received } = await connectAnonymous();

    expect(received[0]).toMatchObject({
      type: 'ready',
      audiences: ['public'],
      // Nothing admin-shaped, and no session to expire.
      resources: [],
      sessionExpiresAt: null,
    });
    expect(realtimeAnonymousCount()).toBe(1);
    expect(realtimeConnectionCount()).toBe(1);
  });

  it('delivers a public change to every connected visitor', async () => {
    const first = await connectAnonymous();
    const second = await connectAnonymous();

    broadcastPublic(['catalog', 'content']);
    await settle();

    for (const client of [first, second]) {
      const event = client.received.find((entry) => entry.type === 'public.changed');
      expect(event).toBeDefined();
      expect(event).toMatchObject({ channels: ['catalog', 'content'] });
      // The property that makes this safe to send to a stranger.
      expect(event).not.toHaveProperty('actor');
      expect(event).not.toHaveProperty('targetId');
      expect(event).not.toHaveProperty('action');
    }
  });

  it('never sends an admin change to a socket that is not an admin', async () => {
    const { received } = await connectAnonymous();

    broadcastChange({
      resources: ['users', 'audit'],
      action: 'user.status_changed',
      targetType: 'user',
      targetId: 'usr_secret',
      actor: { id: 'usr_admin', name: 'Dana' },
    });
    await settle();

    expect(received.some((entry) => entry.type === 'resource.changed')).toBe(false);
    // And nothing leaked through another event shape either.
    expect(JSON.stringify(received)).not.toContain('Dana');
    expect(JSON.stringify(received)).not.toContain('usr_secret');
  });

  it('never sends a learner change to a socket belonging to nobody', async () => {
    const { received } = await connectAnonymous();

    broadcastToUser('usr_someone', ['orders']);
    await settle();

    expect(received.some((entry) => entry.type === 'learner.changed')).toBe(false);
  });

  it('deduplicates channels, so one change refreshes a page once', async () => {
    const { received } = await connectAnonymous();

    broadcastPublic(['catalog', 'catalog', 'content']);
    await settle();

    const event = received.find((entry) => entry.type === 'public.changed');
    expect(event).toMatchObject({ channels: ['catalog', 'content'] });
  });

  it('says nothing at all when there is nothing to say', async () => {
    const { received } = await connectAnonymous();
    const before = received.length;

    broadcastPublic([]);
    broadcastToUser('usr_someone', []);
    await settle();

    expect(received.length).toBe(before);
  });

  it('stops counting a visitor who leaves', async () => {
    const { socket } = await connectAnonymous();
    expect(realtimeAnonymousCount()).toBe(1);

    socket.close();
    await settle();

    expect(realtimeAnonymousCount()).toBe(0);
    expect(realtimeConnectionCount()).toBe(0);
  });

  it('refuses a client that does not speak the subprotocol', async () => {
    const socket = new WebSocket(url());
    clients.push(socket);

    const status = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no response')), 5_000);
      socket.on('unexpected-response', (_request, response) => {
        clearTimeout(timer);
        resolve(response.statusCode ?? 0);
      });
      socket.on('open', () => {
        clearTimeout(timer);
        resolve(200);
      });
      socket.on('error', () => {
        /* `unexpected-response` carries the answer; this follows it. */
      });
    });

    // A server must not select a subprotocol the client never offered — a
    // browser rejects such a handshake outright.
    expect(status).toBe(400);
  });
});
