import request from "supertest";
import { createApp } from "../app";

jest.mock("@prisma/client", () => {
  const mockPrisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    indexerState: {
      findFirst: jest.fn().mockResolvedValue({ id: "singleton", lastLedger: 1000 }),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock("@stellar/stellar-sdk", () => {
  const mockLedgerCall = jest.fn().mockResolvedValue({
    records: [{ sequence: 1010 }],
  });
  const mockLedgers = jest.fn(() => ({
    limit: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    call: mockLedgerCall,
  }));
  const mockGetNetwork = jest.fn().mockResolvedValue({ passphrase: "Test SDF Network ; September 2015" });
  return {
    // Networks must be present so relayer.ts (imported via app.ts) can
    // access StellarSdk.Networks.TESTNET without throwing.
    Networks: {
      TESTNET: "Test SDF Network ; September 2015",
      PUBLIC: "Public Global Stellar Network ; September 2015",
    },
    Horizon: { Server: jest.fn(() => ({ ledgers: mockLedgers })) },
    rpc: { Server: jest.fn(() => ({ getNetwork: mockGetNetwork })) },
  };
});

describe("GET /api/health", () => {
  const app = createApp();

  it("returns 200 with all components up when healthy", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("up");
    expect(res.body.horizon).toBe("up");
    expect(res.body.sorobanRpc).toBe("up");
    expect(res.body.indexer).toBe("up");
    expect(res.body.timestamp).toBeDefined();
  });

  it("returns 503 when database is down", async () => {
    const { PrismaClient } = jest.requireMock("@prisma/client") as {
      PrismaClient: jest.Mock;
    };
    PrismaClient.mockImplementationOnce(() => ({
      $queryRaw: jest.fn().mockRejectedValue(new Error("Connection refused")),
      indexerState: {
        findFirst: jest.fn().mockResolvedValue({ id: "singleton", lastLedger: 1000 }),
      },
    }));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.database).toBe("down");
  });

  it("returns 503 when horizon is unreachable", async () => {
    const { Horizon } = jest.requireMock("@stellar/stellar-sdk") as {
      Horizon: { Server: jest.Mock };
    };
    Horizon.Server.mockImplementationOnce(() => ({
      ledgers: () => ({
        limit: () => ({ order: () => ({ call: jest.fn().mockRejectedValue(new Error("timeout")) }) }),
      }),
    }));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.horizon).toBe("down");
  });

  it("reports indexer warning when lag exceeds threshold", async () => {
    const { PrismaClient } = jest.requireMock("@prisma/client") as {
      PrismaClient: jest.Mock;
    };
    PrismaClient.mockImplementationOnce(() => ({
      $queryRaw: jest.fn().mockResolvedValue([]),
      indexerState: {
        findFirst: jest.fn().mockResolvedValue({ id: "singleton", lastLedger: 900 }),
      },
    }));
    const res = await request(app).get("/api/health");
    expect(res.body.indexer).toBe("warning");
    expect(res.body.indexerLag).toBeGreaterThanOrEqual(50);
  });

  it("includes latestLedger and syncedLedger fields", async () => {
    const res = await request(app).get("/api/health");
    expect(typeof res.body.latestLedger).toBe("number");
    expect(typeof res.body.syncedLedger).toBe("number");
  });
});
