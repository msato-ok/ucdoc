import * as spec from '../spec';

export interface SpecCommand {
  execute(spec: spec.App): void;
}
