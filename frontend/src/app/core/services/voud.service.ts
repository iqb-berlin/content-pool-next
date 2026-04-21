import { Injectable } from '@angular/core';

export interface TransformedVariablePage {
  variable_page_always_visible: string[];
  variable_page: number;
  variable_ref: string;
}

export interface PrepareDefinitionOutput {
  unitDefinition: any;
  variablePages: TransformedVariablePage[];
}

interface IdentifierBearingNode {
  id?: unknown;
  alias?: unknown;
}

@Injectable({ providedIn: 'root' })
export class VoudService {
  private readonly conditionalVisibilityDefaults = new Map<string, unknown>([
    ['visibilityRules', []],
    ['visibilityDelay', 0],
    ['animatedVisibility', false],
    ['enableReHide', false],
    ['logicalConnectiveOfRules', 'disjunction'],
    ['activeAfterID', ''],
    ['activeAfterIdDelay', 0],
    ['activeAfter', ''],
  ]);

  private parseDefinition(definition: string): any {
    try {
      return JSON.parse(definition);
    } catch (_e) {
      // Try cleaning the content if it fails (as seen in the original script)
      const cleanedContent = definition.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      return JSON.parse(cleanedContent);
    }
  }

  /**
   * Processes a response definition (VOUD) to extract and structure variable page information.
   * Based on the logic from coding-box/apps/backend/src/app/utils/voud/transform.ts
   */
  prepareDefinition(definition: string): PrepareDefinitionOutput {
    const unitDefinition = this.parseDefinition(definition);
    const pages = unitDefinition.pages || [];

    const rawVariablePagesData = pages.map((page: any, i: number) => {
      const rawAlwaysVisible = this.getDeepestElements(page, 'alwaysVisible');
      const variable_page_always_visible = this.listSimplify(rawAlwaysVisible);

      const rawRef = this.getDeepestElements(page, 'id', ['visibilityRules']);
      const variable_ref = this.listSimplify(rawRef);

      return {
        variable_page: i,
        variable_ref,
        variable_page_always_visible,
      };
    });

    const unnestedVariablePages: any[] = rawVariablePagesData.flatMap((pageData: any) =>
      pageData.variable_ref.map((refItem: string) => ({
        variable_page: pageData.variable_page,
        variable_ref_item: refItem,
        grouping_key_always_visible: JSON.stringify(
          pageData.variable_page_always_visible.slice().sort(),
        ),
        original_always_visible: pageData.variable_page_always_visible,
      })),
    );

    const grouped = new Map<string, any[]>();
    unnestedVariablePages.forEach((item) => {
      const groupList = grouped.get(item.grouping_key_always_visible);
      if (groupList) {
        groupList.push(item);
      } else {
        grouped.set(item.grouping_key_always_visible, [item]);
      }
    });

    const mutatedVariablePages: TransformedVariablePage[] = [];
    grouped.forEach((groupItems) => {
      if (groupItems.length === 0) return;

      const minVariablePage = Math.min(...groupItems.map((item) => item.variable_page));

      groupItems.forEach((item) => {
        mutatedVariablePages.push({
          variable_page_always_visible: item.original_always_visible,
          variable_page: item.variable_page - minVariablePage,
          variable_ref: item.variable_ref_item,
        });
      });
    });

    return {
      unitDefinition,
      variablePages: mutatedVariablePages,
    };
  }

  /**
   * Finds the start page for a specific variable.
   * Returns the 0-based index or undefined if not found.
   */
  getStartPage(definition: string, variableId: string): number | undefined {
    const target = String(variableId || '').trim();
    if (!target) return undefined;
    try {
      const unitDefinition = this.parseDefinition(definition);
      const pages = Array.isArray(unitDefinition?.pages) ? unitDefinition.pages : [];
      const targetLower = target.toLowerCase();

      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const pageRefs = this.getPageVariableRefs(pages[pageIndex]);
        if (pageRefs.some((ref) => ref === target || ref.toLowerCase() === targetLower)) {
          return pageIndex;
        }
      }
      return undefined;
    } catch (e) {
      console.error('Error calculating start page from VOUD:', e);
      return undefined;
    }
  }

  /**
   * Resolves equivalent identifiers for a target variable by inspecting the VOUD.
   * This helps consumers support players that expose either `id` or `alias` in the DOM.
   */
  getFocusIdentifiers(definition: string, variableId: string): string[] {
    const target = String(variableId || '').trim();
    if (!target) return [];

    try {
      const unitDefinition = this.parseDefinition(definition);
      const identifiers = new Set<string>([target]);
      const normalizedTarget = target.toLowerCase();

      this.visitNodes(unitDefinition, (node) => {
        const nodeIdentifiers = this.getNodeIdentifiers(node);
        if (!nodeIdentifiers.length) return;

        if (nodeIdentifiers.some((identifier) => identifier.toLowerCase() === normalizedTarget)) {
          nodeIdentifiers.forEach((identifier) => identifiers.add(identifier));
        }
      });

      return Array.from(identifiers);
    } catch (e) {
      console.error('Error resolving focus identifiers from VOUD:', e);
      return [target];
    }
  }

  /**
   * Returns a preview-safe VOUD definition without conditional visibility rules.
   * This is used by the Item Explorer when conditional rendering should be ignored.
   */
  stripConditionalVisibility(definition: string): string {
    try {
      const unitDefinition = this.parseDefinition(definition);
      const sanitizedDefinition = this.removeConditionalVisibility(unitDefinition);
      return JSON.stringify(sanitizedDefinition);
    } catch (e) {
      console.error('Error stripping conditional visibility from VOUD:', e);
      return definition;
    }
  }

  private getPageVariableRefs(page: any): string[] {
    const aliases = this.listSimplify(this.getDeepestElements(page, 'alias', ['visibilityRules']));
    const ids = this.listSimplify(this.getDeepestElements(page, 'id', ['visibilityRules']));
    return Array.from(
      new Set(
        [...aliases, ...ids]
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private getNodeIdentifiers(node: IdentifierBearingNode): string[] {
    return Array.from(
      new Set(
        [node?.id, node?.alias]
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private visitNodes(
    node: unknown,
    visitor: (node: IdentifierBearingNode) => void,
    noParent: string[] = ['visibilityRules'],
  ): void {
    if (typeof node !== 'object' || node === null) {
      return;
    }

    if (!Array.isArray(node)) {
      visitor(node as IdentifierBearingNode);
    }

    if (Array.isArray(node)) {
      node.forEach((item) => this.visitNodes(item, visitor, noParent));
      return;
    }

    Object.entries(node).forEach(([key, value]) => {
      if (!noParent.includes(key)) {
        this.visitNodes(value, visitor, noParent);
      }
    });
  }

  private removeConditionalVisibility(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map((item) => this.removeConditionalVisibility(item));
    }

    if (typeof node !== 'object' || node === null) {
      return node;
    }

    return Object.entries(node).reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (this.conditionalVisibilityDefaults.has(key)) {
        acc[key] = this.cloneConditionalVisibilityDefault(key);
      } else {
        acc[key] = this.removeConditionalVisibility(value);
      }
      return acc;
    }, {});
  }

  private cloneConditionalVisibilityDefault(key: string): unknown {
    const value = this.conditionalVisibilityDefaults.get(key);
    if (Array.isArray(value)) {
      return [...value];
    }
    return value;
  }

  private getDeepestElements(x: any, label: string, noParent: string[] = []): any[] {
    if (typeof x !== 'object' || x === null) {
      return [];
    }

    let collectedElements: any[] = [];

    if (Object.prototype.hasOwnProperty.call(x, label)) {
      collectedElements.push(x[label]);
    }

    if (Array.isArray(x)) {
      for (const item of x) {
        const deeperElements = this.getDeepestElements(item, label, noParent);
        collectedElements = collectedElements.concat(deeperElements);
      }
    } else {
      for (const nodeName in x) {
        if (Object.prototype.hasOwnProperty.call(x, nodeName)) {
          if (!noParent.includes(nodeName)) {
            const node = x[nodeName];
            const deeperElements = this.getDeepestElements(node, label, noParent);
            collectedElements = collectedElements.concat(deeperElements);
          }
        }
      }
    }
    return collectedElements;
  }

  private listSimplify(arr: any[]): string[] {
    return arr
      .flat(Infinity)
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .map(String);
  }
}
