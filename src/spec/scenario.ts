import { UniqueId, Entity, Name, Summary } from './core';
import { UseCase } from './usecase';

export class ScenarioId extends UniqueId {}

export class Scenario extends Entity {
  constructor(
    readonly id: ScenarioId,
    readonly name: Name,
    readonly summary: Summary,
    readonly usecaseOrders: UseCase[]
  ) {
    super(id);
  }
}
