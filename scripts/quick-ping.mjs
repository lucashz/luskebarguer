import { exec } from 'child_process';

async function pingAll() {
  console.log("Pinging 192.168.1.100 to 192.168.1.120...");
  for (let i = 100; i <= 120; i++) {
    const ip = `192.168.1.${i}`;
    exec(`ping -n 1 -w 500 ${ip}`, (err, stdout) => {
      if (!err && stdout.includes('TTL=')) {
        console.log(`FOUND ACTIVE IP: ${ip}`);
      }
    });
  }
}

pingAll();
