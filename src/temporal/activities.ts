import axios from "axios";
import { Hotel } from "../suppliers/data";
import { HotelOffer } from "../types";
import { dedupeAndCacheInRedis } from "../redis/client";
import { logger } from "../logger";

const APP_URL = "http://localhost:3000";

export async function fetchSupplierAHotels(city: string): Promise<Hotel[]> {
  logger.debug("Fetching from Supplier A", { city });
  const response = await axios.get<Hotel[]>(`${APP_URL}/supplierA/hotels`, {
    params: { city },
    timeout: 5000,
  });
  logger.info("Supplier A response", { city, count: response.data.length });
  return response.data;
}

export async function fetchSupplierBHotels(city: string): Promise<Hotel[]> {
  logger.debug("Fetching from Supplier B", { city });
  const response = await axios.get<Hotel[]>(`${APP_URL}/supplierB/hotels`, {
    params: { city },
    timeout: 5000,
  });
  logger.info("Supplier B response", { city, count: response.data.length });
  return response.data;
}

export async function dedupeAndCache(
  city: string,
  supplierResults: Array<{ name: string; hotels: Hotel[] }>
): Promise<HotelOffer[]> {
  logger.info("Starting deduplication and caching", { city });
  // Let Redis handle deduplication and sorting
  return dedupeAndCacheInRedis(city, supplierResults);
}
