import { UniqueId, Entity, Name } from './core';

export class ActorId extends UniqueId {}

export class Actor extends Entity {
  constructor(readonly id: ActorId, readonly name: Name) {
    super(id);
  }
  get text(): string {
    return this.name.text;
  }
}
