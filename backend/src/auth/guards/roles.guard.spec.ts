import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard, ROLES_KEY } from "./roles.guard";

describe("RolesGuard", () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const createContext = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function handler() {},
      getClass: () => class TestClass {},
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it("allows when no role metadata is set", () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === ROLES_KEY ? undefined : undefined,
    );

    expect(guard.canActivate(createContext({ user: null, params: {} }))).toBe(
      true,
    );
  });

  it("rejects unauthenticated users when roles are required", () => {
    reflector.getAllAndOverride.mockReturnValue(["ACP_MANAGER"]);

    expect(() =>
      guard.canActivate(createContext({ user: null, params: {} })),
    ).toThrow(ForbiddenException);
  });

  it("grants access to app admins", () => {
    reflector.getAllAndOverride.mockReturnValue(["ACP_MANAGER"]);

    const request = {
      user: { isAppAdmin: true },
      params: { id: "acp-1" },
    };

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it("grants ACP_MANAGER access for matching ACP role", () => {
    reflector.getAllAndOverride.mockReturnValue(["ACP_MANAGER"]);

    const request = {
      user: {
        isAppAdmin: false,
        acpRoles: [{ acpId: "acp-1", role: "ACP_MANAGER" }],
      },
      params: { id: "acp-1" },
    };

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it("grants READ_ONLY endpoints to ACP_MANAGER in the same ACP", () => {
    reflector.getAllAndOverride.mockReturnValue(["READ_ONLY"]);

    const request = {
      user: {
        isAppAdmin: false,
        acpRoles: [{ acpId: "acp-1", role: "ACP_MANAGER" }],
      },
      params: { acpId: "acp-1" },
    };

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it("rejects when role requirements are not met", () => {
    reflector.getAllAndOverride.mockReturnValue(["ACP_MANAGER"]);

    const request = {
      user: {
        isAppAdmin: false,
        acpRoles: [{ acpId: "acp-2", role: "READ_ONLY" }],
      },
      params: { id: "acp-1" },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      ForbiddenException,
    );
  });
});
