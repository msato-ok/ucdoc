import { App } from '../spec/app';
import { SpecCommand } from './base';
import { UseCase } from '../spec/usecase';
import { Valiation } from '../spec/valiation';
import fs from 'fs';
import path from 'path';

export class PictCommand implements SpecCommand {
  constructor(private output: string) {}

  public execute(spc: App): void {
    spc.usecases.forEach(uc => {
      this.writeValiations(spc, uc);
    });
  }

  private writeValiations(app: App, uc: UseCase) {
    for (const valiation of uc.valiations) {
      this.writePict(valiation, uc);
    }
  }

  private writePict(valiation: Valiation, uc: UseCase) {
    const lines = [];
    const th = valiation.factors.map(x => '-'.repeat(x.id.text.length));
    const fids = valiation.factors.map(x => x.id.text);
    lines.push('|' + fids.join('|') + '|');
    lines.push('|' + th.join('|') + '|');
    const itemCount = valiation.countOfPictPatterns;
    for (let itemNo = 0; itemNo < itemCount; itemNo++) {
      const iids = [];
      for (const factor of valiation.factors) {
        const items = valiation.pictCombination.get(factor);
        if (!items) {
          throw new Error('ここでエラーになるのはバグ');
        }
        iids.push(items[itemNo].text);
      }
      lines.push('|' + iids.join('|') + '|');
    }
    const pictOutPath = path.join(this.output, `${uc.id.text}-${valiation.id.text}.pict.md`);
    fs.writeFileSync(pictOutPath, lines.join('\n') + '\n');
  }
}
