import { UsersController } from "./users.controller";

describe("UsersController", () => {
  let controller: UsersController;
  let usersService: any;

  beforeEach(() => {
    usersService = {
      findAll: jest.fn().mockResolvedValue([{ id: "u-1" }]),
      findById: jest.fn().mockResolvedValue({ id: "u-1", username: "alice" }),
      create: jest.fn().mockResolvedValue({ id: "u-2", username: "bob" }),
      update: jest
        .fn()
        .mockResolvedValue({ id: "u-1", displayName: "Alice Updated" }),
      delete: jest.fn().mockResolvedValue(undefined),
      setAppAdmin: jest.fn().mockResolvedValue({ id: "u-1", isAppAdmin: true }),
    };

    controller = new UsersController(usersService);
  });

  it("lists all users", async () => {
    await expect(controller.findAll()).resolves.toEqual([{ id: "u-1" }]);
    expect(usersService.findAll).toHaveBeenCalledTimes(1);
  });

  it("gets one user by id", async () => {
    await expect(controller.findOne("u-1")).resolves.toEqual({
      id: "u-1",
      username: "alice",
    });
    expect(usersService.findById).toHaveBeenCalledWith("u-1");
  });

  it("creates users", async () => {
    const dto = { username: "bob", displayName: "Bob" } as any;

    await expect(controller.create(dto)).resolves.toEqual({
      id: "u-2",
      username: "bob",
    });
    expect(usersService.create).toHaveBeenCalledWith(dto);
  });

  it("updates users", async () => {
    const dto = { displayName: "Alice Updated" } as any;

    await expect(controller.update("u-1", dto)).resolves.toEqual({
      id: "u-1",
      displayName: "Alice Updated",
    });
    expect(usersService.update).toHaveBeenCalledWith("u-1", dto);
  });

  it("deletes users", async () => {
    await expect(controller.delete("u-1")).resolves.toBeUndefined();
    expect(usersService.delete).toHaveBeenCalledWith("u-1");
  });

  it("toggles app-admin status", async () => {
    await expect(controller.setAppAdmin("u-1", true)).resolves.toEqual({
      id: "u-1",
      isAppAdmin: true,
    });
    expect(usersService.setAppAdmin).toHaveBeenCalledWith("u-1", true);
  });
});
