import * as spec from '../spec';
import * as base from './base';
import fs from 'fs';
import path from 'path';

export class PictCommand implements base.SpecCommand {
  constructor(private output: string) {}

  public execute(spc: spec.App): void {
    spc.usecases.forEach(uc => {
      this.writeValiations(spc, uc);
    });
  }

  private writeValiations(app: spec.App, uc: spec.UseCase) {
    for (const valiation of uc.valiations) {
      this.writePict(valiation, uc);
    }
  }

  private writePict(valiation: spec.Valiation, uc: spec.UseCase) {
    const lines = [];
    const th = valiation.factors.map(x => '-'.repeat(x.id.toString.length));
    const fids = valiation.factors.map(x => x.id.toString);
    lines.push('|' + fids.join('|') + '|');
    lines.push('|' + th.join('|') + '|');
    // combiCount について
    // 組み合わせ数（縦（行）のループ数）は、どの factor のものでも同じなので、
    // 0 番目のものを使って調べる
    const combi = valiation.pictCombination.get(valiation.factors[0]);
    if (!combi) {
      throw new Error('ここでエラーになるのはバグ');
    }
    const combiCount = combi.length;
    for (let itemNo = 0; itemNo < combiCount; itemNo++) {
      const iids = [];
      for (const factor of valiation.factors) {
        const combi = valiation.pictCombination.get(factor);
        if (!combi) {
          throw new Error('ここでエラーになるのはバグ');
        }
        iids.push(combi[itemNo].text);
      }
      lines.push('|' + iids.join('|') + '|');
    }
    const pictOutPath = path.join(this.output, `${uc.id.toString}-${valiation.id.toString}.pict.md`);
    fs.writeFileSync(pictOutPath, lines.join('\n') + '\n');
  }
}
