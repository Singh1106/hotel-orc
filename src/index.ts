import express from 'express'
import type { Request, Response } from 'express'
import { Connection, Client } from '@temporalio/client';
import supplierARouter from "./suppliers/supplierA";
import supplierBRouter from "./suppliers/supplierB";
import { logger } from './logger';
import { startWorker } from './temporal/worker';
import { getCachedHotelOffers, redisClient } from './redis/client';
import type { Worker } from '@temporalio/worker';
import axios from 'axios';

const app = express()
app.use(express.json())

// Store worker reference for health checks
let workerInstance: Worker | null = null;

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { query: req.query });
  next();
});

app.use("/supplierA", supplierARouter);
app.use("/supplierB", supplierBRouter);

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    dependencies: {
      redis: { status: 'unknown', message: '' },
      temporal: { status: 'unknown', message: '' },
      worker: { status: 'unknown', message: '' },
      supplierA: { status: 'unknown', message: '' },
      supplierB: { status: 'unknown', message: '' }
    }
  };

  let allHealthy = true;

  // Check Redis
  try {
    if (redisClient.isOpen) {
      await redisClient.ping();
      health.dependencies.redis = { status: 'healthy', message: 'Connected and responsive' };
    } else {
      health.dependencies.redis = { status: 'unhealthy', message: 'Redis client not connected' };
      allHealthy = false;
    }
  } catch (error) {
    health.dependencies.redis = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Redis check failed' 
    };
    allHealthy = false;
  }

  // Check Temporal
  try {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_URL || 'localhost:7233',
    });
    const client = new Client({ connection });
    
    // Try to describe the namespace to verify connection
    await client.workflowService.describeNamespace({ namespace: 'default' });
    
    health.dependencies.temporal = { status: 'healthy', message: 'Connected to Temporal server' };
    connection.close();
  } catch (error) {
    health.dependencies.temporal = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Temporal connection failed' 
    };
    allHealthy = false;
  }

  // Check Worker
  try {
    if (workerInstance) {
      const workerState = workerInstance.getState();
      if (workerState === 'RUNNING') {
        health.dependencies.worker = { status: 'healthy', message: 'Worker is running' };
      } else {
        health.dependencies.worker = { 
          status: 'unhealthy', 
          message: `Worker state: ${workerState}` 
        };
        allHealthy = false;
      }
    } else {
      health.dependencies.worker = { status: 'unhealthy', message: 'Worker not initialized' };
      allHealthy = false;
    }
  } catch (error) {
    health.dependencies.worker = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Worker check failed' 
    };
    allHealthy = false;
  }

  // Check Supplier A
  try {
    const response = await axios.get(`http://localhost:${PORT}/supplierA/hotels?city=delhi`, {
      timeout: 5000
    });
    if (response.status === 200 && Array.isArray(response.data)) {
      health.dependencies.supplierA = { status: 'healthy', message: 'Supplier A responding' };
    } else {
      health.dependencies.supplierA = { status: 'unhealthy', message: 'Unexpected response format' };
      allHealthy = false;
    }
  } catch (error) {
    health.dependencies.supplierA = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Supplier A check failed' 
    };
    allHealthy = false;
  }

  // Check Supplier B
  try {
    const response = await axios.get(`http://localhost:${PORT}/supplierB/hotels?city=delhi`, {
      timeout: 5000
    });
    if (response.status === 200 && Array.isArray(response.data)) {
      health.dependencies.supplierB = { status: 'healthy', message: 'Supplier B responding' };
    } else {
      health.dependencies.supplierB = { status: 'unhealthy', message: 'Unexpected response format' };
      allHealthy = false;
    }
  } catch (error) {
    health.dependencies.supplierB = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Supplier B check failed' 
    };
    allHealthy = false;
  }

  health.status = allHealthy ? 'healthy' : 'unhealthy';
  
  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json(health);
});

// Hotel search endpoint - checks Redis cache first, then triggers workflow if needed
app.get('/api/hotels', async (req: Request, res: Response) => {
  try {
    const city = (req.query.city as string || 'delhi').toLowerCase();
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;
    
    logger.info('Hotel search request', { city, minPrice, maxPrice });
    
    // Validate price parameters
    if (minPrice !== undefined && isNaN(minPrice)) {
      return res.status(400).json({ error: 'Invalid minPrice parameter' });
    }
    if (maxPrice !== undefined && isNaN(maxPrice)) {
      return res.status(400).json({ error: 'Invalid maxPrice parameter' });
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return res.status(400).json({ error: 'minPrice cannot be greater than maxPrice' });
    }
    
    // Check Redis cache first
    logger.debug('Checking Redis cache', { city });
    let cachedOffers = await getCachedHotelOffers(city, minPrice, maxPrice);
    
    if (cachedOffers) {
      logger.info('Cache hit - returning cached results', { city, count: cachedOffers.length });
      return res.json(cachedOffers);
    }
    
    // Cache miss - start workflow to fetch and cache data
    logger.info('Cache miss - starting workflow', { city });
    
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
    
    // Wait for workflow to complete (data is now cached in Redis)
    await handle.result();
    
    logger.info('Workflow completed - fetching from Redis', { city });
    
    // Now fetch from Redis with price filtering
    const offers = await getCachedHotelOffers(city, minPrice, maxPrice);
    
    if (!offers) {
      throw new Error('Failed to retrieve data from Redis after workflow completion');
    }
    
    logger.info('Returning results', { city, count: offers.length });
    
    // Return array directly as per requirements
    res.json(offers);
  } catch (error) {
    logger.error('Error fetching hotel offers', { 
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
    workerInstance = await startWorker();
    workerInstance.run().catch((err) => {
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