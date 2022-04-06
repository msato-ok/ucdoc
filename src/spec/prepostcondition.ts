import { UniqueId, Entity, Description } from './core';

export class PrePostCondition extends Entity {
  private _childNodes: PrePostCondition[] = [];
  constructor(readonly id: UniqueId, readonly description: Description) {
    super(id);
  }

  get details(): PrePostCondition[] {
    return this._childNodes;
  }

  addDetail(detail: PrePostCondition) {
    this._childNodes.push(detail);
  }
}

export class PrePostConditionId extends UniqueId {}

export class PreCondition extends PrePostCondition {
  constructor(readonly id: PrePostConditionId, readonly description: Description) {
    super(id, description);
  }
}

export class PostCondition extends PrePostCondition {
  constructor(readonly id: PrePostConditionId, readonly description: Description) {
    super(id, description);
  }
}
