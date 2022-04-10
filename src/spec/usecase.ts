import { ValidationError } from '../common';
import { UniqueId, Entity, Name, Summary, implementsHasTestCover } from './core';
import { Cache } from './cache';
import { Actor } from './actor';
import { AltExFlowCollection, AlternateFlow, ExceptionFlow, FlowCollection, Flow } from './flow';
import { PreCondition, PostCondition, PrePostCondition } from './prepostcondition';
import { Glossary, GlossaryCollection } from './glossary';
import { Valiation } from './valiation';

export class UseCaseValidationError extends ValidationError {}

export type Player = Actor | Glossary;

export class UseCaseId extends UniqueId {}

export class UseCase extends Entity {
  private _preConditions: Cache<PreCondition> = new Cache<PreCondition>();
  private _postConditions: Cache<PostCondition> = new Cache<PostCondition>();
  private _errorMessages: string[] = [];

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

  get hasError(): boolean {
    return this._errorMessages.length > 0;
  }

  get errors(): string[] {
    return this._errorMessages;
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
    readonly glossaries?: GlossaryCollection,
    strictValidation?: boolean
  ) {
    super(id);
    this._preConditions.addAll(preConditions);
    this._postConditions.addAll(postConditions);
    this.validateUniqueId();
    if (strictValidation == undefined) {
      strictValidation = false;
    }
    this.validatePostConditionTestCoverage(strictValidation);
    this.updateFlowsRef();
  }

  getAltExFlowByChildFlow(flow: Flow): AlternateFlow | ExceptionFlow | undefined {
    for (const aFlow of this.alternateFlows.items) {
      for (const bFlow of aFlow.nextFlows.items) {
        if (bFlow.equals(flow)) {
          return aFlow;
        }
      }
    }
    for (const eFlow of this.exceptionFlows.items) {
      for (const bFlow of eFlow.nextFlows.items) {
        if (bFlow.equals(flow)) {
          return eFlow;
        }
      }
    }
    return undefined;
  }

  /**
   * ユースケース内で ID が重複して使われていないことをチェックする
   * ユニークじゃないといけない ID は UniqueId を継承していて、プロパティ名が id のすべて。
   */
  private validateUniqueId() {
    const uniqueIds = new Set<string>();
    function validateEntityId(entities: Entity[]) {
      for (const entity of entities) {
        if (uniqueIds.has(entity.id.text)) {
          throw new ValidationError(
            [
              `usecase内で、"${entity.id.text}" のIDが重複して使用されています。`,
              'preConditions, postConditions, basicFlows, alternateFlows, exceptionFlows, valiations のキーは、usecase 内でユニークになるようにしてください。',
            ].join('\n')
          );
        }
        uniqueIds.add(entity.id.text);
      }
    }
    validateEntityId(PrePostCondition.getNestedObjects(this.preConditions));
    validateEntityId(PrePostCondition.getNestedObjects(this.postConditions));
    validateEntityId(this.basicFlows.items);
    validateEntityId(this.exceptionFlows.items);
    validateEntityId(this.valiations);
    for (const v of this.valiations) {
      validateEntityId(v.results);
    }
  }

  /**
   * ユースケーステストのチェックとして、事後条件の確認が網羅されているかチェックする
   */
  private validatePostConditionTestCoverage(strictValidation: boolean) {
    for (const valiation of this.valiations) {
      for (const result of valiation.results) {
        for (const checkPoint of result.checkPoints) {
          if (implementsHasTestCover(checkPoint)) {
            checkPoint.testCover = true;
          }
        }
      }
    }
    const errMessages = [];
    for (const o of this.postConditions) {
      if (!o.isTestCover) {
        errMessages.push(`valiations の中に事後条件 ${o.id.text} の検証ルールがありません。`);
      }
    }
    for (const o of this.alternateFlows.items) {
      if (!o.isTestCover) {
        errMessages.push(`valiations の中に代替フロー ${o.id.text} の検証ルールがありません。`);
      }
    }
    for (const o of this.exceptionFlows.items) {
      if (!o.isTestCover) {
        errMessages.push(`valiations の中に例外フロー ${o.id.text} の検証ルールがありません。`);
      }
    }
    this._errorMessages = this._errorMessages.concat(errMessages);
    if (strictValidation && errMessages.length > 0) {
      throw new UseCaseValidationError(errMessages.join('\n'));
    }
  }

  private updateFlowsRef() {
    for (const flow of this.alternateFlows.items) {
      for (const srcFlow of flow.sourceFlows) {
        srcFlow.addRefFlow(flow);
      }
      flow.returnFlow.hasBackLink = true;
    }
    for (const flow of this.exceptionFlows.items) {
      for (const srcFlow of flow.sourceFlows) {
        srcFlow.addRefFlow(flow);
      }
    }
  }
}
