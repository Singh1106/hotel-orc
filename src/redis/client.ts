import { createClient } from "redis";
import { HotelOffer } from "../types";
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
    hotels: Array<{ name: string; price: number; commissionPct: number }> 
  }>
): Promise<HotelOffer[]> {
  if (!redisConnected) {
    logger.error("Redis not connected, cannot dedupe and cache");
    throw new Error("Redis not connected");
  }

  logger.debug("Starting Redis deduplication", { city, supplierCount: supplierResults.length });

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
      const hotelOffer: HotelOffer = {
        name: hotel.name,
        price: hotel.price,
        supplier: supplierName,
        commissionPct: hotel.commissionPct,
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
      pipeline.hSet(hashKey, hotel.name, JSON.stringify(hotelOffer));
    }
  }

  // Set TTL on both keys
  pipeline.expire(sortedSetKey, CACHE_TTL);
  pipeline.expire(hashKey, CACHE_TTL);

  logger.debug("Executing Redis pipeline", { totalHotels });
  await pipeline.exec();
  logger.debug("Redis pipeline executed");

  // Retrieve sorted results (automatically sorted by price ascending)
  const hotelNames = await redisClient.zRange(sortedSetKey, 0, -1);
  logger.debug("Retrieved hotel names from sorted set", { count: hotelNames.length });

  // Fetch full details for each hotel
  const offers: HotelOffer[] = [];
  for (const hotelName of hotelNames) {
    const data = await redisClient.hGet(hashKey, hotelName);
    if (data) {
      offers.push(JSON.parse(data));
    }
  }

  logger.info("Deduplication complete", { 
    city, 
    totalHotels, 
    uniqueHotels: offers.length,
    duplicatesRemoved: totalHotels - offers.length 
  });

  return offers;
}

export async function getCachedHotelOffers(city: string): Promise<HotelOffer[] | null> {
  if (!redisConnected) {
    return null;
  }

  const sortedSetKey = `hotels:${city}:offers`;
  const hashKey = `hotels:${city}:details`;

  // Check if cache exists
  const exists = await redisClient.exists(sortedSetKey);
  if (!exists) {
    return null;
  }

  // Retrieve sorted results (sorted by price ascending)
  const hotelNames = await redisClient.zRange(sortedSetKey, 0, -1);

  // Fetch full details for each hotel
  const offers: HotelOffer[] = [];
  for (const hotelName of hotelNames) {
    const data = await redisClient.hGet(hashKey, hotelName);
    if (data) {
      offers.push(JSON.parse(data));
    }
  }

  return offers;
}
