import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Acp } from '../database/entities';

export interface ItemData {
  itemId: string;
  unitId: string;
  unitName: string;
  name: string;
  sourceVariable?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
  ) {}

  /**
   * Extract all items from ACP-Index.
   */
  async getItems(acpId: string): Promise<ItemData[]> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return [];

    const index = acp.acpIndex as any;
    const items: ItemData[] = [];

    for (const unit of index.units || []) {
      for (const item of unit.items || []) {
        const itemId = item.useUnitAliasAsPrefix !== false
          ? `${unit.id}_${item.id}`
          : item.id;

        items.push({
          itemId,
          unitId: unit.id,
          unitName: unit.name,
          name: item.name || item.id,
          sourceVariable: item.sourceVariable,
          metadata: item.metadata,
        });
      }
    }

    return items;
  }

  /**
   * Get a single item by ID.
   */
  async getItem(acpId: string, itemId: string): Promise<ItemData | null> {
    const items = await this.getItems(acpId);
    return items.find(i => i.itemId === itemId) || null;
  }

  /**
   * Get items filtered and sorted.
   */
  async getFilteredItems(
    acpId: string,
    filter?: string,
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Promise<ItemData[]> {
    let items = await this.getItems(acpId);

    if (filter) {
      const term = filter.toLowerCase();
      items = items.filter(i =>
        i.itemId.toLowerCase().includes(term) ||
        i.name.toLowerCase().includes(term) ||
        i.unitId.toLowerCase().includes(term),
      );
    }

    if (sortBy) {
      items.sort((a: any, b: any) => {
        const aVal = (a[sortBy] || '').toString().toLowerCase();
        const bVal = (b[sortBy] || '').toString().toLowerCase();
        const cmp = aVal.localeCompare(bVal);
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return items;
  }
}
