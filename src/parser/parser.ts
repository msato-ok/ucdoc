import yaml from 'js-yaml';
import fs from 'fs';
import merge from 'ts-deepmerge';
import { ParseError } from '../common';
import { App } from '../spec/app';
import { Actor, ActorId } from '../spec/actor';
import { Cache } from '../spec/cache';
import { Glossary, GlossaryId, GlossaryCollection, GlossaryCategory } from '../spec/glossary';
import { Factor, FactorId, FactorItem, FactorPattern } from '../spec/valiation';
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
  AbstractAltExFlow,
} from '../spec/flow';
import {
  Valiation,
  ValiationId,
  PictConstraint,
  ValiationResult,
  ValiationResultId,
  ResultType,
  PictCombiFactory,
} from '../spec/valiation';

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

interface IValiationResultProps {
  resultType: string;
  patterns?: {
    [key: string]: string[];
  };
  moveFlowId: string;
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
  let app = parseApp(data);
  const ucGlossaries = replaceKeyword(data, app);
  app = parseApp(data, ucGlossaries);
  return app;
}

function parseApp(data: IAppProps, ucGlossaries?: Map<string, Set<Glossary>>): App {
  const actors: Actor[] = parseActor(data);
  const actorDic = new Cache<Actor>();
  actorDic.addAll(actors);

  const glossaries: GlossaryCollection = parseGlossary(data);
  const factors: Factor[] = parseFactor(data);
  const factorDic = new Cache<Factor>();
  factorDic.addAll(factors);

  const usecases: UseCase[] = parseUsecase(data, actorDic, factorDic, glossaries, ucGlossaries);
  const usecasesDic = new Cache<UseCase>();
  usecasesDic.addAll(usecases);

  const scenarios: Scenario[] = parseScenarios(data, usecasesDic);

  return new App(actors, usecases, scenarios, glossaries);
}

function parseGlossary(data: IAppProps): GlossaryCollection {
  const glossaries: Glossary[] = [];
  for (const [cat, glossariesByCat] of Object.entries(data.glossaries)) {
    for (const [id, props] of Object.entries(glossariesByCat)) {
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
    }
  }
  return new GlossaryCollection(glossaries);
}

function parseActor(data: IAppProps): Actor[] {
  const actors: Actor[] = [];
  for (const [id, props] of Object.entries(data.actors)) {
    const a = new Actor(new ActorId(id), new Name(props.name));
    actors.push(a);
  }
  return actors;
}

function parseFactor(data: IAppProps): Factor[] {
  const factors: Factor[] = [];
  for (const [id, props] of Object.entries(data.factors)) {
    let name = id;
    if (props.name) {
      name = props.name;
    }
    const items = [];
    for (const item of props.items) {
      items.push(new FactorItem(item));
    }
    const o = new Factor(new FactorId(id), new Name(name), items);
    factors.push(o);
  }
  return factors;
}

function parseUsecase(
  data: IAppProps,
  actorDic: Cache<Actor>,
  factorDic: Cache<Factor>,
  glossaries: GlossaryCollection,
  ucGlossaries?: Map<string, Set<Glossary>>
): UseCase[] {
  const basePath = ['usecases'];
  const usecases: UseCase[] = [];
  for (const [id, props] of Object.entries(data.usecases)) {
    const path = basePath.concat([id]);
    const preConditions: PreCondition[] = parsePrePostCondition(PreCondition, props.preConditions);
    const preConditionDic = new Cache<PreCondition>();
    preConditionDic.addAll(preConditions);
    const postConditions: PostCondition[] = parsePrePostCondition(PostCondition, props.postConditions);
    const basicFlows: Flow[] = parseBasicFlows(path.concat(['basicFlows']), props.basicFlows, actorDic, glossaries);
    const basicFlowDic = new Cache<Flow>();
    basicFlowDic.addAll(basicFlows);
    const alternateFlows: AltExFlowCollection<AlternateFlow> = parseAlternateFlows(
      path.concat(['alternateFlows']),
      props.alternateFlows,
      basicFlowDic,
      actorDic,
      glossaries
    );
    const exceptionFlows: AltExFlowCollection<ExceptionFlow> = parseExceptionFlows(
      path.concat(['exceptionFlows']),
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
      path.concat(['valiations']),
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
  }
  return usecases;
}

/*
 * ■ ctor について補足
 * generics で new したい (`a = new T(id, desc);`) ときの HACK である。
 * https://qiita.com/ConquestArrow/items/ace6d926b7e89b8f92d9
 */
function parsePrePostCondition<T extends PrePostCondition>(
  ctor: { new (id: PrePostConditionId, desc: Description): T },
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
  path: string[],
  flowPropsArray: Record<string, IFlowProps>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): Flow[] {
  if (!flowPropsArray) {
    const errPathText = path.join('/');
    throw new ParseError(`${errPathText} がありません`);
  }
  const flows: Flow[] = [];
  for (const [id, props] of Object.entries(flowPropsArray)) {
    const currPath = path.concat([id]);
    let player: Actor | Glossary | undefined = actorDic.get(new ActorId(props.playerId));
    if (!player) {
      player = glossaries.get(new GlossaryId(props.playerId));
    }
    if (!player) {
      const errPathText = currPath.concat(['playerId']).join('/');
      throw new ParseError(
        `${errPathText} の ${props.playerId} は定義されていません。actors に追加するか、glossary に追加してください。`
      );
    }
    const flow = new Flow(new FlowId(id), new Description(props.description), player);
    flows.push(flow);
  }
  return flows;
}

function parseAlternateFlows(
  path: string[],
  flowPropsArray: Record<string, IAlternateFlowProps>,
  basicFlowDic: Cache<Flow>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): AltExFlowCollection<AlternateFlow> {
  const flows: AlternateFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      const currPath = path.concat([id]);
      const sourceFlows: Flow[] = [];
      for (const sourceFlowId of props.sourceFlowIds) {
        const flow = basicFlowDic.get(new FlowId(sourceFlowId));
        if (!flow) {
          const errPathText = currPath.concat(['sourceFlowIds']).join('/');
          throw new ParseError(`${errPathText} の ${sourceFlowId} は未定義です。`);
        }
        sourceFlows.push(flow);
      }
      const nextFlows = parseBasicFlows(path.concat(['nextFlows']), props.nextFlows, actorDic, glossaries);
      const returnFlow = basicFlowDic.get(new FlowId(props.returnFlowId));
      if (!returnFlow) {
        const errPathText = currPath.concat(['returnFlow']).join('/');
        throw new ParseError(`${errPathText} の ${props.returnFlowId} は未定義です。`);
      }
      const flow = new AlternateFlow(
        new AlternateFlowId(id),
        new Description(props.description),
        sourceFlows,
        new FlowCollection(nextFlows),
        returnFlow
      );
      flows.push(flow);
    }
  }
  return new AltExFlowCollection<AlternateFlow>(flows);
}

function parseExceptionFlows(
  path: string[],
  flowPropsArray: Record<string, IExceptionFlowProps>,
  basicFlowDic: Cache<Flow>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): AltExFlowCollection<ExceptionFlow> {
  const flows: ExceptionFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      const currPath = path.concat([id]);
      const sourceFlows: Flow[] = [];
      for (const sourceFlowId of props.sourceFlowIds) {
        const flow = basicFlowDic.get(new FlowId(sourceFlowId));
        if (!flow) {
          const errPathText = currPath.concat(['sourceFlowIds']).join('/');
          throw new ParseError(`${errPathText} の ${sourceFlowId} は未定義です。`);
        }
        sourceFlows.push(flow);
      }
      const nextFlows = parseBasicFlows(currPath.concat(['nextFlows']), props.nextFlows, actorDic, glossaries);
      const flow = new ExceptionFlow(
        new ExceptionFlowId(id),
        new Description(props.description),
        sourceFlows,
        new FlowCollection(nextFlows)
      );
      flows.push(flow);
    }
  }
  return new AltExFlowCollection<ExceptionFlow>(flows);
}

function parseValiations(
  path: string[],
  valiationPropsArray: Record<string, IValiationProps>,
  preConditionDic: Cache<PreCondition>,
  basicFlowDic: Cache<Flow>,
  alternateFlows: AltExFlowCollection<AlternateFlow>,
  exceptionFlows: AltExFlowCollection<ExceptionFlow>,
  factorDic: Cache<Factor>
): Valiation[] {
  const valiations: Valiation[] = [];
  if (valiationPropsArray) {
    for (const [id, props] of Object.entries(valiationPropsArray)) {
      const currPath = path.concat([id]);
      const sourceFlows: Flow[] = [];
      const sourcePreConds: PreCondition[] = [];
      for (const id of props.inputPointIds) {
        const cond = preConditionDic.get(new PrePostConditionId(id));
        if (cond) {
          sourcePreConds.push(cond);
        }
        const flow = basicFlowDic.get(new FlowId(id));
        if (flow) {
          sourceFlows.push(flow);
        }
      }
      if (sourcePreConds.length == 0 && sourceFlows.length == 0) {
        const errPathText = currPath.concat(['inputPointIds']).join('/');
        throw new ParseError(`${errPathText} の ${id} は preConditions および basicFlows に未定義です。`);
      }
      const factors = [];
      const factorInValiation = new Cache<Factor>();
      for (const factorId of props.factorIds) {
        const factor = factorDic.get(new FactorId(factorId));
        if (!factor) {
          const errPathText = currPath.concat(['factorIds']).join('/');
          throw new ParseError(`${errPathText} の ${factorId} は未定義です。`);
        }
        factors.push(factor);
        factorInValiation.add(factor);
      }
      const results = [];
      for (const [resultId, resultProps] of Object.entries(props.results)) {
        const vr = parseValiationResult(
          currPath,
          resultId,
          resultProps,
          basicFlowDic,
          alternateFlows,
          exceptionFlows,
          factorInValiation
        );
        results.push(vr);
      }
      const pictCombi = PictCombiFactory.getInstance(factors);
      const valiation = new Valiation(
        new ValiationId(id),
        sourceFlows,
        factors,
        new PictConstraint(props.pictConstraint),
        pictCombi,
        results
      );
      valiations.push(valiation);
    }
  }
  return valiations;
}

function parseValiationResult(
  path: string[],
  resultId: string,
  resultProps: IValiationResultProps,
  basicFlowDic: Cache<Flow>,
  alternateFlows: AltExFlowCollection<AlternateFlow>,
  exceptionFlows: AltExFlowCollection<ExceptionFlow>,
  factorInValiation: Cache<Factor>
): ValiationResult {
  const patterns = [];
  if (resultProps.patterns) {
    for (const [factorId, factorItems] of Object.entries(resultProps.patterns)) {
      const factor = factorInValiation.get(factorId);
      const patternsPaths = path.concat(['results', resultId, 'patterns']);
      if (!factor) {
        const errPathText = patternsPaths.join('/');
        throw new ParseError(`${errPathText} の ${factorId} は factorIds の中で未定義です。`);
      }
      const items = [];
      for (const item of factorItems) {
        let found = false;
        for (const fItem of factor.items) {
          if (fItem.text == item) {
            found = true;
            break;
          }
        }
        if (!found) {
          const errPathText = patternsPaths.concat([factorId]).join('/');
          throw new ParseError(`${errPathText} の ${item} は factors/${factorId}/items の中で未定義です。`);
        }
        items.push(new FactorItem(item));
      }
      const pattern = new FactorPattern(factor, items);
      patterns.push(pattern);
    }
  }
  let moveFlow: Flow | AbstractAltExFlow | undefined = basicFlowDic.get(resultProps.moveFlowId);
  if (!moveFlow) {
    moveFlow = alternateFlows.get(resultProps.moveFlowId);
  }
  if (!moveFlow) {
    moveFlow = exceptionFlows.get(resultProps.moveFlowId);
  }
  if (!moveFlow) {
    const errPathText = path.concat(['results', resultId, 'moveFlowId']).join('/');
    throw new ParseError(`${errPathText} の ${resultProps.moveFlowId} は未定義です。`);
  }
  return new ValiationResult(new ValiationResultId(resultId), resultProps.resultType as ResultType, patterns, moveFlow);
}

function parseScenarios(data: IAppProps, usecasesDic: Cache<UseCase>): Scenario[] {
  const sescenarios: Scenario[] = [];
  const path = ['scenarios'];
  if (data.scenarios) {
    for (const [id, scenario] of Object.entries(data.scenarios)) {
      const currPath = path.concat([id]);
      const usecases: UseCase[] = [];
      for (const usecaseId of scenario.usecaseOrder) {
        const u = usecasesDic.get(new UseCaseId(usecaseId));
        if (!u) {
          const errPathText = currPath.concat(['usecaseOrder']).join('/');
          throw new ParseError(`${errPathText} の ${usecaseId} は usecases の中に見つかりません`);
        }
        usecases.push(u);
      }
      const o = new Scenario(new ScenarioId(id), new Name(scenario.name), new Summary(scenario.summary), usecases);
      sescenarios.push(o);
    }
  }
  return sescenarios;
}

function replaceKeyword(data: IAppProps, app: App): Map<string, Set<Glossary>> {
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
          const errPathText = path.concat([name]).join('/');
          throw new ParseError(`${errPathText} の ${keyword} は、glossaries に未定義です`);
        }
        appendUcGlossary(ucGlossaries, glossary, app, path, name);
        const index: number = matches['index'];
        const prefix = text.substring(0, index);
        const sufix = text.substring(index + matches[0].length);
        const replacement = `[${glossary.id.toString}][]`;
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
