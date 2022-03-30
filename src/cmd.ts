import * as spec from './spec';

export interface SpecCommand {
  execute(spec: spec.Spec): void;
}

export class UcmdSpecCommand implements SpecCommand {
  public execute(spec: spec.Spec): void {
    console.log(spec);
  }
}
