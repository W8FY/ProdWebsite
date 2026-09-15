// Passenger loads this CommonJS startup file. Explicitly invoke the ES-module
// entry point; Passenger's loader does not make server.mjs process.argv[1].
import('./server.mjs').then(({ startServer }) => startServer()).catch(() => {
  console.error('Swap Shop startup failed. Check Node version, environment and private database permissions.');
  process.exitCode = 1;
});
