import { ParserContext, IValiationProps, IValiationResultProps } from './parser';
import { ParseError } from '../common';
import { Cache } from '../spec/cache';
import { Description } from '../spec/core';
import { PreCondition, PrePostConditionId, PostCondition } from '../spec/prepostcondition';
import { Flow, FlowId, AltExFlowCollection, AlternateFlow, ExceptionFlow, FlowCollection } from '../spec/flow';
import {
  Valiation,
  ValiationId,
  PictConstraint,
  ValiationResult,
  ValiationResultId,
  PictCombiFactory,
  Factor,
  FactorId,
  FactorItem,
  FactorItemChoice,
  FactorItemChoiceCollection,
  FactorEntryPoint,
  EntryPoint,
  VerificationPoint,
} from '../spec/valiation';
import { DecisionTableFactory } from '../spec/decision_table';

export function parseValiations(
  ctx: ParserContext,
  valiationPropsArray: Record<string, IValiationProps>,
  preConditionDic: Cache<PreCondition>,
  postConditionDic: Cache<PostCondition>,
  basicFlows: FlowCollection,
  alternateFlows: AltExFlowCollection<AlternateFlow>,
  exceptionFlows: AltExFlowCollection<ExceptionFlow>,
  factorDic: Cache<Factor>,
  strictValidation: boolean
): Valiation[] {
  const basicFlowDic = new Cache<Flow>();
  basicFlowDic.addAll(basicFlows.items);

  ctx.push('valiations');
  const valiations: Valiation[] = [];
  if (valiationPropsArray) {
    for (const [id, props] of Object.entries(valiationPropsArray)) {
      ctx.push(id);
      const sourceFlows: Flow[] = [];
      const sourcePreConds: PreCondition[] = [];
      const factorEntryPoint = new FactorEntryPoint();
      const factorInValiation = new Cache<Factor>();
      ctx.push('factorEntryPoints');
      for (const [entryPointId, entryFactorsProps] of Object.entries(props.factorEntryPoints)) {
        ctx.push(entryPointId);
        let entryPoint: EntryPoint | undefined = preConditionDic.get(new PrePostConditionId(entryPointId));
        if (entryPoint) {
          sourcePreConds.push(entryPoint);
        }
        if (!entryPoint) {
          entryPoint = basicFlowDic.get(new FlowId(entryPointId));
          if (entryPoint) {
            sourceFlows.push(entryPoint);
          }
        }
        if (!entryPoint) {
          throw new ParseError(`${entryPointId} は preConditions および basicFlows に未定義です。`);
        }
        for (const factorId of entryFactorsProps.factors) {
          const factor = factorDic.get(new FactorId(factorId));
          if (!factor) {
            throw new ParseError(`${factorId} は factors に未定義です。`);
          }
          factorEntryPoint.add(entryPoint, [factor]);
          factorInValiation.add(factor);
        }
        ctx.pop(entryPointId);
      }
      if (sourcePreConds.length == 0 && sourceFlows.length == 0) {
        throw new ParseError('factorEntryPoints が未定義です。');
      }
      ctx.pop('factorEntryPoints');
      const results = [];
      ctx.push('results');
      for (const [resultId, resultProps] of Object.entries(props.results)) {
        const vr = parseValiationResult(
          ctx,
          resultId,
          resultProps,
          postConditionDic,
          alternateFlows,
          exceptionFlows,
          factorInValiation
        );
        results.push(vr);
      }
      ctx.pop('results');
      const pictCombi = PictCombiFactory.getInstance(factorEntryPoint.factors);
      const valiation = new Valiation(
        new ValiationId(id),
        sourceFlows,
        factorEntryPoint,
        new PictConstraint(props.pictConstraint),
        pictCombi,
        results,
        strictValidation
      );
      const dt = DecisionTableFactory.getInstance(valiation);
      try {
        dt.validate();
      } catch (e) {
        if (!strictValidation && dt.invalidRules.length > 0) {
          const errmsg = [
            `${dt.invalidRules.map(x => `  - ${x}`).join('\n')}`,
            '  ※ ruleNoはデシジョンテーブルのmdを作成して確認してください。',
            '  usage: ucdoc decision <file> [otherFiles...]',
          ].join('\n');
          console.warn(`WARN: ${ctx.pathText}:\n${errmsg}`);
        }
      }
      valiations.push(valiation);
      ctx.pop(id);
    }
  }
  ctx.pop('valiations');
  return valiations;
}

function parseValiationResult(
  ctx: ParserContext,
  resultId: string,
  resultProps: IValiationResultProps,
  postConditionDic: Cache<PostCondition>,
  alternateFlows: AltExFlowCollection<AlternateFlow>,
  exceptionFlows: AltExFlowCollection<ExceptionFlow>,
  factorInValiation: Cache<Factor>
): ValiationResult {
  ctx.push(resultId);
  const choices = new FactorItemChoiceCollection();
  for (const factor of factorInValiation.values()) {
    choices.addAll(factor);
  }
  ctx.push('arrow');
  let arrows;
  if (resultProps.arrow) {
    arrows = parseFactorItemChoiceCollection(ctx, factorInValiation, resultProps.arrow);
  } else {
    arrows = choices.copy();
  }
  ctx.pop('arrow');
  ctx.push('disarrow');
  let disarrows;
  if (resultProps.disarrow) {
    disarrows = parseFactorItemChoiceCollection(ctx, factorInValiation, resultProps.disarrow);
  } else {
    disarrows = new FactorItemChoiceCollection();
  }
  ctx.pop('disarrow');
  const order = resultProps.order ? resultProps.order : 'arrow';
  if (order == 'arrow') {
    ctx.push('arrow');
    choices.arrow(arrows);
    ctx.pop('arrow');
    ctx.push('disarrow');
    choices.disarrow(disarrows);
    ctx.pop('disarrow');
  } else {
    ctx.push('disarrow');
    choices.disarrow(disarrows);
    ctx.pop('disarrow');
    ctx.push('arrow');
    choices.arrow(arrows);
    ctx.pop('arrow');
  }
  ctx.push('verificationPointIds');
  if (!resultProps.verificationPointIds) {
    throw new ParseError('verificationPointIds の定義は必須です。');
  }
  const verificationPoints: VerificationPoint[] = [];
  for (const id of resultProps.verificationPointIds) {
    let verificationPoint: VerificationPoint | undefined = postConditionDic.get(id);
    if (!verificationPoint) {
      verificationPoint = alternateFlows.get(id);
    }
    if (!verificationPoint) {
      verificationPoint = exceptionFlows.get(id);
    }
    if (!verificationPoint) {
      throw new ParseError(`${id} は postConditions, alternateFlows, exceptionFlows に未定義です。`);
    }
    verificationPoints.push(verificationPoint);
  }
  ctx.pop('verificationPointIds');
  const result = new ValiationResult(
    new ValiationResultId(resultId),
    new Description(resultProps.desc),
    choices,
    verificationPoints
  );
  ctx.pop(resultId);
  return result;
}

function parseFactorItemChoiceCollection(
  ctx: ParserContext,
  factorInValiation: Cache<Factor>,
  ad?: { [key: string]: string[] }
): FactorItemChoiceCollection {
  const adChoices = new FactorItemChoiceCollection();
  if (!ad) {
    return adChoices;
  }
  for (const [factorId, factorItems] of Object.entries(ad)) {
    ctx.push(factorId);
    const factor = factorInValiation.get(factorId);
    if (!factor) {
      throw new ParseError(`${factorId} は factors の中で未定義です。`);
    }
    for (const item of factorItems) {
      ctx.push(item);
      const itemObj = new FactorItem(item);
      if (!factor.existsItem(itemObj)) {
        throw new ParseError(`${item} は factors/${factorId}/items の中で未定義です。`);
      }
      const choice = new FactorItemChoice(factor, itemObj);
      adChoices.add(choice);
      ctx.pop(item);
    }
    ctx.pop(factorId);
  }
  return adChoices;
}
