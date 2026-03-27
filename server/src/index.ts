import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
import rateLimit from "express-rate-limit";
import yieldsRouter from "./routes/yields";

const relayerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Each IP/Wallet is limited to 3 fee bumps per window (as per issue)
  message: "Too many requests, please try again later.",
});

import { signFeeBump } from "./relayer/relayer";
app.post("/api/relayer/fee-bump", relayerLimiter, signFeeBump);
app.use("/api/yields", yieldsRouter);

import { startIndexer } from "./indexer/indexer";
startIndexer().catch(console.error);

import { startHistoricalYieldAggregationJob } from "./jobs/historicalYieldAggregation";
startHistoricalYieldAggregationJob();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

app.get("/api/events", async (req, res) => {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  res.json(events);
});

app.post("/api/recommend", (req: Request, res: Response) => {
  const { preferences, riskTolerance } = req.body;
  void preferences;
  // Mock Claude AI recommendation based on inputs
  res.json({
    recommendation: `Based on your ${riskTolerance || "moderate"} risk tolerance, we recommend the Yield Index vault on DeFindex for diversified, stable returns.`,
    targetVault: "DeFindex Yield Index",
    expectedApy: 8.9,
  });
});

// Predictive APY endpoint
import { predictApy, HistoricalDataPoint } from "./analytics/apyPredictor";

app.get("/api/yields/predict", (req: Request, res: Response) => {
  const protocol = (req.query.protocol as string) || "Blend";

  // Generate mock historical data (last 30 days) based on the protocol's current APY
  const mockYields = [
    { protocol: "Blend", apy: 6.5, tvl: 12000000 },
    { protocol: "Soroswap", apy: 12.2, tvl: 4500000 },
    { protocol: "DeFindex", apy: 8.9, tvl: 8000000 },
  ];
  const vault = mockYields.find((v) => v.protocol === protocol);
  const baseApy = vault?.apy ?? 5;

  const historical: HistoricalDataPoint[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    // Add realistic noise around the base APY
    const noise = (Math.random() - 0.5) * baseApy * 0.2;
    historical.push({
      date: d.toISOString().split("T")[0],
      apy: Math.round((baseApy + noise) * 100) / 100,
      tvl: vault?.tvl,
    });
  }

  const prediction = predictApy(protocol, historical);
  res.json(prediction);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
