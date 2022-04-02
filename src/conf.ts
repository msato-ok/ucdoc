class Conf {
  constructor(readonly tmpDir: string) {}
}

const conf = new Conf('tmp');

export default conf;
