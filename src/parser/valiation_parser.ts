import { ParserContext, IValiationProps, IValiationResultProps } from './parser';
import { ParseError } from '../common';
import { Cache } from '../spec/cache';
import { Factor, FactorId, FactorItem, FactorItemChoice, FactorItemChoiceCollection } from '../spec/valiation';
import { Description } from '../spec/core';
import { PreCondition, PrePostConditionId } from '../spec/prepostcondition';
import { Flow, FlowId, AltExFlowCollection, AlternateFlow, ExceptionFlow } from '../spec/flow';
import {
  Valiation,
  ValiationId,
  PictConstraint,
  ValiationResult,
  ValiationResultId,
  PictCombiFactory,
} from '../spec/valiation';

export function parseValiations(
  ctx: ParserContext,
  valiationPropsArray: Record<string, IValiationProps>,
  preConditionDic: Cache<PreCondition>,
  basicFlowDic: Cache<Flow>,
  alternateFlows: AltExFlowCollection<AlternateFlow>,
  exceptionFlows: AltExFlowCollection<ExceptionFlow>,
  factorDic: Cache<Factor>
): Valiation[] {
  ctx.push(['valiations']);
  const valiations: Valiation[] = [];
  if (valiationPropsArray) {
    for (const [id, props] of Object.entries(valiationPropsArray)) {
      ctx.push([id]);
      const sourceFlows: Flow[] = [];
      const sourcePreConds: PreCondition[] = [];
      ctx.push(['inputPointIds']);
      for (const id of props.inputPointIds) {
        ctx.push([id]);
        const cond = preConditionDic.get(new PrePostConditionId(id));
        const flow = basicFlowDic.get(new FlowId(id));
        if (cond) {
          sourcePreConds.push(cond);
        } else if (flow) {
          sourceFlows.push(flow);
        } else {
          throw new ParseError('preConditions および basicFlows に未定義です。');
        }
        ctx.pop();
      }
      if (sourcePreConds.length == 0 && sourceFlows.length == 0) {
        throw new ParseError('inputPointIds が未定義です。');
      }
      ctx.pop();
      const factors = [];
      const factorInValiation = new Cache<Factor>();
      ctx.push(['factorIds']);
      for (const factorId of props.factorIds) {
        ctx.push([factorId]);
        const factor = factorDic.get(new FactorId(factorId));
        if (!factor) {
          throw new ParseError(`${factorId} は factors に未定義です。`);
        }
        factors.push(factor);
        factorInValiation.add(factor);
        ctx.pop();
      }
      ctx.pop();
      const results = [];
      ctx.push(['results']);
      for (const [resultId, resultProps] of Object.entries(props.results)) {
        const vr = parseValiationResult(ctx, resultId, resultProps, alternateFlows, exceptionFlows, factorInValiation);
        results.push(vr);
      }
      ctx.pop();
      const pictCombi = PictCombiFactory.getInstance(factors);
      const valiation = new Valiation(
        new ValiationId(id),
        sourceFlows,
        factors,
        new PictConstraint(props.pictConstraint),
        pictCombi,
        results,
        false
      );
      if (valiation.invalidRules.length > 0) {
        const errmsg = [
          `${valiation.invalidRules.join('\n')}`,
          '※ ruleNoはデシジョンテーブルのmdを作成して確認してください。',
          'usage: ucdoc decision <file> [otherFiles...]',
        ].join('\n');
        console.warn(`WARN: ${ctx.pathText}: ${errmsg}`);
      }
      valiations.push(valiation);
      ctx.pop();
    }
  }
  ctx.pop();
  return valiations;
}

function parseValiationResult(
  ctx: ParserContext,
  resultId: string,
  resultProps: IValiationResultProps,
  alternateFlows: AltExFlowCollection<AlternateFlow>,
  exceptionFlows: AltExFlowCollection<ExceptionFlow>,
  factorInValiation: Cache<Factor>
): ValiationResult {
  ctx.push([resultId]);
  const choices = new FactorItemChoiceCollection();
  for (const factor of factorInValiation.values()) {
    choices.addAll(factor);
  }
  ctx.push(['arrow']);
  let arrows;
  if (resultProps.arrow) {
    arrows = parseFactorItemChoiceCollection(ctx, factorInValiation, resultProps.arrow);
  } else {
    arrows = choices.copy();
  }
  ctx.pop();
  ctx.push(['disarrow']);
  let disarrows;
  if (resultProps.disarrow) {
    disarrows = parseFactorItemChoiceCollection(ctx, factorInValiation, resultProps.disarrow);
  } else {
    disarrows = new FactorItemChoiceCollection();
  }
  ctx.pop();
  const order = resultProps.order ? resultProps.order : 'arrow';
  if (order == 'arrow') {
    ctx.push(['arrow']);
    choices.arrow(arrows);
    ctx.pop();
    ctx.push(['disarrow']);
    choices.disarrow(disarrows);
    ctx.pop();
  } else {
    ctx.push(['disarrow']);
    choices.disarrow(disarrows);
    ctx.pop();
    ctx.push(['arrow']);
    choices.arrow(arrows);
    ctx.pop();
  }
  ctx.push(['altFlowId']);
  let altFlow: AlternateFlow | undefined = undefined;
  if (resultProps.altFlowId) {
    altFlow = alternateFlows.get(resultProps.altFlowId);
    if (!altFlow) {
      throw new ParseError(`${resultProps.altFlowId} は alternateFlows に未定義です。`);
    }
  }
  ctx.pop();
  ctx.push(['exFlowId']);
  let exFlow: ExceptionFlow | undefined = undefined;
  if (resultProps.exFlowId) {
    exFlow = exceptionFlows.get(resultProps.exFlowId);
    if (!exFlow) {
      throw new ParseError(`${resultProps.exFlowId} は exceptionFlows に未定義です。`);
    }
  }
  ctx.pop();
  const results = new ValiationResult(
    new ValiationResultId(resultId),
    new Description(resultProps.desc),
    choices,
    altFlow,
    exFlow
  );
  ctx.pop();
  return results;
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
    ctx.push([factorId]);
    const factor = factorInValiation.get(factorId);
    if (!factor) {
      throw new ParseError(`${factorId} は factorIds の中で未定義です。`);
    }
    for (const item of factorItems) {
      ctx.push([item]);
      const itemObj = new FactorItem(item);
      if (!factor.existsItem(itemObj)) {
        throw new ParseError(`${item} は factors/${factorId}/items の中で未定義です。`);
      }
      const choice = new FactorItemChoice(factor, itemObj);
      adChoices.add(choice);
      ctx.pop();
    }
    ctx.pop();
  }
  return adChoices;
}
