import { UniqueId, Entity } from './core';
import { PreCondition } from './prepostcondition';
import { Actor } from './actor';
import { Valiation, EntryPoint } from './valiation';
import { DTConditionRow, DTResultRow, DecisionTable, DecisionTableFactory } from './decision_table';
import { UcScenario, UcScenarioType } from './uc_scenario';
import { Flow, AlternateFlow, ExceptionFlow } from './flow';
import { InvalidArgumentError } from '../common';

export class UcScenarioStepId extends UniqueId {
  private static epSubSeq = new Map<string, number>();
  private static epSubSeqText = new Map<string, string>();

  constructor(readonly entryPoint: EntryPoint, readonly conditionRow: DTConditionRow | undefined) {
    let text = entryPoint.id.text;
    if (conditionRow) {
      const joinFull = [entryPoint.id.text, conditionRow.factor.id.text, conditionRow.level.text].join('\n');
      const seqText = UcScenarioStepId.epSubSeqText.get(joinFull);
      if (seqText) {
        text = seqText;
      } else {
        const prefix = entryPoint.id.text;
        let subSeq = UcScenarioStepId.epSubSeq.get(prefix);
        if (!subSeq) {
          subSeq = 1;
          UcScenarioStepId.epSubSeq.set(prefix, subSeq);
        } else {
          subSeq++;
        }
        text = `${prefix}-${subSeq}`;
        UcScenarioStepId.epSubSeqText.set(joinFull, text);
      }
    }
    super(text);
  }
}

export const UcScenarioStepType = {
  PreCondition: 'PreCondition',
  ActorOperation: 'ActorOperation',
  Expected: 'Expected',
} as const;
export type UcScenarioStepType = typeof UcScenarioStepType[keyof typeof UcScenarioStepType];

export class UcScenarioStep extends Entity {
  readonly id: UcScenarioStepId;
  constructor(readonly entryPoint: EntryPoint, readonly conditionRow: DTConditionRow | undefined) {
    const id = new UcScenarioStepId(entryPoint, conditionRow);
    super(id);
    this.id = id;
  }

  get stepType(): UcScenarioStepType {
    if (this.entryPoint instanceof PreCondition) {
      return UcScenarioStepType.PreCondition;
    }
    if (this.entryPoint.player instanceof Actor) {
      return UcScenarioStepType.ActorOperation;
    }
    return UcScenarioStepType.Expected;
  }
}

export class UcScenarioResultId extends UniqueId {}

export class UcScenarioResult extends Entity {
  constructor(readonly id: UcScenarioResultId, readonly result: DTResultRow) {
    super(id);
  }
}

export class UcScenarioDecisionTable {
  private preConditionRows: UcScenarioStep[] = [];
  private stepRows: UcScenarioStep[] = [];
  private resultRows: UcScenarioResult[] = [];

  constructor(readonly decisionTable: DecisionTable) {}

  get countOfRules(): number {
    return this.decisionTable.countOfRules;
  }

  get preConditionSteps(): UcScenarioStep[] {
    return Array.from(this.preConditionRows.values());
  }

  get steps(): UcScenarioStep[] {
    return Array.from(this.stepRows.values());
  }

  get results(): UcScenarioResult[] {
    return this.resultRows;
  }

  private addStep(ep: EntryPoint, o: UcScenarioStep) {
    if (ep instanceof PreCondition) {
      this.preConditionRows.push(o);
    } else if (ep instanceof Flow) {
      this.stepRows.push(o);
    } else {
      throw new InvalidArgumentError(`unknown ep instance type: ${typeof ep}`);
    }
  }

  addPreCondition(ep: PreCondition, conditionRows: DTConditionRow[]) {
    for (const conditionRow of conditionRows) {
      const o = new UcScenarioStep(ep, conditionRow);
      this.addStep(ep, o);
    }
    if (conditionRows.length == 0) {
      const o = new UcScenarioStep(ep, undefined);
      this.addStep(ep, o);
    }
  }

  addFlow(ep: Flow, conditionRows: DTConditionRow[]) {
    for (const conditionRow of conditionRows) {
      const o = new UcScenarioStep(ep, conditionRow);
      this.addStep(ep, o);
    }
    if (conditionRows.length == 0) {
      const o = new UcScenarioStep(ep, undefined);
      this.addStep(ep, o);
    }
  }
}

export class UcScenarioDecisionTableFactory {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(
    ucScenario: UcScenario,
    valiation: Valiation,
    preConditions: PreCondition[]
  ): UcScenarioDecisionTable | undefined {
    let dt;
    if (ucScenario.ucScenarioType == UcScenarioType.BasicFlowScenario) {
      dt = DecisionTableFactory.getBasicFlowInstance(valiation);
    } else if (ucScenario.ucScenarioType == UcScenarioType.AlternateFlowScenario) {
      const altFlow = ucScenario.altExFlow as AlternateFlow;
      dt = DecisionTableFactory.getAlternateFlowInstance(valiation, altFlow);
    } else if (ucScenario.ucScenarioType == UcScenarioType.ExceptionFlowScenario) {
      const exFlow = ucScenario.altExFlow as ExceptionFlow;
      dt = DecisionTableFactory.getExceptionFlowInstance(valiation, exFlow);
    } else {
      throw new InvalidArgumentError();
    }
    if (!dt) {
      return undefined;
    }
    const ucDt = new UcScenarioDecisionTable(dt);
    for (const preCondition of preConditions) {
      const conditionRows = dt.getRuleConditionsByEntryPoint(preCondition);
      ucDt.addPreCondition(preCondition, conditionRows);
    }
    for (const flow of ucScenario.flows.items) {
      const conditionRows = dt.getRuleConditionsByEntryPoint(flow);
      ucDt.addFlow(flow, conditionRows);
    }
    return ucDt;
  }
}
