import net from 'net';

const s = net.connect(6543, 'host.docker.internal', () => {
  console.log('Connected to host.docker.internal:6543 successfully!');
  s.end();
});
s.on('error', (e) => console.error('Connection error:', e.message));

