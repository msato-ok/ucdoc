import { runCLI } from '../helpers';

describe('ucdoc', () => {
  it('should display the help contents', () => {
    const { stdout } = runCLI(process.cwd(), ['--help']);

    expect(stdout).toContain('Usage: ucdoc [options]');
  });
});
