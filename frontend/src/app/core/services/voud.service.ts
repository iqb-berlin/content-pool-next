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

@Injectable({ providedIn: 'root' })
export class VoudService {
  /**
   * Processes a response definition (VOUD) to extract and structure variable page information.
   * Based on the logic from coding-box/apps/backend/src/app/utils/voud/transform.ts
   */
  prepareDefinition(definition: string): PrepareDefinitionOutput {
    let unitDefinition: any;
    try {
      unitDefinition = JSON.parse(definition);
    } catch (e) {
      // Try cleaning the content if it fails (as seen in the original script)
      const cleanedContent = definition.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      unitDefinition = JSON.parse(cleanedContent);
    }

    const pages = unitDefinition.pages || [];

    const rawVariablePagesData = pages.map((page: any, i: number) => {
      const rawAlwaysVisible = this.getDeepestElements(page, 'alwaysVisible');
      const variable_page_always_visible = this.listSimplify(rawAlwaysVisible);

      const rawRef = this.getDeepestElements(page, 'id', ['visibilityRules']);
      const variable_ref = this.listSimplify(rawRef);

      return {
        variable_page: i,
        variable_ref,
        variable_page_always_visible
      };
    });

    const unnestedVariablePages: any[] = rawVariablePagesData.flatMap(
      (pageData: any) => pageData.variable_ref.map((refItem: string) => ({
        variable_page: pageData.variable_page,
        variable_ref_item: refItem,
        grouping_key_always_visible: JSON.stringify(pageData.variable_page_always_visible.slice().sort()),
        original_always_visible: pageData.variable_page_always_visible
      }))
    );

    const grouped = new Map<string, any[]>();
    unnestedVariablePages.forEach(item => {
      const groupList = grouped.get(item.grouping_key_always_visible);
      if (groupList) {
        groupList.push(item);
      } else {
        grouped.set(item.grouping_key_always_visible, [item]);
      }
    });

    const mutatedVariablePages: TransformedVariablePage[] = [];
    grouped.forEach(groupItems => {
      if (groupItems.length === 0) return;

      const minVariablePage = Math.min(...groupItems.map(item => item.variable_page));

      groupItems.forEach(item => {
        mutatedVariablePages.push({
          variable_page_always_visible: item.original_always_visible,
          variable_page: item.variable_page - minVariablePage,
          variable_ref: item.variable_ref_item
        });
      });
    });

    return {
      unitDefinition,
      variablePages: mutatedVariablePages
    };
  }

  /**
   * Finds the start page for a specific variable.
   * Returns the 0-based index or undefined if not found.
   */
  getStartPage(definition: string, variableId: string): number | undefined {
    if (!variableId) return undefined;
    try {
      const { variablePages } = this.prepareDefinition(definition);
      const match = variablePages.find(p => p.variable_ref === variableId);
      return match ? match.variable_page : undefined;
    } catch (e) {
      console.error('Error calculating start page from VOUD:', e);
      return undefined;
    }
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
      .filter(item => typeof item === 'string' || typeof item === 'number')
      .map(String);
  }
}
