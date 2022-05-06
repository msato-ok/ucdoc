import { ValidationError, InvalidArgumentError } from '../common';
import {
  Factor,
  FactorLevel,
  EntryPoint,
  FactorEntryPoint,
  FactorLevelChoice,
  FactorLevelChoiceCollection,
  Valiation,
  ValiationResult,
  ValiationResultCollection,
  PictFactory,
  Pict,
} from './valiation';
import { AlternateFlow, ExceptionFlow } from './flow';

export class DTValidationError extends ValidationError {}

export const DTConditionRuleChoice = {
  Yes: 'Y',
  No: 'N',
  None: 'None',
} as const;
export type DTConditionRuleChoice = typeof DTConditionRuleChoice[keyof typeof DTConditionRuleChoice];

export class DTConditionRow {
  private _choices: DTConditionRuleChoice[] = [];

  constructor(readonly factor: Factor, readonly level: FactorLevel) {}

  get countOfRules(): number {
    return this._choices.length;
  }

  get rules(): DTConditionRuleChoice[] {
    return this._choices;
  }

  add(rule: DTConditionRuleChoice) {
    this._choices.push(rule);
  }
}

export const DTResultRuleChoice = {
  Check: 'X',
  None: 'None',
} as const;
type DTResultRuleChoice = typeof DTResultRuleChoice[keyof typeof DTResultRuleChoice];

export class DTResultRow {
  private _choices: DTResultRuleChoice[] = [];

  constructor(readonly result: ValiationResult) {}

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
  private _invalidRuleMessages: string[] = [];
  private _invalidRuleNos: number[] = [];
  private _validated = false;

  constructor(private factorEntryPoint: FactorEntryPoint) {}

  validate(): void {
    this._validated = true;
    this._invalidRuleMessages = [];
    this._invalidRuleNos = [];
    for (let ruleNo = 0; ruleNo < this.countOfRules; ruleNo++) {
      const ruleRows = this.getRuleResults(ruleNo);
      if (ruleRows.length == 0) {
        this._invalidRuleMessages.push(`ruleNo=${ruleNo + 1} の期待値となる結果が1つもありません`);
        this._invalidRuleNos.push(ruleNo);
      }
    }
    if (this._invalidRuleMessages.length > 0) {
      const errmsg = [
        `${this._invalidRuleMessages.join('\n')}`,
        '※ ruleNoはデシジョンテーブルを作成して確認してください。',
        'usage: ucdoc decision <file> [otherFiles...]',
      ].join('\n');
      throw new DTValidationError(errmsg);
    }
  }

  get countOfRules(): number {
    if (this._conditionRows.length == 0) {
      return 0;
    }
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
    this._validated = false;
    this._conditionRows.push(row);
  }

  addResult(row: DTResultRow) {
    this._validated = false;
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
        vertMix.add(new FactorLevelChoice(conditionRow.factor, conditionRow.level));
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

  get invalidRuleMessages(): string[] {
    return this._invalidRuleMessages;
  }

  get invalidRuleNos(): number[] {
    return this._invalidRuleNos;
  }

  /**
   * 結果検証される因子水準の組み合わせを抽出する
   *
   * 因子水準の組み合わせでテストを実行しても、検証方法が不明なものは除外する。
   * （resultRow のどの rule にも拾い上げられない因子水準は除外される）
   *
   * @returns 因子水準のリスト
   */
  getUsedFactorLevels(): FactorLevelChoiceCollection {
    if (!this._validated) {
      throw new InvalidArgumentError('validate() が実行されていません');
    }
    const used = new FactorLevelChoiceCollection();
    const safeRules = [...Array(this.countOfRules)].map((_: undefined, idx: number) => idx);
    for (const ruleNo of this.invalidRuleNos) {
      const i = safeRules.indexOf(ruleNo);
      safeRules.splice(i, 1);
    }
    for (const conditionRow of this.conditionRows) {
      for (const ruleNo of safeRules) {
        if (conditionRow.rules[ruleNo] == DTConditionRuleChoice.Yes) {
          const choice = new FactorLevelChoice(conditionRow.factor, conditionRow.level);
          if (!used.contains(choice)) {
            used.add(choice);
          }
        } else if (conditionRow.rules[ruleNo] == DTConditionRuleChoice.No) {
          throw new InvalidArgumentError('not implements');
        } else if (conditionRow.rules[ruleNo] == DTConditionRuleChoice.None) {
          continue;
        } else {
          throw new InvalidArgumentError(`unknown rule choice: ${conditionRow.rules[ruleNo]}`);
        }
      }
    }
    return used;
  }
}

export class DecisionTableFactory {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  private static recreateCount = 0;

  static getInstance(valiation: Valiation): DecisionTable {
    const dTable = new DecisionTable(valiation.factorEntryPoint);
    const factors = Array.from(valiation.pict.factors);
    for (const factor of factors) {
      const choiceLevels = valiation.pict.getLevels(factor);
      if (!choiceLevels) {
        throw new InvalidArgumentError();
      }
      const uniqLevels = new Set<FactorLevel>();
      for (const level of choiceLevels) {
        uniqLevels.add(level);
      }
      const sortedChoiceLevels: FactorLevel[] = [];
      for (const level of factor.levels) {
        if (uniqLevels.has(level)) {
          sortedChoiceLevels.push(level);
        }
      }
      for (const sortedChoiceLevel of sortedChoiceLevels) {
        const row = new DTConditionRow(factor, sortedChoiceLevel);
        for (const choiceLevel of choiceLevels) {
          if (choiceLevel == sortedChoiceLevel) {
            row.add(DTConditionRuleChoice.Yes);
          } else {
            row.add(DTConditionRuleChoice.None);
          }
        }
        dTable.addCondition(row);
      }
    }
    for (const result of valiation.results.items) {
      const row = new DTResultRow(result);
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

  /**
   * 結果検証で使用されている因子だけで Valiation を再構成して
   *
   * @param orgValiation //
   * @param filterdResults
   * @returns
   */
  static _recreateFromVerificationPoint(
    orgValiation: Valiation,
    orgFactorEntryPoint: FactorEntryPoint,
    pict: Pict,
    filterdResults: ValiationResultCollection
  ): DecisionTable {
    if (++this.recreateCount > 2) {
      throw new InvalidArgumentError(`infinite loop: ${this.recreateCount}`);
    }
    let factorEntryPoint = orgFactorEntryPoint.copy();
    const valiation = new Valiation(orgValiation.id, orgValiation.description, factorEntryPoint, pict, filterdResults);
    const dt = DecisionTableFactory.getInstance(valiation);
    try {
      dt.validate();
      return dt;
    } catch (e) {
      if (dt.invalidRuleNos.length === 0) {
        throw e;
      }
    }
    const usedChoices = dt.getUsedFactorLevels();
    const newFactors = usedChoices.regenerateFactors();
    factorEntryPoint = factorEntryPoint.regenarateFromFactors(newFactors);
    pict = PictFactory.getInstance(factorEntryPoint, pict.pictConstraint);
    return this._recreateFromVerificationPoint(orgValiation, factorEntryPoint, pict, filterdResults);
  }

  static getBasicFlowInstance(orgValiation: Valiation): DecisionTable | undefined {
    this.recreateCount = 0;
    const filterdResults = orgValiation.results.getPostCondiVerificationItems();
    if (filterdResults.size == 0) {
      return undefined;
    }
    return this._recreateFromVerificationPoint(
      orgValiation,
      orgValiation.factorEntryPoint,
      orgValiation.pict,
      filterdResults
    );
  }

  static getAlternateFlowInstance(orgValiation: Valiation, altFlow: AlternateFlow): DecisionTable | undefined {
    this.recreateCount = 0;
    const filterdResults = orgValiation.results.getAltVerificationItems(altFlow);
    if (filterdResults.size == 0) {
      return undefined;
    }
    return this._recreateFromVerificationPoint(
      orgValiation,
      orgValiation.factorEntryPoint,
      orgValiation.pict,
      filterdResults
    );
  }

  static getExceptionFlowInstance(orgValiation: Valiation, exFlow: ExceptionFlow): DecisionTable | undefined {
    this.recreateCount = 0;
    const filterdResults = orgValiation.results.getExVerificationItems(exFlow);
    if (filterdResults.size == 0) {
      return undefined;
    }
    return this._recreateFromVerificationPoint(
      orgValiation,
      orgValiation.factorEntryPoint,
      orgValiation.pict,
      filterdResults
    );
  }
}
