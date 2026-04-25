export interface HotelOffer {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export const supplierAHotels: HotelOffer[] = [
  { hotelId: "a1", name: "Holtin", price: 6000, city: "delhi", commissionPct: 10 },
  { hotelId: "a2", name: "Radison", price: 5900, city: "delhi", commissionPct: 13 },
  { hotelId: "a3", name: "Marriot", price: 8500, city: "delhi", commissionPct: 15 },
  { hotelId: "a4", name: "Taj Palace", price: 12000, city: "delhi", commissionPct: 8 },
  { hotelId: "a5", name: "Holtin", price: 5500, city: "mumbai", commissionPct: 10 },
  { hotelId: "a6", name: "JW Marriot", price: 9200, city: "mumbai", commissionPct: 14 },
  { hotelId: "a7", name: "Radison", price: 4800, city: "bangalore", commissionPct: 12 },
  { hotelId: "a8", name: "Holtin", price: 5200, city: "bangalore", commissionPct: 10 },
];

export const supplierBHotels: HotelOffer[] = [
  { hotelId: "b1", name: "Holtin", price: 5340, city: "delhi", commissionPct: 20 },
  { hotelId: "b2", name: "Radison", price: 6200, city: "delhi", commissionPct: 11 },
  { hotelId: "b3", name: "Oberoi", price: 9500, city: "delhi", commissionPct: 12 },
  { hotelId: "b4", name: "ITC Grand", price: 7800, city: "delhi", commissionPct: 18 },
  { hotelId: "b5", name: "Holtin", price: 5800, city: "mumbai", commissionPct: 18 },
  { hotelId: "b6", name: "Leela", price: 11000, city: "mumbai", commissionPct: 16 },
  { hotelId: "b7", name: "Radison", price: 4500, city: "bangalore", commissionPct: 15 },
  { hotelId: "b8", name: "Taj", price: 8900, city: "bangalore", commissionPct: 9 },
];
