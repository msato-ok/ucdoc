import { App } from '../spec/app';

export interface ICommandOption {
  output: string;
  verbose: boolean;
}

export interface SpecCommand {
  get option(): ICommandOption;
  execute(spec: App): void;
}

export abstract class AbstractSpecCommand {
  constructor(protected _option: ICommandOption) {}

  get option(): ICommandOption {
    return this._option;
  }
}
