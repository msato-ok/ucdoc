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

  indexOf(flow: Flow): number {
    for (let i = 0; i < this.items.length; i++) {
      if (flow.equals(this.items[i])) {
        return i;
      }
    }
    return -1;
  }

  contains(flow: Flow): boolean {
    for (const bFlow of this.items) {
      if (flow.equals(bFlow)) {
        return true;
      }
    }
    return false;
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

export class OverrideFlow {
  constructor(readonly basicFlow: Flow, readonly replaceFlows: FlowCollection) {}
}

export class AlternateOverrideFlow extends OverrideFlow {
  constructor(readonly basicFlow: Flow, readonly replaceFlows: FlowCollection, readonly returnFlow: Flow) {
    super(basicFlow, replaceFlows);
  }
}

export class ExceptionOverrideFlow extends OverrideFlow {
  constructor(readonly basicFlow: Flow, readonly replaceFlows: FlowCollection) {
    super(basicFlow, replaceFlows);
  }
}

export abstract class AbstractAltExFlow extends Entity implements HasTestCover {
  readonly mergedFlows: FlowCollection;
  private _testCover = false;

  constructor(
    readonly id: AlternateFlowId | ExceptionFlowId,
    readonly description: Description,
    readonly overrideFlows: OverrideFlow[],
    readonly basicFlows: FlowCollection
  ) {
    super(id);
    let altFlowItems: Flow[] = [];
    let startIndex = 0;
    let overrideIndex = 0;
    for (let i = 0; i < overrideFlows.length; i++) {
      const overrideFlow = overrideFlows[i];
      overrideIndex = basicFlows.indexOf(overrideFlow.basicFlow);
      if (overrideIndex == -1) {
        throw new ValidationError(
          `basicFlows の中に ${overrideFlow.basicFlow.id.text} がありません。あるいは、定義順に問題があります。`
        );
      }
      altFlowItems = altFlowItems.concat(basicFlows.items.slice(startIndex, overrideIndex));
      altFlowItems = altFlowItems.concat(overrideFlow.replaceFlows.items);
      if (overrideFlow instanceof AlternateOverrideFlow) {
        const altOverrideFlow = overrideFlow;
        startIndex = basicFlows.indexOf(altOverrideFlow.returnFlow);
        if (startIndex < overrideIndex) {
          if (overrideIndex < overrideFlows.length - 1) {
            throw new ValidationError(
              `returnFlow が分岐元よりも前のフローに戻る場合、最後の override である必要があります。 分岐元=${overrideFlow.basicFlow.id.text}, returnFlow=${altOverrideFlow.returnFlow.id.text}`
            );
          }
        }
      }
    }
    if (startIndex > overrideIndex) {
      altFlowItems = altFlowItems.concat(basicFlows.items.slice(startIndex));
    }
    this.mergedFlows = new FlowCollection(altFlowItems);
  }

  get refText(): string {
    const refIds = [];
    for (const ov of this.overrideFlows) {
      refIds.push(ov.basicFlow.id.text);
    }
    return refIds.join(', ');
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
    readonly overrideFlows: AlternateOverrideFlow[],
    readonly basicFlows: FlowCollection
  ) {
    super(id, description, overrideFlows, basicFlows);
  }
}

export class ExceptionFlowId extends UniqueId {}

export class ExceptionFlow extends AbstractAltExFlow {
  constructor(
    readonly id: ExceptionFlowId,
    readonly description: Description,
    readonly overrideFlows: ExceptionOverrideFlow[],
    readonly basicFlows: FlowCollection
  ) {
    super(id, description, overrideFlows, basicFlows);
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
    for (const item of items) {
      for (const actor of item.mergedFlows.actors) {
        this._actors.add(actor);
      }
      for (const player of item.mergedFlows.players) {
        this._players.add(player);
      }
    }
  }

  get(id: string | UniqueId): T | undefined {
    return this._flows.get(id);
  }
}
