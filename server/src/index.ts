import { main } from './main.js';

// Enable debug logging if DEBUG env is set, otherwise enable our namespace
if (!process.env.DEBUG) {
  process.env.DEBUG = 'agent-browse';
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
