import { createClient } from "redis";
import { HotelOffer } from "../suppliers/data";
import { logger } from "../logger";

const CACHE_TTL = 15 * 60; // 15 minutes in seconds

// Redis client setup
export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => logger.error("Redis Client Error", { error: err.message }));

// Connect to Redis
let redisConnected = false;

export const initRedis = async () => {
  try {
    logger.info("Connecting to Redis", { url: process.env.REDIS_URL || "redis://localhost:6379" });
    await redisClient.connect();
    redisConnected = true;
    logger.info("Redis connected successfully");
  } catch (err) {
    logger.error("Failed to connect to Redis", { error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const isRedisConnected = () => redisConnected;

// Initialize connection
initRedis();

export async function dedupeAndCacheInRedis(
  city: string,
  supplierResults: Array<{ 
    name: string; 
    hotels: HotelOffer[]
  }>
): Promise<HotelOffer[]> {
  if (!redisConnected) {
    logger.error("Redis not connected, cannot dedupe and cache");
    throw new Error("Redis not connected");
  }

  logger.debug("Starting Redis deduplication and caching", { city, supplierCount: supplierResults.length });

  const sortedSetKey = `hotels:${city}:offers`;
  const hashKey = `hotels:${city}:details`;

  // Use Redis pipeline for atomic operations
  const pipeline = redisClient.multi();

  // Clear existing data for this city
  pipeline.del(sortedSetKey);
  pipeline.del(hashKey);

  let totalHotels = 0;

  // Process all supplier results - let Redis handle deduplication
  for (const { name: supplierName, hotels } of supplierResults) {
    logger.debug(`Processing supplier ${supplierName}`, { hotelCount: hotels.length });
    totalHotels += hotels.length;
    
    for (const hotel of hotels) {
      // Create hotel data with updated supplier field
      const hotelData: HotelOffer & { supplier: string } = {
        hotelId: hotel.hotelId,
        name: hotel.name,
        price: hotel.price,
        city: hotel.city,
        commissionPct: hotel.commissionPct,
        supplier: supplierName,
      };

      // Add to sorted set with price as score
      // LT flag: only update if new score is LESS than current (keeps lowest price)
      pipeline.zAdd(
        sortedSetKey,
        { score: hotel.price, value: hotel.name },
        { LT: true }
      );

      // Store full hotel details in hash
      // This will overwrite with the latest, but sorted set keeps the best price
      pipeline.hSet(hashKey, hotel.name, JSON.stringify(hotelData));
    }
  }

  // Set TTL on both keys
  pipeline.expire(sortedSetKey, CACHE_TTL);
  pipeline.expire(hashKey, CACHE_TTL);

  logger.debug("Executing Redis pipeline", { totalHotels });
  await pipeline.exec();
  logger.debug("Redis pipeline executed");

  // Retrieve all cached results
  const hotelNames = await redisClient.zRange(sortedSetKey, 0, -1);
  
  // Fetch full details for each hotel
  const offers: HotelOffer[] = [];
  for (const hotelName of hotelNames) {
    const data = await redisClient.hGet(hashKey, hotelName);
    if (data) {
      offers.push(JSON.parse(data));
    }
  }

  logger.info("Deduplication and caching complete", { 
    city, 
    totalHotels,
    uniqueHotels: offers.length
  });

  return offers;
}

export async function getCachedHotelOffers(
  city: string,
  minPrice?: number,
  maxPrice?: number
): Promise<HotelOffer[] | null> {
  if (!redisConnected) {
    return null;
  }

  const sortedSetKey = `hotels:${city}:offers`;
  const hashKey = `hotels:${city}:details`;

  // Check if cache exists
  const exists = await redisClient.exists(sortedSetKey);
  if (!exists) {
    return null; // Cache miss - need to run workflow
  }

  // Cache exists (even if empty) - retrieve results
  const min = minPrice !== undefined ? minPrice : '-inf';
  const max = maxPrice !== undefined ? maxPrice : '+inf';
  
  logger.debug("Filtering hotels by price range", { city, min, max });
  
  const hotelNames = await redisClient.zRangeByScore(sortedSetKey, min, max);

  // Fetch full details for each hotel
  const offers: HotelOffer[] = [];
  for (const hotelName of hotelNames) {
    const data = await redisClient.hGet(hashKey, hotelName);
    if (data) {
      offers.push(JSON.parse(data));
    }
  }

  logger.info("Retrieved filtered hotels from cache", { 
    city, 
    count: offers.length,
    minPrice,
    maxPrice 
  });

  return offers; // Return empty array if no hotels (valid cached result)
}
