import * as common from '../common';
import { UniqueId, Entity, Name, Summary, walkProps } from './core';
import { Cache } from './cache';
import { Actor } from './actor';
import { AltExFlowCollection, AlternateFlow, ExceptionFlow, FlowCollection } from './flow';
import { PreCondition, PostCondition } from './prepostcondition';
import { Glossary, GlossaryCollection } from './glossary';
import { Valiation } from './valiation';

export type Player = Actor | Glossary;

export class UseCaseId extends UniqueId {}

export class UseCase extends Entity {
  private _preConditions: Cache<PreCondition> = new Cache<PreCondition>();
  private _postConditions: Cache<PostCondition> = new Cache<PostCondition>();

  get actors(): Actor[] {
    const acts = new Set<Actor>();
    this.basicFlows.actors.forEach(a => {
      acts.add(a);
    });
    this.alternateFlows.actors.forEach(a => {
      acts.add(a);
    });
    this.exceptionFlows.actors.forEach(a => {
      acts.add(a);
    });
    return Array.from(acts);
  }

  get players(): Player[] {
    const players = new Set<Player>();
    this.basicFlows.players.forEach(o => {
      players.add(o);
    });
    this.alternateFlows.players.forEach(o => {
      players.add(o);
    });
    this.exceptionFlows.players.forEach(o => {
      players.add(o);
    });
    return Array.from(players);
  }

  constructor(
    readonly id: UseCaseId,
    readonly name: Name,
    readonly summary: Summary,
    readonly preConditions: PreCondition[],
    readonly postConditions: PostCondition[],
    readonly basicFlows: FlowCollection,
    readonly alternateFlows: AltExFlowCollection<AlternateFlow>,
    readonly exceptionFlows: AltExFlowCollection<ExceptionFlow>,
    readonly valiations: Valiation[],
    readonly glossaries?: GlossaryCollection
  ) {
    super(id);
    this._preConditions.addAll(preConditions);
    this._postConditions.addAll(postConditions);
    this.validateUniqueId();
    this.updateFlowsRef();
  }

  private validateUniqueId() {
    const uniqueIds = new Set<string>();
    const _props = <Record<string, unknown>>(this as unknown);
    walkProps(_props, [], function (obj: Record<string, unknown>, path: string[], name: string, val: unknown): void {
      if (!(val instanceof UniqueId)) {
        return;
      }
      if (uniqueIds.has(val.text)) {
        throw new common.ValidationError(
          `usecase内で、"${val.text}" のIDが重複して使用されています。\n` +
            'preConditions, postConditions, basicFlows, alternateFlows, exceptionFlows, valiations のキーは、usecase 内でユニークになるようにしてください。'
        );
      }
      uniqueIds.add(val.text);
    });
  }

  private updateFlowsRef() {
    for (const flow of this.alternateFlows.flows) {
      for (const srcFlow of flow.sourceFlows) {
        srcFlow.addRefFlow(flow);
      }
      flow.returnFlow.hasBackLink = true;
    }
    for (const flow of this.exceptionFlows.flows) {
      for (const srcFlow of flow.sourceFlows) {
        srcFlow.addRefFlow(flow);
      }
    }
  }
}
