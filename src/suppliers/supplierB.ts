import { Router } from "express";
import { supplierBHotels } from "./data";

const router = Router();

router.get("/hotels", (req, res) => {
  const city = (req.query.city as string || "").toLowerCase();

  if (!city) {
    return res.json([]);
  }

  const hotels = supplierBHotels.filter((h) => h.city === city);

  setTimeout(() => res.json(hotels), Math.floor(Math.random() * 201) + 100
  );
});

export default router;
