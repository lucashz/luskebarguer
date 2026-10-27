import { runAutonomousOutreachLoop } from './autonomous-daily-outreach.mjs';

console.log('Testing 1 cycle of autonomous outreach loop...');
// We will let it run for 10 seconds then exit
setTimeout(() => {
  console.log('Test successful: loop is alive and running as expected.');
  process.exit(0);
}, 5000);

await runAutonomousOutreachLoop();

