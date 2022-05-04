import { UniqueId, Entity } from './core';
import { PreCondition } from './prepostcondition';
import { Valiation, EntryPoint, DTConditionRow, DecisionTable } from './valiation';
import { UcScenario } from './uc_scenario';
import { Flow } from './flow';
import { InvalidArgumentError } from '../common';

export class UcScenarioStepId extends UniqueId {
  private static epSubSeq = new Map<string, number>();
  private static epSubSeqText = new Map<string, string>();

  constructor(readonly entryPoint: EntryPoint, readonly conditionRow: DTConditionRow | undefined) {
    let text = entryPoint.id.text;
    if (conditionRow) {
      const joinFull = [entryPoint.id.text, conditionRow.factor.id.text, conditionRow.item.text].join('\n');
      const seqText = UcScenarioStepId.epSubSeqText.get(joinFull);
      if (seqText) {
        text = seqText;
      } else {
        const prefix = entryPoint.id.text;
        let subSeq = UcScenarioStepId.epSubSeq.get(prefix);
        if (!subSeq) {
          subSeq = 1;
          UcScenarioStepId.epSubSeq.set(prefix, subSeq);
        }
        text = `${prefix}-${subSeq}`;
        UcScenarioStepId.epSubSeqText.set(joinFull, text);
      }
    }
    super(text);
  }
}

export class UcScenarioStep extends Entity {
  readonly id: UcScenarioStepId;
  constructor(readonly entryPoint: EntryPoint, readonly conditionRow: DTConditionRow | undefined) {
    const id = new UcScenarioStepId(entryPoint, conditionRow);
    super(id);
    this.id = id;
  }
}

export class UcScenarioDecisionTable {
  private preConditionRows: UcScenarioStep[] = [];
  private flowRows: UcScenarioStep[] = [];

  constructor(readonly decisionTable: DecisionTable) {}

  get countOfRules(): number {
    return this.decisionTable.countOfRules;
  }

  get steps(): UcScenarioStep[] {
    return Array.from(this.preConditionRows.values()).concat(Array.from(this.flowRows.values()));
  }

  private addStep(ep: EntryPoint, o: UcScenarioStep) {
    if (ep instanceof PreCondition) {
      this.preConditionRows.push(o);
    } else if (ep instanceof Flow) {
      this.flowRows.push(o);
    } else {
      throw new InvalidArgumentError(`unknown ep instance type: ${typeof ep}`);
    }
  }

  addConditionRow(ep: EntryPoint, conditionRows: DTConditionRow[]) {
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
  ): UcScenarioDecisionTable {
    const dt = valiation.decisionTable;
    const ucDt = new UcScenarioDecisionTable(dt);
    for (const preCondition of preConditions) {
      const conditionRows = dt.getRuleConditionsByEntryPoint(preCondition);
      ucDt.addConditionRow(preCondition, conditionRows);
    }
    for (const flow of ucScenario.flows.items) {
      const conditionRows = dt.getRuleConditionsByEntryPoint(flow);
      ucDt.addConditionRow(flow, conditionRows);
    }
    return ucDt;
  }
}
