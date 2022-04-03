import { App } from '../spec/app';
import { SpecCommand } from './base';
import { UseCase } from '../spec/usecase';
import { Valiation, DTConditionRuleChoice } from '../spec/valiation';
import fs from 'fs';
import path from 'path';

export class DecisionCommand implements SpecCommand {
  constructor(private output: string) {}

  public execute(spc: App): void {
    spc.usecases.forEach(uc => {
      this.writeValiations(spc, uc);
    });
  }

  private writeValiations(app: App, uc: UseCase) {
    for (const valiation of uc.valiations) {
      this.writeDecisionTable(valiation, uc);
    }
  }

  private writeDecisionTable(valiation: Valiation, uc: UseCase) {
    const lines = [];
    const dTable = valiation.decisionTable;
    const head = [' ', ' ', ' '];
    for (let i = 0; i < dTable.counfOfRules; i++) {
      head.push(`${i + 1}`);
    }
    lines.push('|' + head.join('|') + '|');
    lines.push('|-|-|-|' + '-|'.repeat(dTable.counfOfRules));
    let condTitleOut = false;
    let prevFactorTitle = undefined;
    for (const row of dTable.conditionRows) {
      const cols = [];
      if (!condTitleOut) {
        cols.push('条件');
        condTitleOut = true;
      } else {
        cols.push(' ');
      }
      if (prevFactorTitle != row.factor.id.toString) {
        cols.push(row.factor.id.toString);
      } else {
        cols.push(' ');
      }
      prevFactorTitle = row.factor.id.toString;
      cols.push(row.item.text);
      for (const rule of row.rules) {
        if (rule == DTConditionRuleChoice.Yes) {
          cols.push('Y');
        } else if (rule == DTConditionRuleChoice.No) {
          cols.push('N');
        } else if (rule == DTConditionRuleChoice.None) {
          cols.push(' ');
        } else {
          throw new Error(`not implement: ${rule}`);
        }
      }
      lines.push('|' + cols.join('|') + '|');
    }
    const outPath = path.join(this.output, `${uc.id.toString}-${valiation.id.toString}.decision.md`);
    fs.writeFileSync(outPath, lines.join('\n') + '\n');
  }
}
