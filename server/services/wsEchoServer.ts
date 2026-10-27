import crypto from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWsTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  if (len < 126) {
    const header = Buffer.from([0x81, len]);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(len, 2);
  return Buffer.concat([header, payload]);
}

function decodeWsClientFrame(buf: Buffer): { opcode: number; text: string } | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    return null; // ignore oversized frames
  }

  let maskKey: Buffer | null = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buf.length < offset + payloadLen) return null;
  const data = Buffer.from(buf.subarray(offset, offset + payloadLen));
  if (maskKey) {
    for (let i = 0; i < data.length; i++) {
      data[i] ^= maskKey[i % 4];
    }
  }

  return { opcode, text: data.toString('utf8') };
}

export function attachDevBenchWebSocket(httpServer: HttpServer) {
  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    const url = req.url || '';
    if (!url.startsWith('/api/ws')) {
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key || typeof key !== 'string') {
      socket.destroy();
      return;
    }

    const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n')
    );

    socket.write(
      encodeWsTextFrame(
        JSON.stringify({
          type: 'welcome',
          server: 'DevBench WebSocket Test Endpoint',
          timestamp: new Date().toISOString(),
        })
      )
    );

    socket.on('data', (chunk: Buffer) => {
      const frame = decodeWsClientFrame(chunk);
      if (!frame) return;
      if (frame.opcode === 0x8) {
        // Close frame
        socket.end(Buffer.from([0x88, 0x00]));
        return;
      }
      if (frame.opcode === 0x1) {
        socket.write(
          encodeWsTextFrame(
            JSON.stringify({
              type: 'echo',
              received: frame.text,
              bytes: Buffer.byteLength(frame.text, 'utf8'),
              serverTime: new Date().toISOString(),
            })
          )
        );
      }
    });

    socket.on('error', () => {
      socket.destroy();
    });
  });
}
