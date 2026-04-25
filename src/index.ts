import express from 'express'
import type { Request, Response } from 'express'
import { Connection, Client } from '@temporalio/client';
import supplierARouter from "./suppliers/supplierA";
import supplierBRouter from "./suppliers/supplierB";
import { logger } from './logger';
import { startWorker } from './temporal/worker';

const app = express()
app.use(express.json())

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { query: req.query });
  next();
});

app.use("/supplierA", supplierARouter);
app.use("/supplierB", supplierBRouter);

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'hello' })
})

// Temporary endpoint to trigger hotel workflow
app.get('/api/hotels', async (req: Request, res: Response) => {
  try {
    const city = req.query.city as string || 'delhi';
    logger.info('Starting hotel search workflow', { city });
    
    // Connect to Temporal
    logger.debug('Connecting to Temporal', { address: process.env.TEMPORAL_URL || 'localhost:7233' });
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_URL || 'localhost:7233',
    });
    
    const client = new Client({ connection });
    logger.debug('Temporal client created');
    
    // Start workflow
    const workflowId = `hotel-offer-${city}-${Date.now()}`;
    logger.info('Starting workflow', { workflowId, city });
    
    const handle = await client.workflow.start('hotelOfferWorkflow', {
      taskQueue: 'hotel-offers',
      args: [city],
      workflowId,
    });
    
    logger.debug('Workflow started, waiting for result', { workflowId });
    
    // Wait for result
    const result = await handle.result();
    
    logger.info('Workflow completed', { city, offerCount: result.length });
    
    res.json({ 
      city,
      offers: result,
      count: result.length 
    });
  } catch (error) {
    logger.error('Error running workflow', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ 
      error: 'Failed to fetch hotel offers',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
})

// Start server and worker together
const PORT = 3000;

app.listen(PORT, async () => {
  logger.info('Server started', { port: PORT, url: `http://localhost:${PORT}` });
  logger.info('Log level', { level: process.env.LOG_LEVEL || 'info' });
  
  // Start Temporal worker
  try {
    const worker = await startWorker();
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