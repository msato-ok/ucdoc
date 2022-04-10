import { UniqueId, Description, Entity, entityContains } from './core';
import { UseCase } from './usecase';
import { Flow, FlowCollection, AbstractAltExFlow, AlternateFlow, ExceptionFlow } from './flow';
import * as util from '../util';
import { InvalidArgumentError } from '../common';

class UcScenarioId extends UniqueId {}

/**
 * シナリオタイプ
 */
export const UcScenarioType = {
  // 基本フローが正常に実行されて事後条件が出力されることを検証するシナリオ
  BasicFlowScenario: 'BasicFlowScenario',
  // 代替フローを検証するシナリオ
  AlternateFlowScenario: 'AlternateFlowScenario',
  // 例外フローを検証するシナリオ
  ExceptionFlowScenario: 'ExceptionFlowScenario',
} as const;
type UcScenarioType = typeof UcScenarioType[keyof typeof UcScenarioType];

/**
 * 分岐タイプ
 *
 * ユースケースの基本フローが代替（例外）フローに分岐する分岐元となる基本フローを
 * Branch で、分岐しない基本フローが None になる。
 * 代替フローと例外フローは、そのまま Alternate と Exception になる。
 */
export const BranchType = {
  None: 'none',
  Branch: 'branch',
  Alternate: 'alt',
  Exception: 'ex',
} as const;
type BranchType = typeof BranchType[keyof typeof BranchType];

/**
 * テストシナリオフローの表
 *
 * ユースケースのテストシナリオと、明細としてのフローを保持する。
 *
 * このオブジェクトで表現しようとしている表のイメージは以下のとおり。
 *
 * | フローID | TS01 | TS02 | TS03 | Player ID | 説明                          |
 * | -------- | ---- | ---- | ---- | --------- | ----------------------------- |
 * | B01      | ○   | ○   | ○   | U01       | 検索ボタンをクリックする      |
 * | B02      | ○   | ○   | ○   | system    | ┗ 検索結果画面を表示する     |
 * | A01      |      | ○   |      | system    | ┗ ヒットゼロの画面を表示する |
 * | B03      | ○   |      | ○   | U01       | 一覧の編集ボタンをクリック    |
 * | B04      | ○   |      | ○   | system    | 編集画面を表示する            |
 * | E01      |      |      | ○   | system    | ┗ 存在しないのでエラーになる |
 * | B05      | ○   |      |      | U01       | 更新ボタンをクリックする      |
 * | B06      | ○   |      |      | system    | 更新して一覧画面を再表示する  |
 *
 * テストシナリオ（TS01～TS04）を進めるときに実行されるフローを示している表で、
 * 縦にユースケースのフロー、横にテストシナリオの表で、マーカー（○）のついた、
 * ところが、実際に実行されるフローとなっている。
 *
 * UcScenarioCollection の中で、横列のテストシナリオを表現しているのは UcScenario になる。
 * 縦行は、基本フローと代替フロー、例外フローが重複無く漏れ無く並んでいる。
 */

/**
 * テストシナリオ
 *
 * テストシナリオフローの表で言うところ TS01 の列のデータを保持する。
 * 表のマス目を持っているわけではなく、○のつくフローを FlowCollection で保持している。
 */
export class UcScenario extends Entity {
  constructor(
    readonly id: UcScenarioId,
    readonly description: Description,
    readonly flows: FlowCollection,
    readonly altExFlow?: AlternateFlow | ExceptionFlow | undefined
  ) {
    super(id);
  }

  get ucScenarioType(): UcScenarioType {
    if (!this.altExFlow) {
      return UcScenarioType.BasicFlowScenario;
    } else if (this.altExFlow instanceof AlternateFlow) {
      return UcScenarioType.AlternateFlowScenario;
    } else if (this.altExFlow instanceof ExceptionFlow) {
      return UcScenarioType.ExceptionFlowScenario;
    } else {
      throw new InvalidArgumentError('unknown state ucScenarioType');
    }
  }
}

/**
 * テストシナリオとシナリオフロー
 *
 * UcScenario をまとめた "テストシナリオフローの表" のオブジェクト.
 *
 */
export class UcScenarioCollection {
  private _ucScenarios: UcScenario[] = [];
  private _orderedFlows: Flow[] = [];

  constructor(readonly base: UcScenario) {
    if (base.ucScenarioType != UcScenarioType.BasicFlowScenario) {
      throw new InvalidArgumentError(
        `base は、ucScenarioType が BasicFlowScenario のシナリオで指定してください。
        id=${base.id.text}, ucScenarioType=${base.ucScenarioType}`
      );
    }
    this._ucScenarios.push(base);
    for (const flow of base.flows.items) {
      this._orderedFlows.push(flow);
      for (const refFlow of flow.refFlows) {
        for (const nFlow of refFlow.nextFlows.items) {
          this._orderedFlows.push(nFlow);
        }
      }
    }
  }

  get flows(): Flow[] {
    return this._orderedFlows;
  }

  get scenarios(): UcScenario[] {
    return this._ucScenarios;
  }

  isUsing(flow: Flow, scenario: UcScenario): boolean {
    return entityContains(scenario.flows.items, flow);
  }

  getBranchType(flow: Flow): string {
    const scenarios = this.getScenariosByFLow(flow);
    if (scenarios.length == 0) {
      throw new InvalidArgumentError(`flow を使っている scenario がない状態は、想定されていない: flow=${flow.id.text}`);
    }
    if (scenarios[0].ucScenarioType == UcScenarioType.BasicFlowScenario) {
      return flow.refFlows.length > 0 ? BranchType.Branch : BranchType.None;
    } else if (scenarios[0].ucScenarioType == UcScenarioType.AlternateFlowScenario) {
      return BranchType.Alternate;
    } else if (scenarios[0].ucScenarioType == UcScenarioType.ExceptionFlowScenario) {
      return BranchType.Exception;
    } else {
      throw new InvalidArgumentError(`unknown ucScenarioType: ${scenarios[0].ucScenarioType}`);
    }
  }

  add(targetScenario: UcScenario) {
    this._ucScenarios.push(targetScenario);
  }

  getScenariosByFLow(flow: Flow): UcScenario[] {
    const flowScenarios = [];
    for (const scenario of this._ucScenarios) {
      if (entityContains(scenario.flows.items, flow)) {
        flowScenarios.push(scenario);
      }
    }
    return flowScenarios;
  }
}

export class UcScenarioCollectionFactory {
  static getInstance(uc: UseCase): UcScenarioCollection {
    let testNo = 1;
    const baseScenario = new UcScenario(
      this.genScenarioId(testNo++),
      new Description('正常に実行されて事後条件が成立する状態の検証'),
      uc.basicFlows
    );
    const ucScenarioCollection = new UcScenarioCollection(baseScenario);
    for (const altFlow of uc.alternateFlows.items) {
      const scenario = new UcScenario(
        this.genScenarioId(testNo++),
        new Description(`代替フロー（${altFlow.description.text}）の検証シナリオ`),
        this.genAltExScenarioFlow(uc, altFlow),
        altFlow
      );
      ucScenarioCollection.add(scenario);
    }
    for (const exFlow of uc.exceptionFlows.items) {
      const scenario = new UcScenario(
        this.genScenarioId(testNo++),
        new Description(`例外フロー（${exFlow.description.text}）の検証シナリオ`),
        this.genAltExScenarioFlow(uc, exFlow),
        exFlow
      );
      ucScenarioCollection.add(scenario);
    }
    return ucScenarioCollection;
  }

  static genScenarioId(no: number) {
    const scenarioIdPrefix = 'TP';
    return new UcScenarioId(`${scenarioIdPrefix}${util.zeropad(no, 2)}`);
  }

  static genAltExScenarioFlow(uc: UseCase, altExFlow: AlternateFlow | ExceptionFlow): FlowCollection {
    let flows: Flow[] = [];
    for (const bFlow of uc.basicFlows.items) {
      let branchFlows: Flow[] = [];
      for (const refFlow of bFlow.refFlows) {
        if (refFlow.equals(altExFlow)) {
          branchFlows = refFlow.nextFlows.items;
          break;
        }
      }
      if (branchFlows.length > 0) {
        flows = flows.concat(branchFlows);
        break;
      }
      flows.push(bFlow);
    }
    if (altExFlow instanceof AlternateFlow) {
      const altFlow = altExFlow;
      let restart = false;
      for (const bFlow of uc.basicFlows.items) {
        if (bFlow.equals(altFlow.returnFlow)) {
          restart = true;
        }
        if (restart) {
          flows.push(bFlow);
        }
      }
    }
    return new FlowCollection(flows);
  }
}
