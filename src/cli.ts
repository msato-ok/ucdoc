import { Command } from 'commander';
import { SpecCommand } from './command/base';
import { UsecaseCommand } from './command/usecase';
import { UsecaseTestCommand } from './command/uctest';
import * as parser from './parser';

const packageJson = require('../package.json');
const version: string = packageJson.version;

const program = new Command();

program.name('ucdoc').version(version);

program
  .command('usecase <file> [otherFiles...]')
  .description('generate use case description documents using markdown')
  .requiredOption('-o, --output <directory>', 'output directory')
  .action((file: string, otherFiles: string[], options: Record<string, string>): void => {
    const output = options['output'];
    const command = new UsecaseCommand(output);
    executeCommand(file, otherFiles, command);
  });

program
  .command('uctest <file> [otherFiles...]')
  .description('generate uctest documents using html')
  .requiredOption('-o, --output <directory>', 'output directory')
  .action((file: string, otherFiles: string[], options: Record<string, string>): void => {
    const output = options['output'];
    const command = new UsecaseTestCommand(output);
    executeCommand(file, otherFiles, command);
  });

program.parse(process.argv);

function executeCommand(file: string, otherFiles: string[], specCmd: SpecCommand) {
  try {
    let files = [file];
    if (otherFiles) {
      files = [...files, ...otherFiles];
    }
    const s = parser.parse(files);
    specCmd.execute(s);
  } catch (e) {
    console.error(e);
  }
}
