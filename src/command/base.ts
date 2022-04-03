import { App } from '../spec/app';

export interface SpecCommand {
  execute(spec: App): void;
}
