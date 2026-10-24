import { createApp } from './app.js';

const port = Number(process.env.PORT) || 8080;
const host = '0.0.0.0';
const { app } = createApp();
const server = app.listen(port, host, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'listening', host, port }));
});
server.requestTimeout = 35000;
server.headersTimeout = 20000;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
