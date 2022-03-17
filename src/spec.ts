import yaml from 'js-yaml';
import fs from 'fs';
import merge from 'ts-deepmerge';

export interface Spec {
  scenarios: {
    [key: string]: Scenario;
  };
  actors: {
    [key: string]: Actor;
  };
  usecases: {
    [key: string]: Usecase;
  };
  glossary: {
    [key: string]: {
      [key: string]: GlossaryTerm;
    };
  };
}

export interface Scenario {
  name: string;
  summary: string;
  usecaseOrder: string[];
}

export interface Actor {
  name: string;
}

export interface GlossaryTerm {
  name: string;
}

export interface Usecase {
  name: string;
  summary: string;
  preconditions: {
    [key: string]: string;
  };
  postconditions: {
    [key: string]: string;
  };
  basicFlow: {
    [key: string]: Flow;
  };
  alternateFlow: {
    [key: string]: AlternateFlow;
  };
  exceptionFlow: {
    [key: string]: ExceptionFlow;
  };
  picts: {
    [key: string]: Pict;
  };
}

interface Flow {
  player: string;
  description: string;
}

interface AlternateFlow {
  sourceFlowIds: string[];
  description: string;
  nextFlow: {
    [key: string]: Flow;
  };
  returnFlowId: string;
}

interface ExceptionFlow {
  sourceFlowIds: string[];
  description: string;
  nextFlow: {
    [key: string]: Flow;
  };
}

interface Pict {
  sourceFlowIds: string[];
  factors: {
    [key: string]: string[];
  };
  constraint: string;
  flowChangePatterns: {
    [key: string]: PictFlowChangePattern;
  };
}

interface PictFlowChangePattern {
  condition: {
    [key: string]: string;
  };
  nextFlowId: string;
}

class AppError extends Error {
  constructor(e?: string) {
    super(e);
    this.name = new.target.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ParseError extends AppError {}

export function parseSpec(yamlFiles: string[]): Spec {
  let data: Record<string, unknown> = {};
  for (const yml of yamlFiles) {
    const text = fs.readFileSync(yml, 'utf8');
    const s = yaml.load(text) as Record<string, unknown>;
    data = merge(data, s);
  }
  const spec = <Spec>(data as unknown);
  // scenarios の usecaseOrder のチェック
  for (const [scenarioId, scenario] of Object.entries(spec.scenarios)) {
    for (const usecaseId of scenario.usecaseOrder) {
      if (!spec.usecases[usecaseId]) {
        throw new ParseError(`scenarios/${scenarioId}/usecaseOrder の ${usecaseId} が usecases の中に見つかりません`);
      }
    }
  }
  // actors の必須チェック
  if (!spec.actors || Object.keys(spec.actors).length == 0) {
    throw new ParseError('actors は1つ以上登録する必要があります');
  }
  // actor は glossary の category="player" として追加する
  for (const [actorId, actor] of Object.entries(spec.actors)) {
    const term = { name: actor.name };
    if (!spec.glossary['player']) {
      spec.glossary['player'] = {};
      term as GlossaryTerm;
    }
    spec.glossary['player'][actorId] = term as GlossaryTerm;
  }
  // usecases の必須チェック
  if (!spec.usecases || Object.keys(spec.usecases).length == 0) {
    throw new ParseError('usecases は1つ以上登録する必要があります');
  }
  // xxxFlow に関するチェック
  // - flow のキーがユニークであることのチェック
  // - player が actors or glossary に存在することのチェック
  // - sourceFlowIds が存在することのチェック
  // - returnFlowId が存在することのチェック
  const errmsg = 'basicFlow, alternateFlow, exceptionFlow 内のキーは、usecase 内でユニークになるようにしてください。';
  for (const [usecaseId, usecase] of Object.entries(spec.usecases)) {
    const flowUnique = new Map<string, string>();
    for (const [flowId, flow] of Object.entries(usecase.basicFlow)) {
      const path = `usecases/${usecaseId}/basicFlow/${flowId}`;
      if (flowUnique.has(flowId)) {
        throw new ParseError(`${errmsg}\n${path} は、すでに ${flowUnique.get(flowId)} で使用されています`);
      }
      flowUnique.set(flowId, path);
      // playerのチェック
      if (!spec.glossary['player'][flow.player]) {
        throw new ParseError(
          `${flow.player} は player として未定義です。actors に追加するか、glossary/player に追加してください。(${path})`
        );
      }
    }
    if (usecase.alternateFlow) {
      for (const [flowId, flow] of Object.entries(usecase.alternateFlow)) {
        let path = `usecases/${usecaseId}/alternateFlow/${flowId}`;
        if (flowUnique.has(flowId)) {
          throw new ParseError(`${errmsg}\n${path} は、すでに ${flowUnique.get(flowId)} で使用されています`);
        }
        flowUnique.set(flowId, path);
        for (const [nextFlowId, nextFlow] of Object.entries(flow.nextFlow)) {
          path += `/nextFlow/${nextFlowId}`;
          if (flowUnique.has(nextFlowId)) {
            throw new ParseError(`${errmsg}\n${path} は、すでに ${flowUnique.get(nextFlowId)} で使用されています`);
          }
          flowUnique.set(nextFlowId, path);
          // sourceFlowIdsのチェック
          for (const srcFlowId of flow.sourceFlowIds) {
            if (!usecase.basicFlow[srcFlowId]) {
              throw new ParseError(`${srcFlowId} は未定義です。(${path}/sourceFlowIds)`);
            }
          }
          // returnFlowIdのチェック
          if (!usecase.basicFlow[flow.returnFlowId]) {
            throw new ParseError(`${flow.returnFlowId} は未定義です。(${path}/returnFlowId)`);
          }
          // playerのチェック
          if (!spec.glossary['player'][nextFlow.player]) {
            throw new ParseError(
              `${nextFlow.player} は player として未定義です。actors に追加するか、glossary/player に追加してください。(${path})`
            );
          }
        }
      }
    }
    if (usecase.exceptionFlow) {
      for (const [flowId, flow] of Object.entries(usecase.exceptionFlow)) {
        let path = `usecases/${usecaseId}/exceptionFlow/${flowId}`;
        if (flowUnique.has(flowId)) {
          throw new ParseError(`${errmsg}\n${path} は、すでに ${flowUnique.get(flowId)} で使用されています`);
        }
        flowUnique.set(flowId, path);
        for (const [nextFlowId, nextFlow] of Object.entries(flow.nextFlow)) {
          path += `/nextFlow/${nextFlowId}`;
          if (flowUnique.has(nextFlowId)) {
            throw new ParseError(`${errmsg}\n${path} は、すでに ${flowUnique.get(nextFlowId)} で使用されています`);
          }
          flowUnique.set(nextFlowId, path);
          // sourceFlowIdsのチェック
          for (const srcFlowId of flow.sourceFlowIds) {
            if (!usecase.basicFlow[srcFlowId]) {
              throw new ParseError(`${srcFlowId} は未定義です。(${path}/sourceFlowIds)`);
            }
          }
          // playerのチェック
          if (!spec.glossary['player'][nextFlow.player]) {
            throw new ParseError(
              `${nextFlow.player} は player として未定義です。actors に追加するか、glossary/player に追加してください。(${path})`
            );
          }
        }
      }
    }
    // pict に関するチェック
    // - sourceFlowIds が存在することのチェック
    // - flowChangePatterns が存在することのチェック
    if (usecase.picts) {
      for (const [pictId, pict] of Object.entries(usecase.picts)) {
        let path = `usecases/${usecaseId}/pict/${pictId}`;
        // sourceFlowIdsのチェック
        for (const srcFlowId of pict.sourceFlowIds) {
          if (!usecase.basicFlow[srcFlowId]) {
            path += '/sourceFlowIds';
            throw new ParseError(`${srcFlowId} は未定義です。(${path})`);
          }
        }
        // flowChangePatterns のチェック
        for (const [fcpId, fcp] of Object.entries(pict.flowChangePatterns)) {
          path += `/flowChangePatterns/${fcpId}`;
          for (const [factorId, value] of Object.entries(fcp.condition)) {
            if (!pict.factors[factorId]) {
              throw new ParseError(`${factorId} は factors で定義されたキーで指定してください。(${path})`);
            }
            let found = false;
            for (const item of pict.factors[factorId]) {
              if (item == value) {
                found = true;
              }
            }
            if (!found) {
              path += `/condition/${factorId}`;
              throw new ParseError(`${value} は factors/${factorId} で定義された値で指定してください。(${path})`);
            }
          }
          // nextFlowId のチェック
          if (!flowUnique.has(fcp.nextFlowId)) {
            throw new ParseError(`${fcp.nextFlowId} は未定義です。(${path}/nextFlowId)`);
          }
        }
      }
    }
  }
  // ${xxx} が glossary にあるかチェック
  const regexp = /\$\{([^${}]+)\}/g;
  walkProperties(<Record<string, unknown>>(spec as unknown), [], (path: string[], name: string, val: unknown): void => {
    if (typeof val !== 'string') {
      return;
    }
    const matches = val.matchAll(regexp);
    for (const m of Object.values(matches)) {
      const keyword = m[0];
      let category = '_';
      let term: string = m[1];
      const pos = term.indexOf('/');
      if (pos >= 0) {
        category = term.substring(0, pos);
        term = term.substring(pos + 1);
      }
      if (!spec.glossary[category]) {
        throw new ParseError(`${category} は、glossary に未定義です. (${path.join('/')}/${name} : ${keyword})`);
      }
      const catTerms = spec.glossary[category];
      if (!catTerms[term]) {
        throw new ParseError(`${term} は、glossary/${category} に未定義です. (${path.join('/')}/${name} : ${keyword})`);
      }
    }
  });
  return spec;
}

type WalkCallback = (path: string[], name: string, val: unknown) => void;

function walkProperties(obj: Record<string, unknown>, path: string[], callback: WalkCallback) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      continue;
    }
    if (typeof value === 'function' || typeof value === 'object') {
      walkProperties(<Record<string, unknown>>value, path.concat([key]), callback);
    }
    callback(path, key, value);
  }
}
