import { Description } from './core';
import { ValidationError, InvalidArgumentError } from '../common';
import {
  Factor,
  FactorLevel,
  EntryPoint,
  FactorEntryPoint,
  FactorLevelChoice,
  FactorLevelChoiceCollection,
  Valiation,
} from './valiation';

export class DTValidationError extends ValidationError {}

export const DTConditionRuleChoice = {
  Yes: 'Y',
  No: 'N',
  None: 'None',
} as const;
export type DTConditionChoice = typeof DTConditionRuleChoice[keyof typeof DTConditionRuleChoice];

export class DTConditionRow {
  private _choices: DTConditionChoice[] = [];

  constructor(readonly factor: Factor, readonly item: FactorLevel) {}

  get countOfRules(): number {
    return this._choices.length;
  }

  get rules(): DTConditionChoice[] {
    return this._choices;
  }

  add(rule: DTConditionChoice) {
    this._choices.push(rule);
  }
}

export const DTResultRuleChoice = {
  Check: 'X',
  None: 'None',
} as const;
type DTResultRuleChoice = typeof DTResultRuleChoice[keyof typeof DTResultRuleChoice];

class DTResultRow {
  private _choices: DTResultRuleChoice[] = [];

  constructor(readonly desc: Description) {}

  get countOfRules(): number {
    return this._choices.length;
  }

  get rules(): DTResultRuleChoice[] {
    return this._choices;
  }

  add(rule: DTResultRuleChoice) {
    this._choices.push(rule);
  }
}

export class DecisionTable {
  private _conditionRows: DTConditionRow[] = [];
  private _resultRows: DTResultRow[] = [];
  private _invalidRules: string[] = [];

  constructor(private factorEntryPoint: FactorEntryPoint) {}

  validate(): void {
    this._invalidRules = [];
    for (let ruleNo = 0; ruleNo < this.countOfRules; ruleNo++) {
      const ruleRows = this.getRuleResults(ruleNo);
      if (ruleRows.length == 0) {
        this._invalidRules.push(`ruleNo=${ruleNo + 1} の期待値となる結果が1つもありません`);
      }
    }
    if (this.invalidRules.length > 0) {
      const errmsg = [
        `${this.invalidRules.join('\n')}`,
        '※ ruleNoはデシジョンテーブルのmdを作成して確認してください。',
        'usage: ucdoc decision <file> [otherFiles...]',
      ].join('\n');
      throw new DTValidationError(errmsg);
    }
  }

  get countOfRules(): number {
    // ルール数は、どの行を調べても同じなので 0 番目のものを使って調べる
    return this._conditionRows[0].countOfRules;
  }

  get conditionRows(): DTConditionRow[] {
    return this._conditionRows;
  }

  get resultRows(): DTResultRow[] {
    return this._resultRows;
  }

  addCondition(row: DTConditionRow) {
    this._conditionRows.push(row);
  }

  addResult(row: DTResultRow) {
    this._resultRows.push(row);
  }

  getRuleConditions(ruleNo: number): FactorLevelChoiceCollection {
    if (this.countOfRules <= ruleNo) {
      throw new InvalidArgumentError('ruleNo は 0 から (countOfRules - 1) の範囲で指定してください');
    }
    const vertMix = new FactorLevelChoiceCollection();
    for (const conditionRow of this._conditionRows) {
      const yn = conditionRow.rules[ruleNo];
      if (yn == DTConditionRuleChoice.Yes) {
        vertMix.add(new FactorLevelChoice(conditionRow.factor, conditionRow.item));
      } else if (yn == DTConditionRuleChoice.None) {
        // skip
      } else {
        throw new Error('not implement');
      }
    }
    return vertMix;
  }

  /**
   * 条件の行の中から、データ投入点（targetEntryPoint）となる"条件の行"を抽出する
   *
   * @param ruleNo ルールNo（0～）
   * @param targetEntryPoint データ投入点（事前条件 | 基本フロー）
   * @returns データ投入点の"条件の行"
   */
  getRuleConditionsByEntryPoint(targetEntryPoint: EntryPoint): DTConditionRow[] {
    const epConditionRows: DTConditionRow[] = [];
    for (const conditionRow of this._conditionRows) {
      const ep = this.factorEntryPoint.getEntryPointByFactor(conditionRow.factor);
      if (!ep) {
        // decisionTable は、factorEntryPoint から作成されるので factory から entryPoint が引けない状態はあり得ない
        throw new InvalidArgumentError(`factor: ${conditionRow.factor.id.text} の entryPoint がない`);
      }
      if (ep.equals(targetEntryPoint)) {
        epConditionRows.push(conditionRow);
      }
    }
    return epConditionRows;
  }

  getRuleResults(ruleNo: number): DTResultRow[] {
    if (this.countOfRules <= ruleNo) {
      throw new InvalidArgumentError('ruleNo は 0 から (countOfRules - 1) の範囲で指定してください');
    }
    const vertMix: DTResultRow[] = [];
    for (const resultRow of this._resultRows) {
      const yn = resultRow.rules[ruleNo];
      if (yn == DTResultRuleChoice.Check) {
        vertMix.push(resultRow);
      } else if (yn == DTResultRuleChoice.None) {
        // skip
      } else {
        throw new Error('not implement');
      }
    }
    return vertMix;
  }

  get invalidRules(): string[] {
    return this._invalidRules;
  }
}

export class DecisionTableFactory {
  static getInstance(valiation: Valiation): DecisionTable {
    const dTable = new DecisionTable(valiation.factorEntryPoint);
    const factors = Array.from(valiation.pictCombination.keys());
    for (const factor of factors) {
      const choiceItems = valiation.pictCombination.get(factor);
      if (!choiceItems) {
        throw new InvalidArgumentError();
      }
      const uniqItems = new Set<FactorLevel>();
      for (const item of choiceItems) {
        uniqItems.add(item);
      }
      const sortedChoiceItems: FactorLevel[] = [];
      for (const item of factor.levels) {
        if (uniqItems.has(item)) {
          sortedChoiceItems.push(item);
        }
      }
      for (const sortedChoiceItem of sortedChoiceItems) {
        const row = new DTConditionRow(factor, sortedChoiceItem);
        for (const choiceItem of choiceItems) {
          if (choiceItem == sortedChoiceItem) {
            row.add(DTConditionRuleChoice.Yes);
          } else {
            row.add(DTConditionRuleChoice.None);
          }
        }
        dTable.addCondition(row);
      }
    }
    for (const result of valiation.results) {
      const row = new DTResultRow(result.desc);
      for (let ruleNo = 0; ruleNo < dTable.countOfRules; ruleNo++) {
        const ruleConditions = dTable.getRuleConditions(ruleNo);
        if (ruleConditions.containsAll(result.choices.items)) {
          row.add(DTResultRuleChoice.Check);
        } else {
          row.add(DTResultRuleChoice.None);
        }
      }
      dTable.addResult(row);
    }
    return dTable;
  }
}
