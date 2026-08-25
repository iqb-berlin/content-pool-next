import { ForbiddenException } from "@nestjs/common";
import { ReviewAccessGuard } from "./review-access.guard";

describe("ReviewAccessGuard", () => {
  it("delegates current ACP access and then applies the review policy", async () => {
    const request = { user: { sub: "user-1" } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
    const acpAccessGuard = {
      canActivate: jest.fn().mockImplementation(async () => {
        (request as any).acpAccessLevel = "READ_ONLY";
        return true;
      }),
    };
    const reviewPolicy = {
      assertCanParticipateRequest: jest.fn(),
    };
    const guard = new ReviewAccessGuard(
      acpAccessGuard as any,
      reviewPolicy as any,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(acpAccessGuard.canActivate).toHaveBeenCalledWith(context);
    expect(reviewPolicy.assertCanParticipateRequest).toHaveBeenCalledWith(
      request,
    );
  });

  it("does not bypass a rejected ACP access decision", async () => {
    const context = {} as any;
    const acpAccessGuard = {
      canActivate: jest
        .fn()
        .mockRejectedValue(new ForbiddenException("No ACP access")),
    };
    const reviewPolicy = { assertCanParticipateRequest: jest.fn() };
    const guard = new ReviewAccessGuard(
      acpAccessGuard as any,
      reviewPolicy as any,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(reviewPolicy.assertCanParticipateRequest).not.toHaveBeenCalled();
  });
});
