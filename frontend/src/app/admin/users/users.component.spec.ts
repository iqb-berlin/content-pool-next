import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { UsersComponent } from './users.component';

describe('UsersComponent', () => {
  let api: {
    getUsers: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    setAppAdmin: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      getUsers: vi.fn().mockReturnValue(of([])),
      createUser: vi.fn().mockReturnValue(of({})),
      setAppAdmin: vi.fn().mockReturnValue(of({})),
      deleteUser: vi.fn().mockReturnValue(of(undefined)),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads users on init', () => {
    api.getUsers.mockReturnValue(of([{ id: 'u1', username: 'alice', isAppAdmin: false }]));

    const component = new UsersComponent(api as any);
    component.ngOnInit();

    expect(api.getUsers).toHaveBeenCalledTimes(1);
    expect(component.users).toHaveLength(1);
  });

  it('creates user and resets form state', () => {
    const component = new UsersComponent(api as any);
    component.showCreate = true;
    const payload = { username: 'new-user', password: 'Secret123!', displayName: 'Neue Person' };
    component.newUser = { ...payload };

    component.createUser();

    expect(api.createUser).toHaveBeenCalledWith(payload);
    expect(component.showCreate).toBe(false);
    expect(component.newUser).toEqual({ username: '', password: '', displayName: '' });
  });

  it('blocks create when required fields are missing', () => {
    const component = new UsersComponent(api as any);
    component.newUser = { username: ' ', password: '', displayName: '' };

    component.createUser();

    expect(api.createUser).not.toHaveBeenCalled();
    expect(component.error).toContain('erforderlich');
  });

  it('deletes user when confirmed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const component = new UsersComponent(api as any);

    component.deleteUser({ id: 'u1', username: 'alice', isAppAdmin: false });

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.deleteUser).toHaveBeenCalledWith('u1');
  });

  it('surfaces load error', () => {
    api.getUsers.mockReturnValue(throwError(() => ({ error: { message: 'Fehler' } })));

    const component = new UsersComponent(api as any);
    component.load();

    expect(component.error).toBe('Fehler');
  });
});
