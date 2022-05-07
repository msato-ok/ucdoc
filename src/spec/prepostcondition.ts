import { UniqueId, Entity, Description, HasTestCover, HasChildNode } from './core';

export class PrePostCondition extends Entity implements HasChildNode<PrePostCondition> {
  protected _details: PrePostCondition[] = [];

  constructor(readonly id: UniqueId, readonly description: Description) {
    super(id);
  }

  get childNodes(): PrePostCondition[] {
    return this._details;
  }

  addDetail(detail: PrePostCondition) {
    this._details.push(detail);
  }

  // static getNestedObjects(objs: PrePostCondition[]): PrePostCondition[] {
  //   let results: PrePostCondition[] = [];
  //   for (const o of objs) {
  //     results.push(o);
  //     const children = this.getNestedObjects(o.childNodes);
  //     results = results.concat(children);
  //   }
  //   return results;
  // }
}

export class PrePostConditionId extends UniqueId {}

export class PreCondition extends PrePostCondition {
  constructor(readonly id: PrePostConditionId, readonly description: Description) {
    super(id, description);
  }
}

export class PostCondition extends PrePostCondition implements HasTestCover, HasChildNode<PostCondition> {
  private _testCover = false;

  constructor(readonly id: PrePostConditionId, readonly description: Description) {
    super(id, description);
  }

  get childNodes(): PostCondition[] {
    return <PostCondition[]>this._details;
  }

  /**
   * ユースケーステストで事後条件の確認が行われるようにマーキングされているか？を返す。
   * 事後条件が details によって明細化されている場合は、すべての明細がカバーされている場合に、
   * 当該事後条件はカバーされていると判定する。
   */
  get isTestCover(): boolean {
    return this.uncoverIds.length === 0;
  }

  get uncoverIds(): string[] {
    const ids = [];
    for (const detail of this.childNodes) {
      if (!detail.isTestCover) {
        ids.push(detail.id.text);
      }
    }
    if (ids.length === 0) {
      return ids;
    }
    if (!this._testCover) {
      ids.push(this.id.text);
    }
    return ids;
  }

  set testCover(cover: boolean) {
    this._testCover = cover;
  }
}
