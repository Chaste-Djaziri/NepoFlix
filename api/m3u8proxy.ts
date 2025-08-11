import http from 'node:http';
import https from 'node:https';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const path = req.query?.path;
  if (!path) {
    res.statusCode = 400;
    res.end('Missing target URL');
    return;
  }

  const target = Array.isArray(path) ? path.join('/') : path;
  let url: URL;
  try {
    url = new URL(target);
  } catch (err: any) {
    res.statusCode = 400;
    res.end('Invalid URL');
    return;
  }

  const client = url.protocol === 'http:' ? http : https;
  const proxyReq = client.request(url, proxyRes => {
    Object.entries(proxyRes.headers).forEach(([key, value]) => {
      if (value !== undefined) {
        res.setHeader(key, value as any);
      }
    });
    res.statusCode = proxyRes.statusCode || 500;
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err: any) => {
    res.statusCode = 500;
    res.end(err.message);
  });

  if (req.method === 'GET') {
    proxyReq.end();
  } else {
    req.pipe(proxyReq);
  }
}
