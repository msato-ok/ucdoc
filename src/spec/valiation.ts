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
    readonly description: Description,
    readonly factorEntryPoint: FactorEntryPoint,
    readonly pict: Pict,
    readonly results: ValiationResultCollection
  ) {
    super(id);
    this.validate();
  }

  private validate(): void {
    if (this.results.size == 0) {
      throw new ValidationError(`results は1つ以上必要です (id: ${this.id.text})`);
    }
  }

  get countOfPictPatterns(): number {
    if (this.factorEntryPoint.factors.length == 0) {
      return 0;
    }
    // 組み合わせ数は、どの factor のものでも同じなので、
    // 0 番目のものを使って調べる
    const combi = this.pict.getLevels(this.factorEntryPoint.factors[0]);
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

export class ValiationResultCollection {
  private _results: ValiationResult[] = [];

  get items(): ValiationResult[] {
    return this._results;
  }

  get size(): number {
    return this._results.length;
  }

  private filterVerificationItems(
    filterCallback: (verificationPoint: VerificationPoint) => boolean
  ): ValiationResultCollection {
    const filterd = new ValiationResultCollection();
    for (const result of this.items) {
      let match = true;
      for (const vp of result.verificationPoints) {
        if (!filterCallback(vp)) {
          match = false;
          break;
        }
      }
      if (!match) {
        continue;
      }
      filterd.add(result);
    }
    return filterd;
  }

  getPostCondiVerificationItems(): ValiationResultCollection {
    return this.filterVerificationItems(vp => {
      return vp instanceof PostCondition;
    });
  }

  getAltVerificationItems(altFlow: AlternateFlow): ValiationResultCollection {
    return this.filterVerificationItems(vp => {
      if (vp instanceof AlternateFlow) {
        if (vp.equals(altFlow)) {
          return true;
        }
      }
      return false;
    });
  }

  getExVerificationItems(exFlow: ExceptionFlow): ValiationResultCollection {
    return this.filterVerificationItems(vp => {
      if (vp instanceof ExceptionFlow) {
        if (vp.equals(exFlow)) {
          return true;
        }
      }
      return false;
    });
  }

  add(result: ValiationResult) {
    this._results.push(result);
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
  private _ommitLevels = new Map<Factor, FactorLevel[]>();

  copy(): FactorEntryPoint {
    const o = new FactorEntryPoint();
    o._entryPoints = new Map<EntryPoint, Factor[]>(this._entryPoints);
    o._factors = new Map<Factor, EntryPoint>(this._factors);
    o._ommitLevels = new Map<Factor, FactorLevel[]>(this._ommitLevels);
    return o;
  }

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

  removeFactor(factor: Factor): void {
    for (const [ep, factors] of Array.from(this._entryPoints.entries())) {
      const index = factors.indexOf(factor);
      if (index == -1) {
        continue;
      }
      factors.splice(index, 1);
      if (factors.length == 0) {
        this._entryPoints.delete(ep);
      }
    }
    this._factors.delete(factor);
    this._ommitLevels.delete(factor);
  }

  /**
   * 現在のインスタンスを元にして、新しい因子水準に置き換えて、再作成する
   *
   * 使用されている因子水準だけで FactorEntryPoint を作り直す場合などに使う。
   * 元インスタンスで使われていない因子水準を追加することはできない。
   *
   * @param factors
   * @returns
   */
  regenarateFromFactors(factors: Factor[]): FactorEntryPoint {
    const dst = new FactorEntryPoint();
    let replaced = 0;
    for (const [ep, srcFactors] of Array.from(this._entryPoints.entries())) {
      const dstEpFactors = [];
      for (const dstFac of factors) {
        for (const srcFac of srcFactors) {
          if (dstFac.equals(srcFac)) {
            dstEpFactors.push(dstFac);
            replaced++;
          }
        }
      }
      if (dstEpFactors.length > 0) {
        dst.add(ep, dstEpFactors);
      }
    }
    if (replaced != factors.length) {
      throw new InvalidArgumentError(
        'factors で作り変える場合、元の FactorEntryPoint に存在しない Factor を追加することはできません'
      );
    }
    return dst;
  }

  containsChoice(factorChoice: FactorLevelChoice): boolean {
    for (const factor of this.factors) {
      if (!factorChoice.factor.equals(factor)) {
        continue;
      }
      for (const level of factor.levels) {
        if (!factorChoice.level.equals(level)) {
          return true;
        }
      }
    }
    return false;
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

  /**
   * 因子水準を除外する
   *
   * @param choice
   */
  ommitFactorLevel(choice: FactorLevelChoice) {
    let levels = this._ommitLevels.get(choice.factor);
    if (!levels) {
      levels = [];
      this._ommitLevels.set(choice.factor, levels);
    }
    levels.push(choice.level);
    if (levels.length == choice.factor.levels.length) {
      this.removeFactor(choice.factor);
    }
  }

  /**
   * 除外されていない因子水準を取得する
   *
   * @param f
   * @returns
   */
  getToBeUsedFactorLevels(f: Factor): FactorLevel[] {
    const ommitLevels = this._ommitLevels.get(f);
    if (!ommitLevels) {
      return f.levels;
    }
    const levels = f.levels.concat([]);
    for (const ommit of ommitLevels) {
      const i = levels.indexOf(ommit);
      if (i != -1) {
        levels.splice(i, 1);
      }
    }
    return levels;
  }
}

export class Pict {
  constructor(
    readonly factorEntryPoint: FactorEntryPoint,
    readonly pictConstraint: PictConstraint,
    readonly combination: Map<Factor, FactorLevel[]>
  ) {}

  get factors(): Factor[] {
    return Array.from(this.combination.keys());
  }

  getLevels(f: Factor): FactorLevel[] {
    const levels = this.combination.get(f);
    if (!levels) {
      throw new InvalidArgumentError(`組み合わせ結果の中に指定された factor(${f.id.text}) は存在しない`);
    }
    return levels;
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

  /**
   * リスト中にある FactorLevelChoice で Factor を作り直す
   *
   * （例）
   * factor: level1, level2, level3
   * 本来の Factor は、上記のとおり 3 つの level があるとして、
   * でも、本 collection の中には、以下のとおり 2 つの level しかなかった場合、
   * factor: level1, level3
   * この場合は、2つの level の Factor に作り直して、返す
   *
   * 実際に使われている因子水準だけでデシジョンテーブルを作り直したい場合などに
   * 使用されることを想定する。
   *
   * @returns
   */
  regenerateFactors(): Factor[] {
    const factorBuff = new Map<Factor, Set<FactorLevel>>();
    for (const choice of this._choices) {
      let levels = factorBuff.get(choice.factor);
      if (!levels) {
        levels = new Set<FactorLevel>();
        factorBuff.set(choice.factor, levels);
      }
      levels.add(choice.level);
    }
    const factors = [];
    for (const [oldFactor, levels] of Array.from(factorBuff.entries())) {
      const newFactor = new Factor(oldFactor.id, oldFactor.name, Array.from(levels));
      factors.push(newFactor);
    }
    return factors;
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

export class PictFactory {
  private static _seq = 0;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(factorEntryPoint: FactorEntryPoint, pictConstraint: PictConstraint): Pict {
    const pictCombi = new Map<Factor, FactorLevel[]>();
    if (factorEntryPoint.factors.length == 0) {
      return new Pict(factorEntryPoint, pictConstraint, pictCombi);
    }
    this._seq++;
    // pict の文字列のエスケープルールがわからないので、
    // 数字に置換してパラメータファイルを作成する
    // 例） 行頭が factorId で : 以降が level
    // f0: i0, i1
    // f1: i0, i1
    const inpRows = [];
    let factorNo = 0;
    for (const factor of factorEntryPoint.factors) {
      const levels = factorEntryPoint.getToBeUsedFactorLevels(factor);
      const levelIds = [...levels].map((_, i) => `i${i}`); //=> [ 0, 1, 2, 3, 4 ]
      inpRows.push(`f${factorNo}: ${levelIds.join(', ')}\n`);
      factorNo++;
    }
    const pictInText = inpRows.join('');
    const pictInPath = path.join(conf.tmpDir, `${this._seq}.pict.in`);
    fs.writeFileSync(pictInPath, pictInText);
    // pict を実行して stdout に出力された結果の数字を置換前の文字列に戻す
    // 例） 先頭行が factorId で 2行目以降が item
    // f0	f1
    // i1	i0
    // i1	i2
    const pictOutText = execSync(`pict ${pictInPath}`);
    const outRows = pictOutText.toString().split(/\n/);
    let head = true;
    for (const row of outRows) {
      if (row == '') {
        continue;
      }
      const cols = row.split(/\t/);
      if (cols.length != factorEntryPoint.factors.length) {
        throw new Error(
          `pict の出力が想定されたものと違う(カラム数): ${cols.length} != ${factorEntryPoint.factors.length}`
        );
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
        if (col.indexOf('i') != 0) {
          throw new Error('not implement');
        }
        const levelNo = Number(col.substring(1));
        const factor = factorEntryPoint.factors[factorNo];
        const levels = factorEntryPoint.getToBeUsedFactorLevels(factor);
        const level = levels[levelNo];
        let combi = pictCombi.get(factor);
        if (!combi) {
          combi = [];
          pictCombi.set(factor, combi);
        }
        combi.push(level);
        factorNo++;
      }
    }
    return new Pict(factorEntryPoint, pictConstraint, pictCombi);
  }
}
