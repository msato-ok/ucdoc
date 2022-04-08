import { App } from '../spec/app';
import { SpecCommand } from './base';
import { UseCase } from '../spec/usecase';
import { Valiation, DTConditionRuleChoice, DTResultRuleChoice } from '../spec/valiation';
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
    for (let i = 0; i < dTable.countOfRules; i++) {
      head.push(`${i + 1}`);
    }
    lines.push('|' + head.join('|') + '|');
    lines.push('|-|-|-|' + '-|'.repeat(dTable.countOfRules));
    let condTitleOut = false;
    let prevFactorTitle = '';
    for (const row of dTable.conditionRows) {
      const cols = [];
      if (!condTitleOut) {
        cols.push('条件');
        condTitleOut = true;
      } else {
        cols.push(' ');
      }
      if (prevFactorTitle != row.factor.id.text) {
        cols.push(row.factor.id.text);
      } else {
        cols.push(' ');
      }
      prevFactorTitle = row.factor.id.text;
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
    let resTitleOut = false;
    for (const row of dTable.resultRows) {
      const cols = [];
      if (!resTitleOut) {
        cols.push('結果');
        resTitleOut = true;
      } else {
        cols.push(' ');
      }
      cols.push(row.desc.text);
      cols.push(' ');
      for (const rule of row.rules) {
        if (rule == DTResultRuleChoice.Check) {
          cols.push('X');
        } else if (rule == DTResultRuleChoice.None) {
          cols.push(' ');
        } else {
          throw new Error(`not implement: ${rule}`);
        }
      }
      lines.push('|' + cols.join('|') + '|');
    }
    const outPath = path.join(this.output, `${uc.id.text}-${valiation.id.text}.decision.md`);
    fs.writeFileSync(outPath, lines.join('\n') + '\n');
  }
}
