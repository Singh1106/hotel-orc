import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "./activities";

const {
  fetchSupplierAHotels,
  fetchSupplierBHotels,
  dedupe,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
  retry: {
    maximumAttempts: 3,
  },
});

export async function hotelOfferWorkflow(city: string) {
  log.info("Starting hotel offer workflow", { city });

  const [supplierAHotels, supplierBHotels] = await Promise.all([
    fetchSupplierAHotels(city),
    fetchSupplierBHotels(city),
  ]);

  log.info("Fetched from both suppliers", {
    supplierACount: supplierAHotels.length,
    supplierBCount: supplierBHotels.length,
  });

  const deduped = await dedupe([
    { name: "Supplier A", hotels: supplierAHotels },
    { name: "Supplier B", hotels: supplierBHotels },
  ]);

  log.info("Workflow complete", { resultCount: deduped.length });

  return deduped;
}
