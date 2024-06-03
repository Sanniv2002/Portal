import express, { Request, Response, NextFunction } from "express";
import { createProxyMiddleware, RequestHandler } from "http-proxy-middleware";
import type * as http from "http";

const app = express();

// Define the alias to list of ports mappings
const aliasPortMapping: { [key: string]: number[] } = {
  qwerty: [32769, 32770, 32771],
  qwerty2: [32772, 32773, 32774],
  abcd: [32775],
  // Add more mappings as needed
};

// Track the current index for each alias
const currentIndex: { [key: string]: number } = {};

// Initialize current index for each alias
for (const alias in aliasPortMapping) {
  currentIndex[alias] = 0;
}

// Middleware to handle proxying based on alias with round-robin
app.use("/:alias", (req: Request, res: Response, next: NextFunction) => {
  const alias = req.params.alias;
  const ports = aliasPortMapping[alias];

  if (ports && ports.length > 0) {
    // Get the current index and update it for round-robin
    const index = currentIndex[alias];
    const port = ports[index];

    // Update the index for round-robin
    currentIndex[alias] = (index + 1) % ports.length;

    const proxyMiddleware: RequestHandler = createProxyMiddleware({
      target: `http://localhost:${port}`,
      changeOrigin: true,
      on: {
        proxyReq: (
          proxyReq,
          req: http.IncomingMessage,
        ) => {
          console.log(
            `Proxying request to: http://localhost:${port}${req.url}`
          );
        },
        error: (err: any, res: any) => {
          console.error("Proxy error:", err);
          res.status(500).send("Something went wrong with the proxy.");
        },
      },
    });
    return proxyMiddleware(req, res, next);
  } else {
    res.status(404).send("Alias not found.");
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server is running on port ${PORT}`);
});
