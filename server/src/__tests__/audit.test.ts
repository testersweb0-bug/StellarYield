import {
  createAuditEntry,
  verifyAuditEntry,
  getAuditLogs,
  verifyAuditTrailIntegrity,
  exportAuditLogsToCSV,
  getAuditStatistics,
  setAuditContext,
  initializeAuditLog,
} from "../middleware/audit";
import { Request, Response } from "express";

describe("Audit Trail System", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(async () => {
    // Initialize audit log before each test
    await initializeAuditLog();

    mockReq = {
      method: "POST",
      path: "/api/admin/vaults/vault-123/pause",
      headers: {
        "user-agent": "Mozilla/5.0 Test Browser",
        "x-forwarded-for": "192.168.1.1",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      } as Record<string, unknown>,
      user: {
        id: "admin-001",
        email: "admin@example.com",
        role: "ADMIN",
      },
    };

    mockRes = {
      statusCode: 200,
      headers: {},
      getHeader: (name: string) => mockRes.headers?.[name],
      setHeader: (name: string, value: string) => {
        if (!mockRes.headers) mockRes.headers = {};
        mockRes.headers[name] = value;
      },
    };
  });

  describe("createAuditEntry", () => {
    it("should create a valid audit entry with hash and signature", async () => {
      const entry = await createAuditEntry(
        mockReq as Request,
        mockRes as Response,
        {
          action: "PAUSE_VAULT",
          resource: "VAULT",
          resourceId: "vault-123",
          changes: { status: "paused" },
        },
      );

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.hash).toBeDefined();
      expect(entry.signature).toBeDefined();
      expect(entry.action).toBe("PAUSE_VAULT");
      expect(entry.resource).toBe("VAULT");
      expect(entry.resourceId).toBe("vault-123");
      expect(entry.userId).toBe("admin-001");
      expect(entry.userEmail).toBe("admin@example.com");
      expect(entry.method).toBe("POST");
      expect(entry.ipAddress).toBe("192.168.1.1");
    });

    it("should create entries with different hashes for different data", async () => {
      const entry1 = await createAuditEntry(
        mockReq as Request,
        mockRes as Response,
        {
          action: "PAUSE_VAULT",
          resource: "VAULT",
          resourceId: "vault-123",
        },
      );

      const entry2 = await createAuditEntry(
        mockReq as Request,
        mockRes as Response,
        {
          action: "RESUME_VAULT",
          resource: "VAULT",
          resourceId: "vault-123",
        },
      );

      expect(entry1.hash).not.toBe(entry2.hash);
      expect(entry1.signature).not.toBe(entry2.signature);
    });

    it("should maintain hash chain (previousHash)", async () => {
      const entry1 = await createAuditEntry(
        mockReq as Request,
        mockRes as Response,
        {
          action: "ACTION_1",
          resource: "RESOURCE",
        },
      );

      const entry2 = await createAuditEntry(
        mockReq as Request,
        mockRes as Response,
        {
          action: "ACTION_2",
          resource: "RESOURCE",
        },
      );

      expect(entry2.previousHash).toBe(entry1.hash);
    });
  });

  describe("verifyAuditEntry", () => {
    it("should verify a valid audit entry", async () => {
      const entry = await createAuditEntry(
        mockReq as Request,
        mockRes as Response,
        {
          action: "TEST_ACTION",
          resource: "TEST_RESOURCE",
        },
      );

      const isValid = verifyAuditEntry(entry);
      expect(isValid).toBe(true);
    });

    it("should reject entry with tampered hash", async () => {
      const entry = await createAuditEntry(
        mockReq as Request,
        mockRes as Response,
        {
          action: "TEST_ACTION",
          resource: "TEST_RESOURCE",
        },
      );

      // Tamper with the hash
      entry.hash = "tampered-hash-" + entry.hash;

      const isValid = verifyAuditEntry(entry);
      expect(isValid).toBe(false);
    });

    it("should reject entry with tampered signature", async () => {
      const entry = await createAuditEntry(
        mockReq as Request,
        mockRes as Response,
        {
          action: "TEST_ACTION",
          resource: "TEST_RESOURCE",
        },
      );

      // Tamper with the signature
      entry.signature = "tampered-sig-" + entry.signature;

      const isValid = verifyAuditEntry(entry);
      expect(isValid).toBe(false);
    });
  });

  describe("getAuditLogs", () => {
    beforeEach(async () => {
      // Create multiple audit entries
      await createAuditEntry(mockReq as Request, mockRes as Response, {
        userId: "user-1",
        action: "PAUSE_VAULT",
        resource: "VAULT",
        resourceId: "vault-1",
      });

      await createAuditEntry(mockReq as Request, mockRes as Response, {
        userId: "user-2",
        action: "UPDATE_FEE_CONFIG",
        resource: "FEE_CONFIG",
      });

      await createAuditEntry(mockReq as Request, mockRes as Response, {
        userId: "user-1",
        action: "RESUME_VAULT",
        resource: "VAULT",
        resourceId: "vault-1",
      });
    });

    it("should retrieve all audit logs", async () => {
      const logs = await getAuditLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    it("should filter logs by userId", async () => {
      const logs = await getAuditLogs({ userId: "user-1" });
      expect(logs.every((log) => log.userId === "user-1")).toBe(true);
    });

    it("should filter logs by action", async () => {
      const logs = await getAuditLogs({ action: "PAUSE_VAULT" });
      expect(logs.every((log) => log.action === "PAUSE_VAULT")).toBe(true);
    });

    it("should filter logs by resource", async () => {
      const logs = await getAuditLogs({ resource: "VAULT" });
      expect(logs.every((log) => log.resource === "VAULT")).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const logs = await getAuditLogs({ limit: 1 });
      expect(logs.length).toBeLessThanOrEqual(1);
    });

    it("should return logs sorted by timestamp descending", async () => {
      const logs = await getAuditLogs();
      for (let i = 0; i < logs.length - 1; i++) {
        const current = new Date(logs[i].timestamp).getTime();
        const next = new Date(logs[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe("verifyAuditTrailIntegrity", () => {
    it("should verify integrity of valid audit trail", async () => {
      const entries = [];
      for (let i = 0; i < 5; i++) {
        const entry = await createAuditEntry(
          mockReq as Request,
          mockRes as Response,
          {
            action: `ACTION_${i}`,
            resource: "RESOURCE",
          },
        );
        entries.push(entry);
      }

      const logs = await getAuditLogs({ limit: 100 });
      const verification = verifyAuditTrailIntegrity(logs);

      expect(verification.isValid).toBe(true);
      expect(verification.invalidEntries.length).toBe(0);
    });

    it("should detect tampered entries in audit trail", async () => {
      const entries = [];
      for (let i = 0; i < 3; i++) {
        const entry = await createAuditEntry(
          mockReq as Request,
          mockRes as Response,
          {
            action: `ACTION_${i}`,
            resource: "RESOURCE",
          },
        );
        entries.push(entry);
      }

      const logs = await getAuditLogs({ limit: 100 });

      // Tamper with middle entry
      if (logs.length > 1) {
        logs[1].hash = "tampered-hash";
      }

      const verification = verifyAuditTrailIntegrity(logs);

      expect(verification.isValid).toBe(false);
      expect(verification.invalidEntries.length).toBeGreaterThan(0);
    });
  });

  describe("exportAuditLogsToCSV", () => {
    beforeEach(async () => {
      await createAuditEntry(mockReq as Request, mockRes as Response, {
        action: "TEST_ACTION",
        resource: "TEST_RESOURCE",
        resourceId: "resource-1",
      });
    });

    it("should export audit logs as CSV", async () => {
      const csv = await exportAuditLogsToCSV();

      expect(csv).toBeDefined();
      expect(csv).toContain("ID");
      expect(csv).toContain("Timestamp");
      expect(csv).toContain("User ID");
      expect(csv).toContain("Action");
      expect(csv).toContain("Resource");
    });

    it("should include all log entries in CSV", async () => {
      const csv = await exportAuditLogsToCSV();
      const lines = csv.split("\n");

      // At least header + 1 entry
      expect(lines.length).toBeGreaterThan(1);
    });

    it("should filter CSV export by action", async () => {
      const csv = await exportAuditLogsToCSV({ action: "TEST_ACTION" });

      expect(csv).toContain("TEST_ACTION");
    });
  });

  describe("getAuditStatistics", () => {
    beforeEach(async () => {
      await createAuditEntry(mockReq as Request, mockRes as Response, {
        userId: "user-1",
        action: "PAUSE_VAULT",
        resource: "VAULT",
      });

      await createAuditEntry(mockReq as Request, mockRes as Response, {
        userId: "user-2",
        action: "UPDATE_FEE_CONFIG",
        resource: "FEE_CONFIG",
      });

      await createAuditEntry(mockReq as Request, mockRes as Response, {
        userId: "user-1",
        action: "PAUSE_VAULT",
        resource: "VAULT",
      });
    });

    it("should calculate audit statistics", async () => {
      const stats = await getAuditStatistics();

      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.uniqueUsers).toBeGreaterThan(0);
      expect(stats.actionCounts).toBeDefined();
      expect(stats.resourceCounts).toBeDefined();
    });

    it("should count actions correctly", async () => {
      const stats = await getAuditStatistics();

      expect(stats.actionCounts["PAUSE_VAULT"]).toBeGreaterThan(0);
      expect(stats.actionCounts["UPDATE_FEE_CONFIG"]).toBeGreaterThan(0);
    });

    it("should count resources correctly", async () => {
      const stats = await getAuditStatistics();

      expect(stats.resourceCounts["VAULT"]).toBeGreaterThan(0);
      expect(stats.resourceCounts["FEE_CONFIG"]).toBeGreaterThan(0);
    });
  });

  describe("setAuditContext", () => {
    it("should attach audit context to request", () => {
      const context = {
        action: "TEST_ACTION",
        resource: "TEST_RESOURCE",
      };

      setAuditContext(mockReq as Request, context);

      expect((mockReq as Record<string, unknown>).auditContext).toEqual(
        context,
      );
    });
  });

  describe("Date filtering", () => {
    it("should filter logs by date range", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await createAuditEntry(mockReq as Request, mockRes as Response, {
        action: "TEST_ACTION",
        resource: "TEST_RESOURCE",
      });

      const logs = await getAuditLogs({
        startDate: yesterday.toISOString(),
        endDate: tomorrow.toISOString(),
      });

      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
