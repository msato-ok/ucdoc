import { UniqueId, Entity, Description } from './core';

export class PrePostCondition extends Entity {
  constructor(readonly id: UniqueId, readonly description: Description) {
    super(id);
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
