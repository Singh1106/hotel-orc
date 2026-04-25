import { Router } from "express";
import { supplierAHotels } from "./data";

const router = Router();

router.get("/hotels", (req, res) => {
  const city = (req.query.city as string || "").toLowerCase();

  if (!city) {
    return res.json([]);
  }

  const hotels = supplierAHotels.filter((h) => h.city === city);

  setTimeout(() => res.json(hotels), 150);
});

export default router;
