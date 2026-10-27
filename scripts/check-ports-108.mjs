import net from 'net';

const ports = [22, 80, 443, 3000, 5432, 6379, 8080, 8081, 8443, 9000];
console.log("Checking common ports on 192.168.1.108...");

for (const port of ports) {
  const s = new net.Socket();
  s.setTimeout(1500);
  s.on('connect', () => {
    console.log(`PORT ${port} is OPEN on 192.168.1.108!`);
    s.destroy();
  });
  s.on('error', () => s.destroy());
  s.on('timeout', () => s.destroy());
  s.connect(port, '192.168.1.108');
}
