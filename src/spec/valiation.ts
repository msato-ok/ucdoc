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
    readonly pictCombination: Map<Factor, FactorLevel[]>,
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
    readonly choices: FactorLevelChoiceCollection,
    readonly verificationPoints: VerificationPoint[]
  ) {
    super(id);
  }
}

export class FactorId extends UniqueId {}

/**
 * 因子と因子水準
 */
export class Factor extends Entity {
  constructor(readonly id: FactorId, readonly name: Name, readonly levels: FactorLevel[]) {
    super(id);
  }

  existsItem(item: FactorLevel): boolean {
    for (const _item of this.levels) {
      if (_item.equals(item)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * 因子水準の1つの値
 */
export class FactorLevel extends HasText implements ValueObject {
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
 * 因子水準の選択状態
 */
export class FactorLevelChoice implements ValueObject {
  constructor(readonly factor: Factor, readonly level: FactorLevel) {}

  equals(o: FactorLevelChoice): boolean {
    if (!o.factor.equals(this.factor)) {
      return false;
    }
    if (!o.level.equals(this.level)) {
      return false;
    }
    return true;
  }
}

/**
 * 因子水準の選択の組合せ
 */
export class FactorLevelChoiceCollection {
  private _choices: FactorLevelChoice[] = [];

  get items(): FactorLevelChoice[] {
    return this._choices;
  }

  copy(): FactorLevelChoiceCollection {
    const o = new FactorLevelChoiceCollection();
    for (const choice of this._choices) {
      o.add(choice);
    }
    return o;
  }

  addAll(factor: Factor) {
    for (const level of factor.levels) {
      const choice = new FactorLevelChoice(factor, level);
      this.add(choice);
    }
  }

  add(choice: FactorLevelChoice) {
    if (this.contains(choice)) {
      return;
    }
    this._choices.push(choice);
  }

  remove(target: FactorLevelChoice) {
    let i = 0;
    for (const choice of this._choices) {
      if (choice.equals(target)) {
        this._choices.splice(i, 1);
        return;
      }
      i++;
    }
  }

  contains(target: FactorLevelChoice): boolean {
    for (const choice of this._choices) {
      if (choice.equals(target)) {
        return true;
      }
    }
    return false;
  }

  containsAll(items: FactorLevelChoice[]): boolean {
    for (const item of items) {
      if (!this.contains(item)) {
        return false;
      }
    }
    return true;
  }

  arrow(arrowList: FactorLevelChoiceCollection) {
    for (const choice of this._choices) {
      if (!arrowList.contains(choice)) {
        this.remove(choice);
        this.arrow(arrowList);
        return;
      }
    }
  }

  disarrow(disarrowList: FactorLevelChoiceCollection) {
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

  static getInstance(factors: Factor[]): Map<Factor, FactorLevel[]> {
    this._seq++;
    // pict には、文字列のエスケープルールがわからないので、
    // 置換文字に変換してパラメータファイルを作成する
    const inpRows = [];
    let factorNo = 0;
    for (const factor of factors) {
      const levelIds = [...factor.levels].map((_, i) => `i${i}`); //=> [ 0, 1, 2, 3, 4 ]
      inpRows.push(`f${factorNo}: ${levelIds.join(', ')}\n`);
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
    const pictCombi = new Map<Factor, FactorLevel[]>();
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
          const level = factor.levels[itemNo];
          let levels = pictCombi.get(factor);
          if (!levels) {
            levels = [];
            pictCombi.set(factor, levels);
          }
          levels.push(level);
        } else {
          throw new Error('not implement');
        }
        factorNo++;
      }
    }
    return pictCombi;
  }
}
