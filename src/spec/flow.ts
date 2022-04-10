import { UniqueId, Entity, Description, HasTestCover } from './core';
import { ValidationError } from '../common';
import { Actor } from './actor';
import { Cache } from './cache';
import { Player } from './usecase';

export class FlowId extends UniqueId {}

export class Flow extends Entity {
  private _refFlows: Set<AbstractAltExFlow> = new Set<AbstractAltExFlow>();
  private _hasBackLink = false;

  get refFlows(): AbstractAltExFlow[] {
    return Array.from(this._refFlows);
  }

  get hasBackLink(): boolean {
    return this._hasBackLink;
  }

  set hasBackLink(b: boolean) {
    this._hasBackLink = b;
  }

  constructor(readonly id: FlowId, readonly description: Description, readonly player: Player) {
    super(id);
    if (!player) {
      throw new ValidationError(`flow(${id}) に player(${player}) は必須です。`);
    }
  }

  addRefFlow(flow: AbstractAltExFlow) {
    this._refFlows.add(flow);
    this.hasBackLink = true;
  }
}

export class FlowCollection {
  private _flows: Cache<Flow> = new Cache<Flow>();
  private _actors: Set<Actor> = new Set<Actor>();
  private _players: Set<Player> = new Set<Player>();

  get actors(): Actor[] {
    return Array.from(this._actors);
  }

  get players(): Player[] {
    return Array.from(this._players);
  }

  constructor(readonly items: Flow[]) {
    this._flows.addAll(items);
    for (const flow of items) {
      if (flow.player instanceof Actor) {
        this._actors.add(flow.player);
      }
      this._players.add(flow.player);
    }
  }
}

export abstract class AbstractAltExFlow extends Entity implements HasTestCover {
  private _testCover = false;

  constructor(
    readonly id: AlternateFlowId | ExceptionFlowId,
    readonly description: Description,
    readonly sourceFlows: Flow[],
    readonly nextFlows: FlowCollection
  ) {
    super(id);
  }

  get isTestCover(): boolean {
    return this._testCover;
  }

  set testCover(cover: boolean) {
    this._testCover = cover;
  }
}

export class AlternateFlowId extends UniqueId {}

export class AlternateFlow extends AbstractAltExFlow {
  constructor(
    readonly id: AlternateFlowId,
    readonly description: Description,
    readonly sourceFlows: Flow[],
    readonly nextFlows: FlowCollection,
    readonly returnFlow: Flow
  ) {
    super(id, description, sourceFlows, nextFlows);
  }
}

export class ExceptionFlowId extends UniqueId {}

export class ExceptionFlow extends AbstractAltExFlow {
  constructor(
    readonly id: ExceptionFlowId,
    readonly description: Description,
    readonly sourceFlows: Flow[],
    readonly nextFlows: FlowCollection
  ) {
    super(id, description, sourceFlows, nextFlows);
  }
}

export class AltExFlowCollection<T extends AbstractAltExFlow> {
  private _flows: Cache<T> = new Cache<T>();
  private _actors: Set<Actor> = new Set<Actor>();
  private _players: Set<Player> = new Set<Player>();

  get actors(): Actor[] {
    return Array.from(this._actors);
  }

  get players(): Player[] {
    return Array.from(this._players);
  }

  constructor(readonly items: T[]) {
    this._flows.addAll(items);
    for (const flow of items) {
      for (const actor of flow.nextFlows.actors) {
        this._actors.add(actor);
      }
      for (const player of flow.nextFlows.players) {
        this._players.add(player);
      }
    }
  }

  get(id: string | UniqueId): T | undefined {
    return this._flows.get(id);
  }
}
