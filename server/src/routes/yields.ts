import { Router } from "express";
import {
  CURRENT_YIELDS_TTL_SECONDS,
  getYieldDataWithCacheStatus,
} from "../services/yieldService";

const yieldsRouter = Router();

yieldsRouter.get("/", async (_req, res) => {
  try {
    const { data: yields, cacheStatus } = await getYieldDataWithCacheStatus();
    res.setHeader(
      "Cache-Control",
      `public, max-age=${CURRENT_YIELDS_TTL_SECONDS}, stale-while-revalidate=30`,
    );
    res.setHeader("X-Cache-Status", cacheStatus);
    res.json(yields);
  } catch (error) {
    console.error("Failed to serve /api/yields.", error);
    res.status(500).json({
      error: "Unable to fetch yield data right now.",
      requestId: (_req as unknown as { requestId?: string }).requestId,
    });
  }
});

export default yieldsRouter;
