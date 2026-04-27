import { calculateRiskScore } from "./riskScoring";
import type { NormalizedYield, RawProtocolYield } from "../types/yields";

const roundTo = (value: number, digits: number) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

export function normalizeYield(rawYield: RawProtocolYield): NormalizedYield {
  const risk = calculateRiskScore({
    tvlUsd: rawYield.tvlUsd,
    ilVolatilityPct: rawYield.volatilityPct,
    protocolAgeDays: rawYield.protocolAgeDays,
  });

  return {
    protocolName: rawYield.protocolName,
    apy: roundTo(rawYield.apyBps / 100, 2),
    tvl: roundTo(rawYield.tvlUsd, 2),
    riskScore: risk.score,
    source: rawYield.source,
    fetchedAt: rawYield.fetchedAt,
    attribution: rawYield.attribution || {
      baseYield: roundTo(rawYield.apyBps / 100 * 0.7, 2),
      incentives: roundTo(rawYield.apyBps / 100 * 0.2, 2),
      compounding: roundTo(rawYield.apyBps / 100 * 0.05, 2),
      tacticalRotation: roundTo(rawYield.apyBps / 100 * 0.05, 2),
    },
  };
}

export function normalizeYields(
  rawYields: RawProtocolYield[],
): NormalizedYield[] {
  return rawYields.map(normalizeYield);
}
