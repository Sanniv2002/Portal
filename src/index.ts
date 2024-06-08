import express, { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import type * as http from 'http';

const app = express();
const prisma = new PrismaClient();

// Rate limiter middleware
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
});

app.use(limiter);

// Track the current index for each alias
const currentIndex: { [key: string]: number } = {};

// Function to fetch ports for an alias
async function fetchPorts(alias: string): Promise<number[]> {
  const config = await prisma.config.findUnique({
    where: { alias },
    include: { servers: true },
  });

  if (config && config.servers.length > 0) {
    return config.servers.map(server => server.hostPORT);
  } else {
    return [];
  }
}

// Round Robin based middleware
app.use('/:alias', async (req: Request, res: Response, next: NextFunction) => {
  const alias = req.params.alias;

  // Fetch the servers for the given alias
  const ports = await fetchPorts(alias);

  if (ports.length > 0) {
    // Initialize current index if not already
    if (!currentIndex[alias]) {
      currentIndex[alias] = 0;
    }

    // Get the current index and update it for round-robin
    const index = currentIndex[alias];
    const port = ports[index];

    // Update the index for round-robin
    currentIndex[alias] = (index + 1) % ports.length;

    const proxyMiddleware: RequestHandler = createProxyMiddleware({
      target: `http://localhost:${port}`,
      changeOrigin: true,
      on: {
        proxyReq: (proxyReq, req: http.IncomingMessage) => {
          console.log(`Proxying request to: http://localhost:${port}${req.url}`);
        },
        error: async (err:any, req:any, res:any) => {
          console.error('Proxy error:', err);
          
          // Fetch the updated ports for the alias
          const updatedPorts = await fetchPorts(alias);
          console.log(updatedPorts)

          if (updatedPorts.length > 0) {
            //@ts-ignore
            ports[alias] = updatedPorts;

            // Retry the proxy operation with the updated ports
            return proxyMiddleware(req, res, next);
          } else {
            // If no servers are found for the alias, send a 404 response
            res.status(404).send('Alias not found.');
          }
        },
      },
    });
    return proxyMiddleware(req, res, next);
  } else {
    res.status(404).send('Alias not found.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server is running on port ${PORT}`);
});
