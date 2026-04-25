import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "./activities";
import type { HotelOffer } from "../suppliers/data";

const {
  fetchSupplierAHotels,
  fetchSupplierBHotels,
  dedupeAndCache,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
  retry: {
    maximumAttempts: 3,
  },
});

export async function hotelOfferWorkflow(city: string): Promise<HotelOffer[]> {
  log.info("Starting hotel offer workflow", { city });

  // Call both suppliers in parallel
  const [supplierAHotels, supplierBHotels] = await Promise.all([
    fetchSupplierAHotels(city),
    fetchSupplierBHotels(city),
  ]);

  log.info("Fetched from both suppliers", {
    supplierACount: supplierAHotels.length,
    supplierBCount: supplierBHotels.length,
  });

  // Deduplicate and cache ALL data in Redis
  const offers = await dedupeAndCache(city, [
    { name: "Supplier A", hotels: supplierAHotels },
    { name: "Supplier B", hotels: supplierBHotels },
  ]);

  log.info("Workflow complete - data cached in Redis", { offerCount: offers.length });

  return offers;
}
