import { UniqueId, Entity, Description, HasTestCover } from './core';

export class PrePostCondition extends Entity {
  protected _details: PrePostCondition[] = [];

  constructor(readonly id: UniqueId, readonly description: Description) {
    super(id);
  }

  get details(): PrePostCondition[] {
    return this._details;
  }

  addDetail(detail: PrePostCondition) {
    this._details.push(detail);
  }

  static getNestedObjects(objs: PrePostCondition[]): PrePostCondition[] {
    let results: PrePostCondition[] = [];
    for (const o of objs) {
      results.push(o);
      const children = this.getNestedObjects(o.details);
      results = results.concat(children);
    }
    return results;
  }
}

export class PrePostConditionId extends UniqueId {}

export class PreCondition extends PrePostCondition {
  constructor(readonly id: PrePostConditionId, readonly description: Description) {
    super(id, description);
  }
}

export class PostCondition extends PrePostCondition implements HasTestCover {
  private _testCover = false;

  constructor(readonly id: PrePostConditionId, readonly description: Description) {
    super(id, description);
  }

  get details(): PostCondition[] {
    return <PostCondition[]>this._details;
  }

  /**
   * ユースケーステストで事後条件の確認が行われるようにマーキングされているか？を返す。
   * 事後条件が details によって明細化されている場合は、すべての明細がカバーされている場合に、
   * 当該事後条件はカバーされていると判定する。
   */
  get isTestCover(): boolean {
    for (const detail of this.details) {
      if (!detail.isTestCover) {
        return false;
      }
    }
    if (this.details.length > 0) {
      return true;
    }
    return this._testCover;
  }

  set testCover(cover: boolean) {
    this._testCover = cover;
  }
}
