import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { UniqueId, Entity, Name, HasText, ValueObject } from './core';
import { Flow, AlternateFlow, ExceptionFlow } from './flow';
import conf from '../conf';

export class ValiationId extends UniqueId {}

export class Valiation extends Entity {
  constructor(
    readonly id: ValiationId,
    readonly sourceFlows: Flow[],
    readonly factors: Factor[],
    readonly pictConstraint: PictConstraint,
    readonly pictCombination: Map<Factor, FactorItem[]>,
    readonly results: ValiationResult[]
  ) {
    super(id);
  }

  get countOfPictPatterns(): number {
    // 組み合わせ数は、どの factor のものでも同じなので、
    // 0 番目のものを使って調べる
    const combi = this.pictCombination.get(this.factors[0]);
    if (!combi) {
      throw new Error('ここでエラーになるのはバグ');
    }
    return combi.length;
  }

  get decisionTable(): DecisionTable {
    const dTable = new DecisionTable();
    const factors = Array.from(this.pictCombination.keys());
    for (const factor of factors) {
      const choiceItems = this.pictCombination.get(factor);
      if (!choiceItems) {
        throw new Error('ここでエラーになるのはバグ');
      }
      const uniqItems = new Set<FactorItem>();
      for (const item of choiceItems) {
        uniqItems.add(item);
      }
      const sortedChoiceItems: FactorItem[] = [];
      for (const item of factor.items) {
        if (uniqItems.has(item)) {
          sortedChoiceItems.push(item);
        }
      }
      for (const sortedChoiceItem of sortedChoiceItems) {
        const row = new DTConditionRow(factor, sortedChoiceItem);
        for (const choiceItem of choiceItems) {
          if (choiceItem == sortedChoiceItem) {
            row.add(DTConditionRuleChoice.Yes);
          } else {
            row.add(DTConditionRuleChoice.None);
          }
        }
        dTable.addCondition(row);
      }
    }
    return dTable;
  }
}

export class ValiationResultId extends UniqueId {}

const ResultType = {
  Match: 'Match',
  All: 'All',
  Otherwise: 'Otherwise',
} as const;
export type ResultType = typeof ResultType[keyof typeof ResultType];

export class ValiationResult extends Entity {
  constructor(
    readonly id: ValiationResultId,
    readonly resultType: ResultType,
    readonly matchPatterns: FactorPattern[],
    readonly moveFlow: Flow | AlternateFlow | ExceptionFlow
  ) {
    super(id);
  }
}

export class FactorId extends UniqueId {}

export class Factor extends Entity {
  constructor(readonly id: FactorId, readonly name: Name, readonly items: FactorItem[]) {
    super(id);
  }
}

export class FactorItem extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

export class PictConstraint extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

export class FactorPattern implements ValueObject {
  constructor(readonly factor: Factor, readonly matchItems: FactorItem[]) {}
}

export class PictCombiFactory {
  private static _seq = 0;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(factors: Factor[]): Map<Factor, FactorItem[]> {
    this._seq++;
    // pict には、文字列のエスケープルールがわからないので、
    // 置換文字に変換してパラメータファイルを作成する
    const inpRows = [];
    let factorNo = 0;
    for (const factor of factors) {
      const itemIds = [...factor.items].map((_, i) => `i${i}`); //=> [ 0, 1, 2, 3, 4 ]
      inpRows.push(`f${factorNo}: ${itemIds.join(', ')}\n`);
      factorNo++;
    }
    const pictInText = inpRows.join('');
    const pictInPath = path.join(conf.tmpDir, `${this._seq}.pict.in`);
    fs.writeFileSync(pictInPath, pictInText);
    // pict を実行して stdout に出力された結果を yml の定義名に変換する
    // 例） 先頭行が factorId で 2行目以降が item
    // f0	f1
    // i1	i0
    // i1	i2
    const pictOutText = execSync(`pict ${pictInPath}`);
    const outRows = pictOutText.toString().split(/\n/);
    let head = true;
    const pictCombi = new Map<Factor, FactorItem[]>();
    for (const row of outRows) {
      if (row == '') {
        continue;
      }
      const cols = row.split(/\t/);
      if (cols.length != factors.length) {
        throw new Error(`pict の出力が想定されたものと違う(カラム数): ${cols.length} != ${factors.length}`);
      }
      if (head) {
        head = false;
        factorNo = 0;
        for (const col of cols) {
          if (col != `f${factorNo}`) {
            throw new Error(`pict の出力が想定されたものと違う: ${col}`);
          }
          factorNo++;
        }
        continue;
      }
      factorNo = 0;
      for (const col of cols) {
        const factor = factors[factorNo];
        if (col.indexOf('i') == 0) {
          const itemNo = Number(col.substring(1));
          const item = factor.items[itemNo];
          let items = pictCombi.get(factor);
          if (!items) {
            items = [];
            pictCombi.set(factor, items);
          }
          items.push(item);
        } else {
          throw new Error('not implement');
        }
        factorNo++;
      }
    }
    return pictCombi;
  }
}

export const DTConditionRuleChoice = {
  Yes: 'Y',
  No: 'N',
  None: 'None',
} as const;
type DTConditionChoice = typeof DTConditionRuleChoice[keyof typeof DTConditionRuleChoice];

class DTConditionRow {
  private _choices: DTConditionChoice[] = [];

  constructor(readonly factor: Factor, readonly item: FactorItem) {}

  get counfOfRules(): number {
    return this._choices.length;
  }

  get rules(): DTConditionChoice[] {
    return this._choices;
  }

  add(col: DTConditionChoice) {
    this._choices.push(col);
  }
}

class DecisionTable {
  private _rows: DTConditionRow[] = [];

  get counfOfRules(): number {
    // ルール数は、どの行を調べても同じなので 0 番目のものを使って調べる
    return this._rows[0].counfOfRules;
  }

  get conditionRows(): DTConditionRow[] {
    return this._rows;
  }

  addCondition(row: DTConditionRow) {
    this._rows.push(row);
  }

  addResult(row: DTConditionRow) {
    this._rows.push(row);
  }
}
