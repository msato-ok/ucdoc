import yaml from 'js-yaml';
import fs from 'fs';
import merge from 'ts-deepmerge';
import { InvalidArgumentError, ParseError } from '../common';
import { App } from '../spec/app';
import { ActorId } from '../spec/actor';
import { Glossary, GlossaryId, GlossaryCategory } from '../spec/glossary';
import { UseCaseId } from '../spec/usecase';
import { walkProps } from '../spec/core';
import { parseApp } from './app_parser';

export interface IAppProps {
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

export interface IActorProps {
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

export interface IPrePostConditionProps {
  description: string;
  details: {
    [key: string]: IPrePostConditionProps;
  };
}

export interface IFlowProps {
  playerId: string;
  description: string;
}

export interface IOverrideFlowProps {
  replaceFlows: {
    [key: string]: IFlowProps;
  };
}

export interface IAltOverrideFlowProps extends IOverrideFlowProps {
  returnFlowId: string;
}

export interface IAlternateFlowProps {
  description: string;
  override: {
    [key: string]: IAltOverrideFlowProps;
  };
}

export interface IExceptionFlowProps {
  description: string;
  override: {
    [key: string]: IOverrideFlowProps;
  };
}

export interface IValiationProps {
  description: string;
  factorEntryPoints: {
    [key: string]: IEntryFactorsProps;
  };
  pictConstraint: string;
  results: {
    [key: string]: IValiationResultProps;
  };
}

export interface IEntryFactorsProps {
  factors: string[];
}

export interface IFactorProps {
  name: string;
  items: string[];
}

export type FilterFirstOrder = 'arrow' | 'disarrow';

export interface IValiationResultProps {
  description: string;
  order?: FilterFirstOrder; // default: arrow
  arrow?: {
    [key: string]: string[];
  };
  disarrow?: {
    [key: string]: string[];
  };
  verificationPointIds?: string;
}

export interface IScenarioProps {
  name: string;
  summary: string;
  usecaseOrder: string[];
}

export interface IGlossaryProps {
  name: string;
  category: string;
  desc?: string;
  url?: string;
}

export class ParserContext {
  private _path: string[] = [];

  get pathText(): string {
    return this._path.join('/');
  }
  push(p: string): void {
    this._path.push(p);
  }
  pushAll(pp: string[]): void {
    for (const p of pp) {
      this.push(p);
    }
  }
  pop(p: string): void {
    const lastPath = this._path.pop();
    if (p != lastPath) {
      throw new InvalidArgumentError(`push ??? pop ???????????????????????? expected=${p}, actual=${lastPath}`);
    }
  }
  popAll(pp: string[]): void {
    for (let i = pp.length - 1; i >= 0; i--) {
      this.pop(pp[i]);
    }
  }
}

export function parse(yamlFiles: string[], verbose = false): App {
  let data = {} as IAppProps;
  for (const yml of yamlFiles) {
    const text = fs.readFileSync(yml, 'utf8');
    const s = yaml.load(text) as Record<string, unknown>;
    data = merge(data, s);
  }

  // ${xxx/yyy} ???????????????????????????????????????
  // ????????? ${xxx/yyy} ?????????????????????parseApp ???????????????????????????????????????????????????
  // ?????????????????????????????? data ???????????????????????????????????????????????? ?????? parseApp ???????????????????????????
  // ??????????????????????????? app ?????????????????????????????????
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
      if (verbose) {
        console.error(e.stack);
      }
    }
    throw new ParseError(`ERROR: ${ctx.pathText}: ${message}`);
  }
}

function replaceKeyword(ctx: ParserContext, data: IAppProps, app: App): Map<string, Set<Glossary>> {
  const ucGlossaries = new Map<string, Set<Glossary>>();
  // ${xxx/yyy} ????????????????????????
  const regexp = /\$\{([^${}]+)\}/;
  walkProps(
    <Record<string, unknown>>(data as unknown),
    [],
    function (obj: Record<string, unknown>, path: string[], name: string, val: unknown): void {
      if (typeof val !== 'string') {
        return;
      }
      ctx.pushAll(path);
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
          throw new ParseError("matches['index'] ?????????????????????regexp ?????????????????????????????????????????????");
        }
        const pos = term.indexOf('/');
        if (pos >= 0) {
          category = term.substring(0, pos);
          term = term.substring(pos + 1);
        }
        const glossary = app.getGlossary(new GlossaryId(term), category ? new GlossaryCategory(category) : undefined);
        if (!glossary) {
          throw new ParseError(`${keyword} ??????glossaries ??????????????????`);
        }
        appendUcGlossary(ucGlossaries, glossary, app, path, name);
        const index: number = matches['index'];
        const prefix = text.substring(0, index);
        const sufix = text.substring(index + matches[0].length);
        const replacement = `???${glossary.id.text}???`;
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
      ctx.popAll(path);
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
      //  path ????????????????????????????????????????????????????????????
      throw new ParseError(`${errPathText} ???????????????????????????????????????`);
    }
    let gset = ucGlossaries.get(ucId);
    if (!gset) {
      gset = new Set<Glossary>();
      ucGlossaries.set(ucId, gset);
    }
    gset.add(glossary);
  }
}
