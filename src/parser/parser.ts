import yaml from 'js-yaml';
import fs from 'fs';
import merge from 'ts-deepmerge';
import { AppError, InvalidArgumentError, ParseError } from '../common';
import { App } from '../spec/app';
import { Actor, ActorId } from '../spec/actor';
import { Cache } from '../spec/cache';
import { Glossary, GlossaryId, GlossaryCollection, GlossaryCategory } from '../spec/glossary';
import { Factor, FactorId, FactorItem, FactorItemChoice, FactorItemChoiceCollection } from '../spec/valiation';
import { UseCase, UseCaseId } from '../spec/usecase';
import { Scenario, ScenarioId } from '../spec/scenario';
import { Description, Name, Url, Summary, walkProps } from '../spec/core';
import { PreCondition, PostCondition, PrePostCondition, PrePostConditionId } from '../spec/prepostcondition';
import {
  Flow,
  FlowId,
  AltExFlowCollection,
  AlternateFlow,
  AlternateFlowId,
  ExceptionFlow,
  ExceptionFlowId,
  FlowCollection,
} from '../spec/flow';
import {
  Valiation,
  ValiationId,
  PictConstraint,
  ValiationResult,
  ValiationResultId,
  PictCombiFactory,
} from '../spec/valiation';
import { createContext } from 'vm';

interface IAppProps {
  scenarios: {
    [key: string]: IScenarioProps;
  };
  actors: {
    [key: string]: IActorProps;
  };
  usecases: {
    [key: string]: IUseCaseProps;
  };
  factors: {
    [key: string]: IFactorProps;
  };
  glossaries: {
    [key: string]: {
      [key: string]: IGlossaryProps;
    };
  };
}

interface IActorProps {
  name: string;
}

export interface IUseCaseProps {
  name: string;
  summary: string;
  preConditions: {
    [key: string]: IPrePostConditionProps;
  };
  postConditions: {
    [key: string]: IPrePostConditionProps;
  };
  basicFlows: {
    [key: string]: IFlowProps;
  };
  alternateFlows: {
    [key: string]: IAlternateFlowProps;
  };
  exceptionFlows: {
    [key: string]: IExceptionFlowProps;
  };
  valiations: {
    [key: string]: IValiationProps;
  };
}

interface IPrePostConditionProps {
  description: string;
}

interface IFlowProps {
  playerId: string;
  description: string;
}

interface IAltExFlowProps {
  sourceFlowIds: string[];
  description: string;
  nextFlows: {
    [key: string]: IFlowProps;
  };
}

interface IAlternateFlowProps extends IAltExFlowProps {
  returnFlowId: string;
}

type IExceptionFlowProps = IAltExFlowProps;

interface IValiationProps {
  inputPointIds: string[];
  factorIds: string[];
  pictConstraint: string;
  results: {
    [key: string]: IValiationResultProps;
  };
}

interface IFactorProps {
  name: string;
  items: string[];
}

type FilterFirstOrder = 'arrow' | 'disarrow';

interface IValiationResultProps {
  desc: string;
  order?: FilterFirstOrder; // default: arrow
  arrow?: {
    [key: string]: string[];
  };
  disarrow?: {
    [key: string]: string[];
  };
  altFlowId?: string;
  exFlowId?: string;
}

interface IScenarioProps {
  name: string;
  summary: string;
  usecaseOrder: string[];
}

interface IGlossaryProps {
  name: string;
  category: string;
  desc?: string;
  url?: string;
}

class ParserContext {
  private _path: string[] = [];
  private _stack: string[][] = [];

  get pathText(): string {
    return this._path.join('/');
  }
  push(p: string[]): void {
    this._stack.push(this._path);
    this._path = this._path.concat(p);
  }
  pop(): void {
    const lastPath = this._stack.pop();
    if (!lastPath) {
      throw new InvalidArgumentError('push されていない');
    }
    this._path = lastPath;
  }
}

export function parse(yamlFiles: string[]): App {
  let data = {} as IAppProps;
  for (const yml of yamlFiles) {
    const text = fs.readFileSync(yml, 'utf8');
    const s = yaml.load(text) as Record<string, unknown>;
    data = merge(data, s);
  }

  // ${xxx/yyy} のテキスト置換について補足
  // 最初に ${xxx/yyy} には関係なく、parseApp して参照先となるデータを作成して、
  // そのデータを使って、 data に対して、テキスト置換を行って、 再度 parseApp を実行することで、
  // 置換後のテキストで app オブジェクトを作成する
  const ctx = new ParserContext();
  try {
    let app = parseApp(ctx, data);
    const ucGlossaries = replaceKeyword(ctx, data, app);
    app = parseApp(ctx, data, ucGlossaries);
    return app;
  } catch (e: unknown) {
    let message = 'unknown error';
    if (e instanceof Error) {
      message = e.message;
    }
    throw new ParseError(`ERROR: ${ctx.pathText}: ${message}`);
  }
}

function parseApp(ctx: ParserContext, data: IAppProps, ucGlossaries?: Map<string, Set<Glossary>>): App {
  const actors: Actor[] = parseActor(ctx, data);
  const actorDic = new Cache<Actor>();
  actorDic.addAll(actors);

  const glossaries: GlossaryCollection = parseGlossary(ctx, data);
  const factors: Factor[] = parseFactor(ctx, data);
  const factorDic = new Cache<Factor>();
  factorDic.addAll(factors);

  const usecases: UseCase[] = parseUsecase(ctx, data, actorDic, factorDic, glossaries, ucGlossaries);
  const usecasesDic = new Cache<UseCase>();
  usecasesDic.addAll(usecases);

  const scenarios: Scenario[] = parseScenarios(ctx, data, usecasesDic);

  return new App(actors, usecases, scenarios, glossaries);
}

function parseGlossary(ctx: ParserContext, data: IAppProps): GlossaryCollection {
  ctx.push(['glossaries']);
  const glossaries: Glossary[] = [];
  for (const [cat, glossariesByCat] of Object.entries(data.glossaries)) {
    for (const [id, props] of Object.entries(glossariesByCat)) {
      ctx.push([id]);
      let o: Glossary;
      if (!props) {
        o = new Glossary(new GlossaryId(id), new GlossaryCategory(cat));
      } else {
        o = new Glossary(
          new GlossaryId(id),
          new GlossaryCategory(cat),
          props.name ? new Name(props.name) : undefined,
          props.desc ? new Description(props.desc) : undefined,
          props.url ? new Url(props.url) : undefined
        );
      }
      glossaries.push(o);
      ctx.pop();
    }
  }
  ctx.pop();
  return new GlossaryCollection(glossaries);
}

function parseActor(ctx: ParserContext, data: IAppProps): Actor[] {
  const actors: Actor[] = [];
  ctx.push(['actors']);
  for (const [id, props] of Object.entries(data.actors)) {
    ctx.push([id]);
    const a = new Actor(new ActorId(id), new Name(props.name));
    actors.push(a);
    ctx.pop();
  }
  ctx.pop();
  return actors;
}

function parseFactor(ctx: ParserContext, data: IAppProps): Factor[] {
  const factors: Factor[] = [];
  ctx.push(['factors']);
  for (const [id, props] of Object.entries(data.factors)) {
    ctx.push([id]);
    let name = id;
    if (props.name) {
      name = props.name;
    }
    const items = [];
    for (const item of props.items) {
      ctx.push([item]);
      items.push(new FactorItem(item));
      ctx.pop();
    }
    const o = new Factor(new FactorId(id), new Name(name), items);
    factors.push(o);
    ctx.pop();
  }
  ctx.pop();
  return factors;
}

function parseUsecase(
  ctx: ParserContext,
  data: IAppProps,
  actorDic: Cache<Actor>,
  factorDic: Cache<Factor>,
  glossaries: GlossaryCollection,
  ucGlossaries?: Map<string, Set<Glossary>>
): UseCase[] {
  ctx.push(['usecases']);
  const usecases: UseCase[] = [];
  for (const [id, props] of Object.entries(data.usecases)) {
    ctx.push([id]);
    const preConditions: PreCondition[] = parsePrePostCondition(PreCondition, ctx, props.preConditions);
    const preConditionDic = new Cache<PreCondition>();
    preConditionDic.addAll(preConditions);
    const postConditions: PostCondition[] = parsePrePostCondition(PostCondition, ctx, props.postConditions);
    ctx.push(['basicFlows']);
    const basicFlows: Flow[] = parseBasicFlows(ctx, props.basicFlows, actorDic, glossaries);
    ctx.pop();
    const basicFlowDic = new Cache<Flow>();
    basicFlowDic.addAll(basicFlows);
    const alternateFlows: AltExFlowCollection<AlternateFlow> = parseAlternateFlows(
      ctx,
      props.alternateFlows,
      basicFlowDic,
      actorDic,
      glossaries
    );
    const exceptionFlows: AltExFlowCollection<ExceptionFlow> = parseExceptionFlows(
      ctx,
      props.exceptionFlows,
      basicFlowDic,
      actorDic,
      glossaries
    );

    let glossariesInUc = undefined;
    if (ucGlossaries) {
      const gset = ucGlossaries.get(id);
      if (gset) {
        glossariesInUc = new GlossaryCollection(Array.from(gset));
      }
    }

    const valiations: Valiation[] = parseValiations(
      ctx,
      props.valiations,
      preConditionDic,
      basicFlowDic,
      alternateFlows,
      exceptionFlows,
      factorDic
    );

    const usecase = new UseCase(
      new UseCaseId(id),
      new Name(props.name),
      new Summary(props.summary),
      preConditions,
      postConditions,
      new FlowCollection(basicFlows),
      alternateFlows,
      exceptionFlows,
      valiations,
      glossariesInUc
    );

    usecases.push(usecase);
    ctx.pop();
  }
  ctx.pop();
  return usecases;
}

/*
 * ■ ctor について補足
 * generics で new したい (`a = new T(id, desc);`) ときの HACK である。
 * https://qiita.com/ConquestArrow/items/ace6d926b7e89b8f92d9
 */
function parsePrePostCondition<T extends PrePostCondition>(
  ctor: { new (id: PrePostConditionId, desc: Description): T },
  ctx: ParserContext,
  conditionsProps: Record<string, IPrePostConditionProps>
): T[] {
  const conditions: T[] = [];
  for (const [id, props] of Object.entries(conditionsProps)) {
    const a = new ctor(new PrePostConditionId(id), new Description(props.description));
    conditions.push(a);
  }
  return conditions;
}

function parseBasicFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IFlowProps>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): Flow[] {
  if (!flowPropsArray) {
    throw new ParseError('定義がありません');
  }
  const flows: Flow[] = [];
  for (const [id, props] of Object.entries(flowPropsArray)) {
    ctx.push([id]);
    ctx.push(['playerId']);
    let player: Actor | Glossary | undefined = actorDic.get(new ActorId(props.playerId));
    if (!player) {
      player = glossaries.get(new GlossaryId(props.playerId));
    }
    if (!player) {
      throw new ParseError(
        `${props.playerId} は定義されていません。actors に追加するか、glossary に追加してください。`
      );
    }
    ctx.pop();
    const flow = new Flow(new FlowId(id), new Description(props.description), player);
    flows.push(flow);
    ctx.pop();
  }
  return flows;
}

function parseAlternateFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IAlternateFlowProps>,
  basicFlowDic: Cache<Flow>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): AltExFlowCollection<AlternateFlow> {
  ctx.push(['alternateFlows']);
  const flows: AlternateFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      ctx.push([id]);
      const sourceFlows: Flow[] = [];
      ctx.push(['sourceFlowIds']);
      for (const sourceFlowId of props.sourceFlowIds) {
        const flow = basicFlowDic.get(new FlowId(sourceFlowId));
        if (!flow) {
          throw new ParseError(`${sourceFlowId} は未定義です。`);
        }
        sourceFlows.push(flow);
      }
      ctx.pop();
      ctx.push(['nextFlows']);
      const nextFlows = parseBasicFlows(ctx, props.nextFlows, actorDic, glossaries);
      ctx.pop();
      ctx.push(['returnFlow']);
      const returnFlow = basicFlowDic.get(new FlowId(props.returnFlowId));
      if (!returnFlow) {
        throw new ParseError(`${props.returnFlowId} は未定義です。`);
      }
      ctx.pop();
      const flow = new AlternateFlow(
        new AlternateFlowId(id),
        new Description(props.description),
        sourceFlows,
        new FlowCollection(nextFlows),
        returnFlow
      );
      flows.push(flow);
      ctx.pop();
    }
  }
  const collection = new AltExFlowCollection<AlternateFlow>(flows);
  ctx.pop();
  return collection;
}

function parseExceptionFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IExceptionFlowProps>,
  basicFlowDic: Cache<Flow>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): AltExFlowCollection<ExceptionFlow> {
  ctx.push(['exceptionFlows']);
  const flows: ExceptionFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      ctx.push([id]);
      const sourceFlows: Flow[] = [];
      ctx.push(['sourceFlowIds']);
      for (const sourceFlowId of props.sourceFlowIds) {
        const flow = basicFlowDic.get(new FlowId(sourceFlowId));
        if (!flow) {
          throw new ParseError(`${sourceFlowId} は未定義です。`);
        }
        sourceFlows.push(flow);
      }
      ctx.pop();
      ctx.push(['nextFlows']);
      const nextFlows = parseBasicFlows(ctx, props.nextFlows, actorDic, glossaries);
      ctx.pop();
      const flow = new ExceptionFlow(
        new ExceptionFlowId(id),
        new Description(props.description),
        sourceFlows,
        new FlowCollection(nextFlows)
      );
      flows.push(flow);
      ctx.pop();
    }
  }
  ctx.pop();
  return new AltExFlowCollection<ExceptionFlow>(flows);
}

function parseValiations(
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

function parseScenarios(ctx: ParserContext, data: IAppProps, usecasesDic: Cache<UseCase>): Scenario[] {
  ctx.push(['scenarios']);
  const sescenarios: Scenario[] = [];
  if (data.scenarios) {
    for (const [id, scenario] of Object.entries(data.scenarios)) {
      ctx.push([id]);
      const usecases: UseCase[] = [];
      ctx.push(['usecaseOrder']);
      for (const usecaseId of scenario.usecaseOrder) {
        ctx.push([usecaseId]);
        const u = usecasesDic.get(new UseCaseId(usecaseId));
        if (!u) {
          throw new ParseError(`${usecaseId} は usecases の中に見つかりません`);
        }
        usecases.push(u);
        ctx.pop();
      }
      ctx.pop();
      const o = new Scenario(new ScenarioId(id), new Name(scenario.name), new Summary(scenario.summary), usecases);
      sescenarios.push(o);
      ctx.pop();
    }
  }
  ctx.pop();
  return sescenarios;
}

function replaceKeyword(ctx: ParserContext, data: IAppProps, app: App): Map<string, Set<Glossary>> {
  const ucGlossaries = new Map<string, Set<Glossary>>();
  // ${xxx/yyy} を探して置換する
  const regexp = /\$\{([^${}]+)\}/;
  walkProps(
    <Record<string, unknown>>(data as unknown),
    [],
    function (obj: Record<string, unknown>, path: string[], name: string, val: unknown): void {
      if (typeof val !== 'string') {
        return;
      }
      ctx.push(path);
      let text = val;
      let matches;
      do {
        matches = text.match(regexp);
        if (!matches) {
          break;
        }
        const keyword = matches[0];
        let category = undefined;
        let term = matches[1];
        if (matches['index'] == undefined) {
          throw new ParseError("matches['index'] がない状態は、regexp が変更された状態が考えられます");
        }
        const pos = term.indexOf('/');
        if (pos >= 0) {
          category = term.substring(0, pos);
          term = term.substring(pos + 1);
        }
        const glossary = app.getGlossary(new GlossaryId(term), category ? new GlossaryCategory(category) : undefined);
        if (!glossary) {
          throw new ParseError(`${keyword} は、glossaries に未定義です`);
        }
        appendUcGlossary(ucGlossaries, glossary, app, path, name);
        const index: number = matches['index'];
        const prefix = text.substring(0, index);
        const sufix = text.substring(index + matches[0].length);
        const replacement = `[${glossary.id.text}][]`;
        text = `${prefix}${replacement}${sufix}`;
      } while (matches);
      if (name == 'playerId') {
        const actor = app.getActor(new ActorId(val));
        if (!actor) {
          const glossary = app.getGlossary(new GlossaryId(val));
          if (glossary) {
            appendUcGlossary(ucGlossaries, glossary, app, path, name);
          }
        }
      }
      obj[name] = text;
      ctx.pop();
    }
  );
  return ucGlossaries;
}

function appendUcGlossary(
  ucGlossaries: Map<string, Set<Glossary>>,
  glossary: Glossary,
  app: App,
  path: string[],
  name: string
) {
  if (path[0] == 'usecases') {
    const ucId = path[1];
    const uc = app.getUseCase(new UseCaseId(ucId));
    if (!uc) {
      const errPathText = path.concat([name]).join('/');
      //  path の使われ方が変わったりするとエラーになる
      throw new ParseError(`${errPathText} ユースケースが見つからない`);
    }
    let gset = ucGlossaries.get(ucId);
    if (!gset) {
      gset = new Set<Glossary>();
      ucGlossaries.set(ucId, gset);
    }
    gset.add(glossary);
  }
}
