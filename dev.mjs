import { createServer } from 'node:http';
import handler from './api/handler.js';
const server=createServer(handler);server.listen(8787,'127.0.0.1',()=>console.log('Local API: http://127.0.0.1:8787'));
