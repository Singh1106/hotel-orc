import axios from "axios";
import { Hotel } from "../suppliers/data";
import { HotelOffer } from "../types";

const APP_URL = "http://localhost:3000";

export async function fetchSupplierAHotels(city: string): Promise<Hotel[]> {
  const response = await axios.get<Hotel[]>(`${APP_URL}/supplierA/hotels`, {
    params: { city },
    timeout: 5000,
  });
  return response.data;
}

export async function fetchSupplierBHotels(city: string): Promise<Hotel[]> {
  const response = await axios.get<Hotel[]>(`${APP_URL}/supplierB/hotels`, {
    params: { city },
    timeout: 5000,
  });
  return response.data;
}

export async function dedupe(
  supplierResults: Array<{ name: string; hotels: Hotel[] }>
): Promise<HotelOffer[]> {
  const hotelMap = new Map<string, HotelOffer>();

  for (const { name: supplierName, hotels } of supplierResults) {
    for (const hotel of hotels) {
      const existing = hotelMap.get(hotel.name);
      if (!existing || hotel.price < existing.price) {
        hotelMap.set(hotel.name, {
          name: hotel.name,
          price: hotel.price,
          supplier: supplierName,
          commissionPct: hotel.commissionPct,
        });
      }
    }
  }

  return Array.from(hotelMap.values());
}
