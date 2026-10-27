import net from 'net';

async function scan() {
  const ips = [];
  for (let i = 1; i <= 254; i++) {
    ips.push(`192.168.1.${i}`);
  }

  console.log("Scanning port 22 on 192.168.1.0/24...");
  const results = await Promise.all(ips.map(ip => {
    return new Promise(resolve => {
      const s = new net.Socket();
      s.setTimeout(1000);
      s.on('connect', () => {
        s.destroy();
        resolve({ ip, open: true });
      });
      s.on('timeout', () => { s.destroy(); resolve({ ip, open: false }); });
      s.on('error', () => { s.destroy(); resolve({ ip, open: false }); });
      s.connect(22, ip);
    });
  }));

  const active = results.filter(r => r.open);
  console.log("Active SSH hosts on 192.168.1.x:", active);

  console.log("Scanning port 8080 on 192.168.1.0/24...");
  const results8080 = await Promise.all(ips.map(ip => {
    return new Promise(resolve => {
      const s = new net.Socket();
      s.setTimeout(1000);
      s.on('connect', () => {
        s.destroy();
        resolve({ ip, open: true });
      });
      s.on('timeout', () => { s.destroy(); resolve({ ip, open: false }); });
      s.on('error', () => { s.destroy(); resolve({ ip, open: false }); });
      s.connect(8080, ip);
    });
  }));
  const active8080 = results8080.filter(r => r.open);
  console.log("Active 8080 hosts on 192.168.1.x:", active8080);
}

scan().catch(console.error);
