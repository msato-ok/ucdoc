import * as spec from '../spec';
import * as base from './base';
import fs from 'fs';
import path from 'path';

export class DecisionCommand implements base.SpecCommand {
  constructor(private output: string) {}

  public execute(spc: spec.App): void {
    spc.usecases.forEach(uc => {
      this.writeValiations(spc, uc);
    });
  }

  private writeValiations(app: spec.App, uc: spec.UseCase) {
    for (const valiation of uc.valiations) {
      this.writeDecisionTable(valiation, uc);
    }
  }

  private writeDecisionTable(valiation: spec.Valiation, uc: spec.UseCase) {
    const lines = [];
    const combiCount = valiation.combinationItemCount;
    const head = [' ', ' ', ' '];
    for (let i = 0; i < combiCount; i++) {
      head.push(`${i + 1}`);
    }
    lines.push('|' + head.join('|') + '|');
    lines.push('|-|-|-|' + '-|'.repeat(combiCount));
    let condTitleOut = false;
    for (const factor of valiation.factors) {
      const items = valiation.pictCombination.get(factor);
      if (!items) {
        throw new Error('ここでエラーになるのはバグ');
      }
      let titleOut = false;
      const itemUniq = new Set<spec.FactorItem>();
      for (const item of items) {
        itemUniq.add(item);
      }
      const sortedItems: spec.FactorItem[] = [];
      for (const item of factor.items) {
        if (itemUniq.has(item)) {
          sortedItems.push(item);
        }
      }
      for (const item of sortedItems) {
        const cols = [];
        if (!condTitleOut) {
          cols.push('条件');
          condTitleOut = true;
        } else {
          cols.push(' ');
        }
        if (!titleOut) {
          cols.push(factor.id.toString);
        } else {
          cols.push(' ');
        }
        cols.push(item.text);
        for (const itemYN of items) {
          if (itemYN == item) {
            cols.push('Y');
          } else {
            cols.push(' ');
          }
        }
        lines.push('|' + cols.join('|') + '|');
        titleOut = true;
      }
    }
    const outPath = path.join(this.output, `${uc.id.toString}-${valiation.id.toString}.decision.md`);
    fs.writeFileSync(outPath, lines.join('\n') + '\n');
  }
}
