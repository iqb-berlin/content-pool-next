import { ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  let dataSource: Pick<DataSource, "query">;

  beforeEach(() => {
    dataSource = {
      query: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    };
    controller = new HealthController(dataSource as DataSource);
  });

  it("returns liveness payload", () => {
    const res = controller.getLiveness();
    expect(res.status).toBe("ok");
    expect(typeof res.uptimeSeconds).toBe("number");
    expect(typeof res.timestamp).toBe("string");
  });

  it("returns readiness payload when database is reachable", async () => {
    const res = await controller.getReadiness();
    expect(res.status).toBe("ok");
    expect(res.checks?.database).toBe("up");
    expect(dataSource.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("throws service unavailable when database check fails", async () => {
    dataSource.query = jest.fn().mockRejectedValue(new Error("db down"));
    controller = new HealthController(dataSource as DataSource);

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
