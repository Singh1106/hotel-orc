import { Router, Request, Response } from 'express';
import { Connection, Client } from '@temporalio/client';
import { getCachedHotelOffers } from '../redis/client';
import { logger } from '../logger';

const router = Router();

// Hotel search endpoint - checks Redis cache first, then triggers workflow if needed
router.get('/', async (req: Request, res: Response) => {
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
});

export default router;
