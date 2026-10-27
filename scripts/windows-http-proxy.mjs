import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const server = http.createServer((req, res) => {
  console.log('[PROXY HTTP]', req.method, req.url);
  try {
    const isHttps = req.url.startsWith('https://');
    const url = new URL(req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`);
    const defaultPort = (url.protocol === 'https:' || isHttps) ? 443 : 80;
    const targetPort = Number(url.port) || defaultPort;
    if (['127.0.0.1', 'localhost', '192.168.1.100', '0.0.0.0'].includes(url.hostname) && targetPort === 8888) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Windows HTTP Proxy OK\n');
      return;
    }
    const client = (url.protocol === 'https:' || isHttps) ? https : http;
    const options = {
      hostname: url.hostname,
      port: targetPort,
      path: url.pathname + url.search,
      method: req.method,
      headers: req.headers
    };
    const proxyReq = client.request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', err => {
      console.warn('[PROXY HTTP ERROR]', err.message);
      res.writeHead(502);
      res.end(`Proxy Error: ${err.message}`);
    });
    req.pipe(proxyReq);
  } catch (err) {
    console.warn('[PROXY HTTP URL ERROR]', err.message);
    res.writeHead(400);
    res.end(err.message);
  }
});

server.on('connect', (req, clientSocket, head) => {
  console.log('[PROXY CONNECT]', req.url);
  const [host, rawPort] = req.url.split(':');
  const port = Number(rawPort) || 443;
  if (['127.0.0.1', 'localhost', '192.168.1.100', '0.0.0.0'].includes(host) && port === 8888) {
    clientSocket.end('HTTP/1.1 400 Loop Detected\r\n\r\n');
    return;
  }
  const serverSocket = net.connect(port, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  serverSocket.on('error', err => {
    console.warn('[PROXY CONNECT ERROR]', req.url, err.message);
    clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${err.message}`);
  });
  clientSocket.on('error', () => serverSocket.destroy());
});

server.listen(8888, '0.0.0.0', () => {
  console.log('HTTP/HTTPS proxy listening on 0.0.0.0:8888');
});

