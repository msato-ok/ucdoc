import fs, { chown } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { UniqueId, Entity, Description, Name, HasText, ValueObject } from './core';
import { Flow, AlternateFlow, ExceptionFlow } from './flow';
import conf from '../conf';
import { ValidationError, InvalidArgumentError } from '../common';

export class ValiationId extends UniqueId {}

export class Valiation extends Entity {
  private _dt: DecisionTable;

  constructor(
    readonly id: ValiationId,
    readonly sourceFlows: Flow[],
    readonly factors: Factor[],
    readonly pictConstraint: PictConstraint,
    readonly pictCombination: Map<Factor, FactorItem[]>,
    readonly results: ValiationResult[],
    strictValidation: boolean
  ) {
    super(id);
    this._dt = this.createDecisionTable();
    this.validate(strictValidation);
  }

  private validate(strictValidation: boolean): void {
    if (this.results.length == 0) {
      throw new ValidationError('results は1つ以上必要です');
    }
    this._dt.validate();
    if (this._dt.invalidRules.length > 0) {
      if (strictValidation) {
        const errmsg = [
          `${this._dt.invalidRules.join('\n')}`,
          '※ ruleNoはデシジョンテーブルのmdを作成して確認してください。',
          'usage: ucdoc decision <file> [otherFiles...]',
        ].join('\n');
        throw new DTValidationError(errmsg);
      }
    }
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
    return this._dt;
  }

  private createDecisionTable(): DecisionTable {
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
    for (const result of this.results) {
      const row = new DTResultRow(result.desc);
      for (let ruleNo = 0; ruleNo < dTable.counfOfRules; ruleNo++) {
        const ruleConditions = dTable.getRuleConditions(ruleNo);
        if (ruleConditions.containsAll(result.choices.items)) {
          row.add(DTResultRuleChoice.Check);
        } else {
          row.add(DTResultRuleChoice.None);
        }
      }
      dTable.addResult(row);
    }
    return dTable;
  }

  get invalidRules(): string[] {
    return this._dt.invalidRules;
  }
}

export class ValiationResultId extends UniqueId {}

export class ValiationResult extends Entity {
  constructor(
    readonly id: ValiationResultId,
    readonly desc: Description,
    readonly choices: FactorItemChoiceCollection,
    readonly altFlow: AlternateFlow | undefined,
    readonly exFlow: ExceptionFlow | undefined
  ) {
    super(id);
  }
}

export class FactorId extends UniqueId {}

export class Factor extends Entity {
  constructor(readonly id: FactorId, readonly name: Name, readonly items: FactorItem[]) {
    super(id);
  }

  existsItem(item: FactorItem): boolean {
    for (const _item of this.items) {
      if (_item.equals(item)) {
        return true;
      }
    }
    return false;
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

export class FactorItemChoice implements ValueObject {
  constructor(readonly factor: Factor, readonly item: FactorItem) {}
  equals(o: FactorItemChoice): boolean {
    if (!o.factor.equals(this.factor)) {
      return false;
    }
    if (!o.item.equals(this.item)) {
      return false;
    }
    return true;
  }
}

export class FactorItemChoiceCollection {
  private _choices: FactorItemChoice[] = [];

  get items(): FactorItemChoice[] {
    return this._choices;
  }

  copy(): FactorItemChoiceCollection {
    const o = new FactorItemChoiceCollection();
    for (const choice of this._choices) {
      o.add(choice);
    }
    return o;
  }

  addAll(factor: Factor) {
    for (const item of factor.items) {
      const choice = new FactorItemChoice(factor, item);
      this.add(choice);
    }
  }

  add(choice: FactorItemChoice) {
    if (this.contains(choice)) {
      return;
    }
    this._choices.push(choice);
  }

  remove(target: FactorItemChoice) {
    let i = 0;
    for (const choice of this._choices) {
      if (choice.equals(target)) {
        this._choices.splice(i, 1);
        return;
      }
      i++;
    }
  }

  contains(target: FactorItemChoice): boolean {
    for (const choice of this._choices) {
      if (choice.equals(target)) {
        return true;
      }
    }
    return false;
  }

  containsAll(items: FactorItemChoice[]): boolean {
    for (const item of items) {
      if (!this.contains(item)) {
        return false;
      }
    }
    return true;
  }

  arrow(arrowList: FactorItemChoiceCollection) {
    for (const choice of this._choices) {
      if (!arrowList.contains(choice)) {
        this.remove(choice);
        this.arrow(arrowList);
        return;
      }
    }
  }

  disarrow(disarrowList: FactorItemChoiceCollection) {
    for (const choice of this._choices) {
      if (disarrowList.contains(choice)) {
        this.remove(choice);
        this.disarrow(disarrowList);
        return;
      }
    }
  }
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

export class DTValidationError extends ValidationError {}

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

  add(rule: DTConditionChoice) {
    this._choices.push(rule);
  }
}

export const DTResultRuleChoice = {
  Check: 'X',
  None: 'None',
} as const;
type DTResultRuleChoice = typeof DTResultRuleChoice[keyof typeof DTResultRuleChoice];

class DTResultRow {
  private _choices: DTResultRuleChoice[] = [];

  constructor(readonly desc: Description) {}

  get counfOfRules(): number {
    return this._choices.length;
  }

  get rules(): DTResultRuleChoice[] {
    return this._choices;
  }

  add(rule: DTResultRuleChoice) {
    this._choices.push(rule);
  }
}

class DecisionTable {
  private _conditionRows: DTConditionRow[] = [];
  private _resultRows: DTResultRow[] = [];
  private _invalidRules: string[] = [];

  get counfOfRules(): number {
    // ルール数は、どの行を調べても同じなので 0 番目のものを使って調べる
    return this._conditionRows[0].counfOfRules;
  }

  get conditionRows(): DTConditionRow[] {
    return this._conditionRows;
  }

  get resultRows(): DTResultRow[] {
    return this._resultRows;
  }

  addCondition(row: DTConditionRow) {
    this._conditionRows.push(row);
  }

  addResult(row: DTResultRow) {
    this._resultRows.push(row);
  }

  getRuleConditions(ruleNo: number): FactorItemChoiceCollection {
    if (this.counfOfRules <= ruleNo) {
      throw new InvalidArgumentError('ruleNo は 0 から (counfOfRules - 1) の範囲で指定してください');
    }
    const vertMix = new FactorItemChoiceCollection();
    for (const conditionRow of this._conditionRows) {
      const yn = conditionRow.rules[ruleNo];
      if (yn == DTConditionRuleChoice.Yes) {
        vertMix.add(new FactorItemChoice(conditionRow.factor, conditionRow.item));
      } else if (yn == DTConditionRuleChoice.None) {
        // skip
      } else {
        throw new Error('not implement');
      }
    }
    return vertMix;
  }

  getRuleResults(ruleNo: number): DTResultRow[] {
    if (this.counfOfRules <= ruleNo) {
      throw new InvalidArgumentError('ruleNo は 0 から (counfOfRules - 1) の範囲で指定してください');
    }
    const vertMix: DTResultRow[] = [];
    for (const resultRow of this._resultRows) {
      const yn = resultRow.rules[ruleNo];
      if (yn == DTResultRuleChoice.Check) {
        vertMix.push(resultRow);
      } else if (yn == DTResultRuleChoice.None) {
        // skip
      } else {
        throw new Error('not implement');
      }
    }
    return vertMix;
  }

  get invalidRules(): string[] {
    return this._invalidRules;
  }

  validate(): void {
    this._invalidRules = [];
    for (let ruleNo = 0; ruleNo < this.counfOfRules; ruleNo++) {
      const ruleRows = this.getRuleResults(ruleNo);
      if (ruleRows.length == 0) {
        this._invalidRules.push(`ruleNo=${ruleNo + 1} の期待値となる結果が1つもありません`);
      }
    }
  }
}
