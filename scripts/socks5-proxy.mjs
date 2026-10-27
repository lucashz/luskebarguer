import net from 'node:net';

const server = net.createServer((clientSocket) => {
  let stage = 0; // 0: greeting, 1: request, 2: connected
  let remoteSocket = null;

  function cleanup() {
    if (remoteSocket) remoteSocket.destroy();
    clientSocket.destroy();
  }

  clientSocket.on('error', cleanup);

  function onData(data) {
    try {
      if (stage === 0) {
        // Version 5 greeting
        if (data[0] !== 0x05) {
          cleanup();
          return;
        }
        // Send choice: NO AUTH (0x00)
        clientSocket.write(Buffer.from([0x05, 0x00]));
        stage = 1;
        return;
      }

      if (stage === 1) {
        // Connection request
        const version = data[0];
        const cmd = data[1]; // 0x01 = CONNECT
        const addrType = data[3];

        if (version !== 0x05 || cmd !== 0x01) {
          clientSocket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          cleanup();
          return;
        }

        let host = '';
        let port = 0;
        let offset = 4;

        if (addrType === 0x01) {
          // IPv4
          host = `${data[offset]}.${data[offset + 1]}.${data[offset + 2]}.${data[offset + 3]}`;
          offset += 4;
        } else if (addrType === 0x03) {
          // Domain name
          const len = data[offset++];
          host = data.subarray(offset, offset + len).toString('utf8');
          offset += len;
        } else if (addrType === 0x04) {
          // IPv6
          const parts = [];
          for (let i = 0; i < 16; i += 2) {
            parts.push(data.readUInt16BE(offset + i).toString(16));
          }
          host = parts.join(':');
          offset += 16;
        } else {
          cleanup();
          return;
        }

        port = data.readUInt16BE(offset);
        offset += 2;

        const extraData = data.subarray(offset);

        // PAUSE clientSocket and remove listener immediately
        clientSocket.pause();
        clientSocket.removeListener('data', onData);
        stage = 2;

        console.log(`[SOCKS5] Connecting to ${host}:${port}...`);

        remoteSocket = net.connect(port, host, () => {
          console.log(`[SOCKS5] Connected to ${host}:${port}`);
          // Send SOCKS5 success reply
          const reply = Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0x2a, 0x30]);
          clientSocket.write(reply);

          if (extraData.length > 0) {
            console.log(`[SOCKS5] Writing extraData (${extraData.length} bytes) to remote`);
            remoteSocket.write(extraData);
          }

          clientSocket.pipe(remoteSocket);
          remoteSocket.pipe(clientSocket);

          clientSocket.resume();
        });

        clientSocket.on('close', (hadError) => {
          console.log(`[SOCKS5] clientSocket closed (hadError: ${hadError})`);
          if (remoteSocket) remoteSocket.destroy();
        });

        remoteSocket.on('close', (hadError) => {
          console.log(`[SOCKS5] remoteSocket closed (hadError: ${hadError})`);
          clientSocket.destroy();
        });

        remoteSocket.on('error', (err) => {
          console.warn(`[SOCKS5 ERROR] ${host}:${port} - ${err.message}`);
          cleanup();
        });
      }
    } catch (err) {
      console.warn('[SOCKS5 EXCEPTION]', err);
      cleanup();
    }
  }

  clientSocket.on('data', onData);
});

const PORT = 10800;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ SOCKS5 proxy running on 0.0.0.0:${PORT}`);
});
