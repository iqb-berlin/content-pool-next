import { ForbiddenException } from '@nestjs/common';
import { ItemResponseStateService } from './item-response-state.service';

describe('ItemResponseStateService', () => {
  let service: ItemResponseStateService;
  let stateRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(() => {
    stateRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => ({ id: 'state-1', ...value })),
      delete: jest.fn(),
      find: jest.fn(),
    };

    service = new ItemResponseStateService(stateRepository as any);
  });

  it('rejects saving state for non-managers', async () => {
    await expect(
      service.saveResponseState('acp-1', 'item-1', 'unit-1', { a: 1 }, false),
    ).rejects.toThrow(ForbiddenException);
  });

  it('updates existing state records', async () => {
    stateRepository.findOne.mockResolvedValue({
      id: 'state-1',
      acpId: 'acp-1',
      itemId: 'item-1',
      unitId: 'unit-1',
      responseData: { old: true },
    });

    const result = await service.saveResponseState('acp-1', 'item-1', 'unit-1', { answer: 1 }, true);

    expect(stateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'state-1',
        unitId: 'unit-1',
        responseData: { answer: 1 },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'state-1' }));
    expect(stateRepository.findOne).toHaveBeenCalledWith({
      where: { acpId: 'acp-1', itemId: 'item-1', unitId: 'unit-1' },
    });
  });

  it('creates new state records when none exist', async () => {
    stateRepository.findOne.mockResolvedValue(null);

    await service.saveResponseState('acp-1', 'item-2', 'unit-2', { answer: 2 }, true);

    expect(stateRepository.create).toHaveBeenCalledWith({
      acpId: 'acp-1',
      itemId: 'item-2',
      unitId: 'unit-2',
      responseData: { answer: 2 },
    });
    expect(stateRepository.save).toHaveBeenCalled();
  });

  it('returns direct response state when available', async () => {
    stateRepository.findOne.mockResolvedValueOnce({ id: 'state-direct' });

    const result = await service.getResponseStateWithFallback(
      'acp-1',
      'item-2',
      'unit-1',
      [
        { itemId: 'item-1', unitId: 'unit-1' },
        { itemId: 'item-2', unitId: 'unit-1' },
      ],
    );

    expect(result).toEqual({ state: { id: 'state-direct' }, isFallback: false });
  });

  it('returns fallback state from previous item in same unit', async () => {
    stateRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'state-prev', itemId: 'item-1' });

    const result = await service.getResponseStateWithFallback(
      'acp-1',
      'item-2',
      'unit-1',
      [
        { itemId: 'item-1', unitId: 'unit-1' },
        { itemId: 'item-2', unitId: 'unit-1' },
      ],
    );

    expect(result).toEqual({
      state: { id: 'state-prev', itemId: 'item-1' },
      isFallback: true,
      fallbackItemId: 'item-1',
    });
  });

  it('returns no fallback when item is first in sequence or no previous state exists', async () => {
    stateRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getResponseStateWithFallback(
        'acp-1',
        'item-1',
        'unit-1',
        [
          { itemId: 'item-1', unitId: 'unit-1' },
          { itemId: 'item-2', unitId: 'unit-1' },
        ],
      ),
    ).resolves.toEqual({ state: null, isFallback: false });

    await expect(
      service.getResponseStateWithFallback(
        'acp-1',
        'item-2',
        'unit-1',
        [
          { itemId: 'item-1', unitId: 'unit-2' },
          { itemId: 'item-2', unitId: 'unit-1' },
        ],
      ),
    ).resolves.toEqual({ state: null, isFallback: false });
  });

  it('gets, deletes and lists states with manager checks', async () => {
    stateRepository.findOne.mockResolvedValue({ id: 'state-1' });
    await expect(service.getResponseState('acp-1', 'item-1', 'unit-1')).resolves.toEqual({ id: 'state-1' });

    await expect(service.deleteResponseState('acp-1', 'item-1', 'unit-1', false)).rejects.toThrow(ForbiddenException);

    stateRepository.delete.mockResolvedValue({ affected: 1 });
    await expect(service.deleteResponseState('acp-1', 'item-1', 'unit-1', true)).resolves.toEqual({ success: true });

    stateRepository.delete.mockResolvedValue({ affected: 0 });
    await expect(service.deleteResponseState('acp-1', 'item-2', 'unit-2', true)).resolves.toEqual({ success: false });

    await expect(service.getAllStatesForAcp('acp-1', false)).rejects.toThrow(ForbiddenException);

    stateRepository.find.mockResolvedValue([{ id: 'state-1' }]);
    await expect(service.getAllStatesForAcp('acp-1', true)).resolves.toEqual([{ id: 'state-1' }]);
    expect(stateRepository.find).toHaveBeenCalledWith({
      where: { acpId: 'acp-1' },
      order: { unitId: 'ASC', itemId: 'ASC' },
    });
  });

  it('returns false for manager check placeholder', async () => {
    await expect(service.checkIsManager('acp-1', 'user-1')).resolves.toBe(false);
  });
});
