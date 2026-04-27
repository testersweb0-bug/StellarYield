
import { incidentService } from "../services/incidentService";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("IncidentService", () => {
    let createdIncidentId: string;

    beforeAll(async () => {
        // Cleanup any existing test data if necessary
    });

    afterAll(async () => {
        if (createdIncidentId) {
            await prisma.incident.delete({ where: { id: createdIncidentId } });
        }
    });

    it("should create a new incident", async () => {
        const data = {
            protocol: "TestProtocol",
            severity: "HIGH",
            type: "PAUSE",
            title: "Test Incident",
            description: "A test incident for verification",
            affectedVaults: ["Vault1"],
            startedAt: new Date(),
        };
        const incident = await incidentService.createIncident(data);
        createdIncidentId = incident.id;

        expect(incident.protocol).toBe(data.protocol);
        expect(incident.severity).toBe(data.severity);
        expect(incident.resolved).toBe(false);
    });

    it("should fetch incidents with filters", async () => {
        const incidents = await incidentService.getIncidents({ protocol: "TestProtocol" });
        expect(incidents.length).toBeGreaterThan(0);
        expect(incidents[0].protocol).toBe("TestProtocol");
    });

    it("should resolve an incident", async () => {
        const resolved = await incidentService.resolveIncident(createdIncidentId);
        expect(resolved.resolved).toBe(true);
        expect(resolved.resolvedAt).not.toBeNull();
    });
});
