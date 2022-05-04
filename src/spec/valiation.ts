import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { UniqueId, Entity, Description, Name, HasText, ValueObject } from './core';
import { Flow, AlternateFlow, ExceptionFlow } from './flow';
import { PreCondition, PostCondition } from './prepostcondition';
import conf from '../conf';
import { ValidationError, InvalidArgumentError, BugError } from '../common';

export class ValiationId extends UniqueId {}

export class Valiation extends Entity {
  constructor(
    readonly id: ValiationId,
    readonly sourceFlows: Flow[],
    readonly factorEntryPoint: FactorEntryPoint,
    readonly pictConstraint: PictConstraint,
    readonly pictCombination: Map<Factor, FactorItem[]>,
    readonly results: ValiationResult[]
  ) {
    super(id);
    this.validate();
  }

  private validate(): void {
    if (this.results.length == 0) {
      throw new ValidationError('results は1つ以上必要です');
    }
  }

  get countOfPictPatterns(): number {
    // 組み合わせ数は、どの factor のものでも同じなので、
    // 0 番目のものを使って調べる
    const combi = this.pictCombination.get(this.factorEntryPoint.factors[0]);
    if (!combi) {
      throw new BugError();
    }
    return combi.length;
  }
}

export class ValiationResultId extends UniqueId {}

/**
 * 検証内容
 * 事後条件が成立していることを検証するのか、代替フローへの分岐を検証するのか、
 * 例外フローへの分岐を検証するのか、それぞれのインスタンスで表す
 */
export type VerificationPoint = PostCondition | AlternateFlow | ExceptionFlow;

export class ValiationResult extends Entity {
  constructor(
    readonly id: ValiationResultId,
    readonly desc: Description,
    readonly choices: FactorItemChoiceCollection,
    readonly verificationPoints: VerificationPoint[]
  ) {
    super(id);
  }
}

export class FactorId extends UniqueId {}

/**
 * 因子と水準
 */
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

/**
 * 因子の項目
 */
export class FactorItem extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

export type EntryPoint = PreCondition | Flow;

export class FactorEntryPoint {
  private _entryPoints = new Map<EntryPoint, Factor[]>();
  private _factors = new Map<Factor, EntryPoint>();

  add(entryPoint: EntryPoint, factors: Factor[]): void {
    let epFactors = this._entryPoints.get(entryPoint);
    if (!epFactors) {
      epFactors = [];
      this._entryPoints.set(entryPoint, epFactors);
    }
    for (const f of factors) {
      if (this._factors.has(f)) {
        throw new InvalidArgumentError('factorEntryPoints 内で同じ factor を使用することはできません');
      }
      this._factors.set(f, entryPoint);
      epFactors.push(f);
    }
  }

  getEntryPointByFactor(factor: Factor): EntryPoint | undefined {
    return this._factors.get(factor);
  }

  getFactorsByEntryPoint(entryPoint: EntryPoint): Factor[] | undefined {
    return this._entryPoints.get(entryPoint);
  }

  get entryPoints(): EntryPoint[] {
    return Array.from(this._entryPoints.keys());
  }

  get factors(): Factor[] {
    return Array.from(this._factors.keys());
  }
}

export class PictConstraint extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

/**
 * 因子項目の選択状態
 */
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

/**
 * 因子項目の選択の組合せ
 */
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
