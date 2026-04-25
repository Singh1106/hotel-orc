import axios from "axios";
import { HotelOffer } from "../suppliers/data";
import { dedupeAndCacheInRedis } from "../redis/client";
import { logger } from "../logger";

const APP_URL = "http://localhost:3000";

export async function fetchSupplierAHotels(city: string): Promise<HotelOffer[]> {
  logger.debug("Fetching from Supplier A", { city });
  const response = await axios.get<HotelOffer[]>(`${APP_URL}/supplierA/hotels`, {
    params: { city },
    timeout: 5000,
  });
  logger.info("Supplier A response", { city, count: response.data.length });
  return response.data;
}

export async function fetchSupplierBHotels(city: string): Promise<HotelOffer[]> {
  logger.debug("Fetching from Supplier B", { city });
  const response = await axios.get<HotelOffer[]>(`${APP_URL}/supplierB/hotels`, {
    params: { city },
    timeout: 5000,
  });
  logger.info("Supplier B response", { city, count: response.data.length });
  return response.data;
}

export async function dedupeAndCache(
  city: string,
  supplierResults: Array<{ name: string; hotels: HotelOffer[] }>
): Promise<HotelOffer[]> {
  logger.info("Starting deduplication and caching", { city });
  // Store all data in Redis with deduplication and sorting (keeps lowest price)
  return dedupeAndCacheInRedis(city, supplierResults);
}
