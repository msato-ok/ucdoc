import yaml from 'js-yaml';
import fs from 'fs';
import merge from 'ts-deepmerge';
import * as spec from './spec';
import * as common from './common';

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
  glossaries: IGlossaryProps[];
}

interface IActorProps {
  name: string;
}

interface IGlossaryProps {
  name: string;
  category?: string;
  desc?: string;
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

// interface IPictProps {
//   sourceFlowIds: string[];
//   factors: IPictFactorProps[];
//   constraint: string;
//   flowChangePatterns: IPictFlowChangePatternProps[];
// }

// interface IPictFactorProps {
//   name: string;
//   items: string[];
// }

// interface IPictFlowChangePatternProps {
//   conditions: IPictFactorProps[];
//   nextFlowId: string;
// }

interface IScenarioProps {
  name: string;
  summary: string;
  usecaseOrder: string[];
}

interface IGlossaryProps {
  name: string;
  category?: string;
  desc?: string;
}

export function parse(yamlFiles: string[]): spec.App {
  let data = {} as IAppProps;
  for (const yml of yamlFiles) {
    const text = fs.readFileSync(yml, 'utf8');
    const s = yaml.load(text) as Record<string, unknown>;
    data = merge(data, s);
  }

  // ${xxx/yyy} のテキスト置換について補足
  // 最初に ${xxx/yyy} には関係なく、parseApp して参照先となるデータを作成して、
  // そのデータを使って、 data に対して、テキスト置換を行って、 再度 parseApp を実行することで、
  // 置換後のテキストで app オブジェクトを作成すうｒ
  let app = parseApp(data);
  data = replaceKeyword(data, app);
  app = parseApp(data);
  return app;
}

function parseApp(data: IAppProps): spec.App {
  const actors: spec.Actor[] = parseActor(data);
  const actorDic = new spec.EntityCache<spec.Actor>();
  actorDic.addAll(actors);

  const glossaries: spec.Glossary[] = parseGlossary(data);
  const glossaryDic = new spec.EntityCache<spec.Glossary>();
  glossaryDic.addAll(glossaries);

  const usecases: spec.UseCase[] = parseUsecase(data, actorDic, glossaryDic);
  const usecasesDic = new spec.EntityCache<spec.UseCase>();
  usecasesDic.addAll(usecases);

  const scenarios: spec.Scenario[] = parseScenarios(data, usecasesDic);

  return new spec.App(actors, usecases, scenarios, glossaries);
}

function parseGlossary(data: IAppProps): spec.Glossary[] {
  const glossaries: spec.Glossary[] = [];
  for (const props of Object.values(data.glossaries)) {
    const o = new spec.Glossary(
      new spec.GlossaryId(props.name),
      props.category ? new spec.GlossaryCategory(props.category) : undefined,
      props.desc ? new spec.Description(props.desc) : undefined
    );
    glossaries.push(o);
  }
  return glossaries;
}

function parseActor(data: IAppProps): spec.Actor[] {
  const actors: spec.Actor[] = [];
  for (const [id, props] of Object.entries(data.actors)) {
    const a = new spec.Actor(new spec.ActorId(id), new spec.Name(props.name));
    actors.push(a);
  }
  return actors;
}

function parseUsecase(
  data: IAppProps,
  actorDic: spec.EntityCache<spec.Actor>,
  glossaryDic: spec.EntityCache<spec.Glossary>
): spec.UseCase[] {
  const basePath = ['usecases'];
  const usecases: spec.UseCase[] = [];
  for (const [id, props] of Object.entries(data.usecases)) {
    const path = basePath.concat([id]);
    const preConditions: spec.PreCondition[] = parsePrePostCondition(spec.PreCondition, props.preConditions);
    const postConditions: spec.PostCondition[] = parsePrePostCondition(spec.PostCondition, props.postConditions);
    const basicFlows: spec.Flow[] = parseBasicFlows(
      path.concat(['basicFlows']),
      props.basicFlows,
      actorDic,
      glossaryDic
    );
    const basicFlowDic = new spec.EntityCache<spec.Flow>();
    basicFlowDic.addAll(basicFlows);
    const alternateFlows: spec.AltExFlowCollection<spec.AlternateFlow> = parseAlternateFlows(
      path.concat(['alternateFlows']),
      props.alternateFlows,
      basicFlowDic,
      actorDic,
      glossaryDic
    );
    const exceptionFlows: spec.AltExFlowCollection<spec.ExceptionFlow> = parseExceptionFlows(
      path.concat(['exceptionFlows']),
      props.exceptionFlows,
      basicFlowDic,
      actorDic,
      glossaryDic
    );

    usecases.push(
      new spec.UseCase(
        new spec.UseCaseId(id),
        new spec.Name(props.name),
        new spec.Summary(props.summary),
        preConditions,
        postConditions,
        new spec.FlowCollection(basicFlows),
        alternateFlows,
        exceptionFlows
      )
    );
  }
  return usecases;
}

/*
 * ■ ctor について補足
 * generics で new したい (`a = new T(id, desc);`) ときのやり方になっている。
 * https://qiita.com/ConquestArrow/items/ace6d926b7e89b8f92d9
 */
function parsePrePostCondition<T extends spec.PrePostCondition>(
  ctor: { new (id: spec.PrePostConditionId, desc: spec.Description): T },
  conditionsProps: Record<string, IPrePostConditionProps>
): T[] {
  const conditions: T[] = [];
  for (const [id, props] of Object.entries(conditionsProps)) {
    const a = new ctor(new spec.PrePostConditionId(id), new spec.Description(props.description));
    conditions.push(a);
  }
  return conditions;
}

function parseBasicFlows(
  path: string[],
  flowPropsArray: Record<string, IFlowProps>,
  actorDic: spec.EntityCache<spec.Actor>,
  glossaryDic: spec.EntityCache<spec.Glossary>
): spec.Flow[] {
  if (!flowPropsArray) {
    const errPathText = path.join('/');
    throw new common.ParseError(`${errPathText} がありません`);
  }
  const flows: spec.Flow[] = [];
  for (const [id, props] of Object.entries(flowPropsArray)) {
    const currPath = path.concat([id]);
    let player: spec.Actor | spec.Glossary | undefined = actorDic.get(new spec.ActorId(props.playerId));
    if (!player) {
      player = glossaryDic.get(new spec.GlossaryId(props.playerId));
    }
    if (!player) {
      const errPathText = currPath.concat(['playerId']).join('/');
      throw new common.ParseError(
        `${errPathText} の ${props.playerId} は定義されていません。actors に追加するか、glossary/player に追加してください。`
      );
    }
    const flow = new spec.Flow(new spec.FlowId(id), new spec.Description(props.description), player);
    flows.push(flow);
  }
  return flows;
}

function parseAlternateFlows(
  path: string[],
  flowPropsArray: Record<string, IAlternateFlowProps>,
  basicFlowDic: spec.EntityCache<spec.Flow>,
  actorDic: spec.EntityCache<spec.Actor>,
  glossaryDic: spec.EntityCache<spec.Glossary>
): spec.AltExFlowCollection<spec.AlternateFlow> {
  const flows: spec.AlternateFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      const currPath = path.concat([id]);
      const sourceFlows: spec.Flow[] = [];
      for (const sourceFlowId of props.sourceFlowIds) {
        const flow = basicFlowDic.get(new spec.FlowId(sourceFlowId));
        if (!flow) {
          const errPathText = currPath.concat(['sourceFlowIds']).join('/');
          throw new common.ParseError(`${errPathText} の ${sourceFlowId} は未定義です。`);
        }
        sourceFlows.push(flow);
      }
      const nextFlows = parseBasicFlows(path.concat(['nextFlows']), props.nextFlows, actorDic, glossaryDic);
      const returnFlow = basicFlowDic.get(new spec.FlowId(props.returnFlowId));
      if (!returnFlow) {
        const errPathText = currPath.concat(['returnFlow']).join('/');
        throw new common.ParseError(`${errPathText} の ${props.returnFlowId} は未定義です。`);
      }
      const flow = new spec.AlternateFlow(
        new spec.AlternateFlowId(id),
        new spec.Description(props.description),
        sourceFlows,
        new spec.FlowCollection(nextFlows),
        returnFlow
      );
      flows.push(flow);
    }
  }
  return new spec.AltExFlowCollection<spec.AlternateFlow>(flows);
}

function parseExceptionFlows(
  path: string[],
  flowPropsArray: Record<string, IExceptionFlowProps>,
  basicFlowDic: spec.EntityCache<spec.Flow>,
  actorDic: spec.EntityCache<spec.Actor>,
  glossaryDic: spec.EntityCache<spec.Glossary>
): spec.AltExFlowCollection<spec.ExceptionFlow> {
  const flows: spec.ExceptionFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      const currPath = path.concat([id]);
      const sourceFlows: spec.Flow[] = [];
      for (const sourceFlowId of props.sourceFlowIds) {
        const flow = basicFlowDic.get(new spec.FlowId(sourceFlowId));
        if (!flow) {
          const errPathText = currPath.concat(['sourceFlowIds']).join('/');
          throw new common.ParseError(`${errPathText} の ${sourceFlowId} は未定義です。`);
        }
        sourceFlows.push(flow);
      }
      const nextFlows = parseBasicFlows(currPath.concat(['nextFlows']), props.nextFlows, actorDic, glossaryDic);
      const flow = new spec.ExceptionFlow(
        new spec.ExceptionFlowId(id),
        new spec.Description(props.description),
        sourceFlows,
        new spec.FlowCollection(nextFlows)
      );
      flows.push(flow);
    }
  }
  return new spec.AltExFlowCollection<spec.ExceptionFlow>(flows);
}

function parseScenarios(data: IAppProps, usecasesDic: spec.EntityCache<spec.UseCase>): spec.Scenario[] {
  const sescenarios: spec.Scenario[] = [];
  const path = ['scenarios'];
  if (data.scenarios) {
    for (const [id, scenario] of Object.entries(data.scenarios)) {
      const currPath = path.concat([id]);
      const usecases: spec.UseCase[] = [];
      for (const usecaseId of scenario.usecaseOrder) {
        const u = usecasesDic.get(new spec.UseCaseId(usecaseId));
        if (!u) {
          const errPathText = currPath.concat(['usecaseOrder']).join('/');
          throw new common.ParseError(`${errPathText} の ${usecaseId} は usecases の中に見つかりません`);
        }
        usecases.push(u);
      }
      const o = new spec.Scenario(
        new spec.ScenarioId(id),
        new spec.Name(scenario.name),
        new spec.Summary(scenario.summary),
        usecases
      );
      sescenarios.push(o);
    }
  }
  return sescenarios;
}

function replaceKeyword(data: IAppProps, app: spec.App): IAppProps {
  // ${xxx/yyy} を探して置換する
  const regexp = /\$\{([^${}]+)\}/;
  spec.walkProps(
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
        let replacement: string | undefined = undefined;
        const pos = term.indexOf('/');
        if (pos >= 0) {
          category = term.substring(0, pos);
          term = term.substring(pos + 1);
        }
        if (category == 'actor') {
          const actor = app.getActor(new spec.ActorId(term));
          if (!actor) {
            const errPathText = path.concat([name]).join('/');
            throw new common.ParseError(`${errPathText} の ${keyword} は、actors に未定義です`);
          }
          replacement = actor.name.text;
        }
        if (!replacement) {
          const glossary = app.getGlossary(
            new spec.GlossaryId(term),
            category ? new spec.GlossaryCategory(category) : undefined
          );
          if (!glossary) {
            const errPathText = path.concat([name]).join('/');
            throw new common.ParseError(`${errPathText} の ${keyword} は、glossaries に未定義です`);
          }
          replacement = glossary.text;
        }
        if (matches['index'] == undefined) {
          throw new common.ParseError("matches['index'] がない状態は、regexp が変更された状態が考えられます");
        }
        const index: number = matches['index'];
        const prefix = text.substring(0, index);
        const sufix = text.substring(index + matches[0].length);
        text = `${prefix}${replacement}${sufix}`;
      } while (matches);
      obj[name] = text;
    }
  );
  return data;
}
