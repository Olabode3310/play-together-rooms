'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 4096;
const GAMES = new Set(['Whot', 'Dice']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function createRoomServer(options = {}) {
  const rooms = new Map();
  const allowedOrigins = new Set(options.allowedOrigins || (process.env.ALLOWED_ORIGINS || 'http://localhost:3001,http://127.0.0.1:3001').split(',').map(s => s.trim()).filter(Boolean));
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = path.resolve(ROOT, `.${decodeURIComponent(requested)}`);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });

  function jsonFrame(value) {
    const payload = Buffer.from(JSON.stringify(value));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
    else if (payload.length <= 65535) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
    return Buffer.concat([header, payload]);
  }

  function send(client, message) {
    if (!client.closed) client.socket.write(jsonFrame(message));
  }

  function snapshot(room) {
    return { type: 'room_state', room: { code: room.code, game: room.game, players: room.players.map(({ id, name, ready, host }) => ({ id, name, ready, host })) } };
  }

  function broadcast(room) {
    const state = snapshot(room);
    for (const player of room.players) send(player.client, { ...state, selfPlayerId: player.id });
  }

  function removePlayer(client) {
    if (!client.roomCode) return;
    const room = rooms.get(client.roomCode);
    client.roomCode = null;
    if (!room) return;
    room.players = room.players.filter(player => player.client !== client);
    if (room.players.length === 0) rooms.delete(room.code);
    else {
      if (!room.players.some(player => player.host)) room.players[0].host = true;
      broadcast(room);
    }
  }

  function fail(client, message) { send(client, { type: 'error', message }); }

  function handle(client, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return fail(client, 'Invalid message.');
    if (message.type === 'keepalive') return;
    if (message.type === 'create_room') {
      if (!GAMES.has(message.game)) return fail(client, 'Choose Whot or Dice.');
      if (client.roomCode) removePlayer(client);
      let code;
      do { code = Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.has(code));
      const id = crypto.randomUUID();
      const room = { code, game: message.game, players: [{ id, name: cleanName(message.name), ready: false, host: true, client }] };
      rooms.set(code, room);
      client.roomCode = code;
      send(client, { ...snapshot(room), selfPlayerId: id });
      return;
    }
    if (message.type === 'join_room') {
      const code = typeof message.code === 'string' ? message.code.toUpperCase() : '';
      const room = rooms.get(code);
      if (!room) return fail(client, 'Room not found. Check the code and try again.');
      if (room.players.some(player => player.client === client)) return broadcast(room);
      if (room.players.length >= 4) return fail(client, 'This room is full.');
      if (client.roomCode) removePlayer(client);
      const player = { id: crypto.randomUUID(), name: cleanName(message.name), ready: false, host: false, client };
      room.players.push(player);
      client.roomCode = code;
      broadcast(room);
      return;
    }
    if (message.type === 'set_ready') {
      const room = rooms.get(client.roomCode);
      const player = room?.players.find(item => item.client === client);
      if (!player) return fail(client, 'Join a room before changing ready status.');
      player.ready = Boolean(message.ready);
      broadcast(room);
      return;
    }
    if (message.type === 'leave_room') {
      removePlayer(client);
      return;
    }
    fail(client, 'Unknown room action.');
  }

  function cleanName(value) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 18) : 'Guest';
  }

  server.on('upgrade', (req, socket) => {
    const origin = req.headers.origin;
    if (req.url !== '/ws' || (origin && !allowedOrigins.has(origin)) || req.headers['sec-websocket-version'] !== '13' || !req.headers['sec-websocket-key']) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const client = { socket, buffer: Buffer.alloc(0), roomCode: null, closed: false };
    sockets.add(client);
    socket.on('data', chunk => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      parseFrames(client);
    });
    socket.on('close', () => { client.closed = true; sockets.delete(client); removePlayer(client); });
    socket.on('error', () => { client.closed = true; sockets.delete(client); removePlayer(client); });
  });

  function parseFrames(client) {
    while (client.buffer.length >= 2) {
      const first = client.buffer[0];
      const second = client.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (!masked || (first & 0x70) !== 0 || (first & 0x80) === 0) return client.socket.destroy();
      if (length === 126) { if (client.buffer.length < 4) return; length = client.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (client.buffer.length < 10) return; const wide = client.buffer.readBigUInt64BE(2); if (wide > BigInt(MAX_FRAME)) return client.socket.destroy(); length = Number(wide); offset = 10; }
      if (length > MAX_FRAME) return client.socket.destroy();
      if (client.buffer.length < offset + 4 + length) return;
      const mask = client.buffer.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.from(client.buffer.subarray(offset, offset + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      client.buffer = client.buffer.subarray(offset + length);
      if (opcode === 0x8) { client.socket.end(Buffer.from([0x88, 0x00])); return; }
      if (opcode === 0x9) { client.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (opcode !== 0x1) return client.socket.destroy();
      try { handle(client, JSON.parse(payload.toString('utf8'))); }
      catch { fail(client, 'Could not read that message.'); }
    }
  }

  server.on('close', () => { for (const client of sockets) client.socket.destroy(); });
  return {
    server,
    rooms,
    listen(port = Number(process.env.PORT) || 3001, host = process.env.HOST || '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address()); });
      });
    },
    close() { return new Promise(resolve => server.close(() => resolve())); }
  };
}

if (require.main === module) {
  const app = createRoomServer();
  app.listen().then(address => console.log(`Play Together room server listening on ${address.port}`));
}

module.exports = { createRoomServer };
