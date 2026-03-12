import { BASE_CAMP_LAT, BASE_CAMP_LNG, BASE_CAMP_RADIUS_KM } from "../config/baseCamp.js";

/**
 * GET /api/config/base-camp
 * Mengembalikan koordinat dan radius base camp (Taman Kodim) untuk Live Map & dispatch.
 */
export const getBaseCamp = async (req, res) => {
  res.status(200).json({
    status: "success",
    data: {
      lat: BASE_CAMP_LAT,
      lng: BASE_CAMP_LNG,
      radius_km: BASE_CAMP_RADIUS_KM,
      label: "Base Camp (Taman Kodim)",
    },
  });
};
