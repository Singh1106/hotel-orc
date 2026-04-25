import 'dotenv/config';
import express from 'express'
import supplierARouter from "./suppliers/supplierA";
import supplierBRouter from "./suppliers/supplierB";
import hotelsRouter from "./routes/hotels";
import healthRouter, { setWorkerInstance } from "./routes/health";
import { logger } from './logger';
import { startWorker } from './temporal/worker';
import { Request, Response } from 'express';


const app = express()
app.use(express.json())

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  logger.info(`${req.method} ${req.path}`, { query: req.query });
  next();
});

// Routes
app.use("/supplierA", supplierARouter);
app.use("/supplierB", supplierBRouter);
app.use("/health", healthRouter);
app.use("/api/hotels", hotelsRouter);

// Start server and worker together
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.listen(PORT, async () => {
  logger.info('Server started', { port: PORT, url: `http://localhost:${PORT}` });
  logger.info('Log level', { level: process.env.LOG_LEVEL || 'info' });
  
  // Start Temporal worker
  try {
    const worker = await startWorker();
    setWorkerInstance(worker);
    worker.run().catch((err) => {
      logger.error('Worker error', { error: err.message, stack: err.stack });
      process.exit(1);
    });
    logger.info('Worker is running and ready to process workflows');
  } catch (err) {
    logger.error('Failed to start worker', { 
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined
    });
    process.exit(1);
  }
})
