import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemResponseState } from '../database/entities';

@Injectable()
export class ItemResponseStateService {
  constructor(
    @InjectRepository(ItemResponseState)
    private readonly stateRepository: Repository<ItemResponseState>,
  ) { }

  /**
   * Save or update response state for an item.
   * Only ACP managers can save states.
   */
  async saveResponseState(
    acpId: string,
    itemId: string,
    unitId: string,
    responseData: Record<string, any>,
    userIsManager: boolean,
  ): Promise<ItemResponseState> {
    if (!userIsManager) {
      throw new ForbiddenException('Only ACP managers can save response states');
    }

    // Check if state already exists
    let state = await this.stateRepository.findOne({
      where: { acpId, itemId, unitId },
    });

    if (state) {
      // Update existing
      state.responseData = responseData;
    } else {
      // Create new
      state = this.stateRepository.create({
        acpId,
        itemId,
        unitId,
        responseData,
      });
    }

    return this.stateRepository.save(state);
  }

  /**
   * Get response state for a specific item.
   */
  async getResponseState(
    acpId: string,
    itemId: string,
    unitId: string,
  ): Promise<ItemResponseState | null> {
    return this.stateRepository.findOne({
      where: { acpId, itemId, unitId },
    });
  }

  /**
   * Get response state for a specific item, or find fallback from previous items in same unit.
   * Returns the state with metadata about whether it's a fallback.
   */
  async getResponseStateWithFallback(
    acpId: string,
    itemId: string,
    unitId: string,
    itemList: { itemId: string; unitId: string }[],
  ): Promise<{ state: ItemResponseState | null; isFallback: boolean; fallbackItemId?: string }> {
    // First try to get direct state
    const directState = await this.getResponseState(acpId, itemId, unitId);
    if (directState) {
      return { state: directState, isFallback: false };
    }

    // Find position of current item in the list
    const currentIndex = itemList.findIndex(i => i.itemId === itemId && i.unitId === unitId);
    if (currentIndex <= 0) {
      return { state: null, isFallback: false };
    }

    // Iterate backwards to find previous item in same unit with state
    for (let i = currentIndex - 1; i >= 0; i--) {
      const prevItem = itemList[i];
      if (prevItem.unitId === unitId) {
        const prevState = await this.getResponseState(acpId, prevItem.itemId, prevItem.unitId);
        if (prevState) {
          return {
            state: prevState,
            isFallback: true,
            fallbackItemId: prevItem.itemId,
          };
        }
      }
    }

    return { state: null, isFallback: false };
  }

  /**
   * Delete response state for an item.
   * Only ACP managers can delete states.
   */
  async deleteResponseState(
    acpId: string,
    itemId: string,
    unitId: string,
    userIsManager: boolean,
  ): Promise<{ success: boolean }> {
    if (!userIsManager) {
      throw new ForbiddenException('Only ACP managers can delete response states');
    }

    const result = await this.stateRepository.delete({ acpId, itemId, unitId });
    return { success: result.affected !== undefined && result.affected !== null && result.affected > 0 };
  }

  /**
   * Get all response states for an ACP.
   * Only ACP managers can view all states.
   */
  async getAllStatesForAcp(
    acpId: string,
    userIsManager: boolean,
  ): Promise<ItemResponseState[]> {
    if (!userIsManager) {
      throw new ForbiddenException('Only ACP managers can view all response states');
    }

    return this.stateRepository.find({
      where: { acpId },
      order: { unitId: 'ASC', itemId: 'ASC' },
    });
  }

  /**
   * Check if user is ACP manager (placeholder - actual check happens in controller).
   */
  async checkIsManager(acpId: string, userId: string): Promise<boolean> {
    // This is a placeholder - actual role checking should be done via AcpUserRole entity
    // The controller will handle the actual authorization check
    return false;
  }
}
