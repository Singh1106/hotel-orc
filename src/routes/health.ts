import { Router, Request, Response } from 'express';
import { Connection, Client } from '@temporalio/client';
import { redisClient } from '../redis/client';
import type { Worker } from '@temporalio/worker';
import axios from 'axios';

const router = Router();

// Store worker reference for health checks
let workerInstance: Worker | null = null;

export function setWorkerInstance(worker: Worker) {
  workerInstance = worker;
}

router.get('/', async (req: Request, res: Response) => {
  const PORT = process.env.PORT || 3000;
  
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

export default router;
