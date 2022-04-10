import { Command } from 'commander';
import { SpecCommand } from './command/base';
import { UsecaseCommand } from './command/usecase';
import { UsecaseTestCommand } from './command/uctest';
import { PictCommand } from './command/pict';
import { DecisionHtmlCommand } from './command/decision_html';
import { parse } from './parser/parser';

const packageJson = require('../package.json');
const version: string = packageJson.version;

const program = new Command();

program.name('ucdoc').version(version);

program
  .command('usecase <file> [otherFiles...]')
  .description('generate use case description documents')
  .requiredOption('-o, --output <directory>', 'output directory')
  .action((file: string, otherFiles: string[], options: Record<string, string>): void => {
    const output = options['output'];
    const command = new UsecaseCommand(output);
    executeCommand(file, otherFiles, command);
  });

program
  .command('uctest <file> [otherFiles...]')
  .description('generate uctest documents')
  .requiredOption('-o, --output <directory>', 'output directory')
  .action((file: string, otherFiles: string[], options: Record<string, string>): void => {
    const output = options['output'];
    const command = new UsecaseTestCommand(output);
    executeCommand(file, otherFiles, command);
  });

program
  .command('pict <file> [otherFiles...]')
  .description('generate pict combination')
  .requiredOption('-o, --output <directory>', 'output directory')
  .action((file: string, otherFiles: string[], options: Record<string, string>): void => {
    const output = options['output'];
    const command = new PictCommand(output);
    executeCommand(file, otherFiles, command);
  });

program
  .command('decision <file> [otherFiles...]')
  .description('generate decision table')
  .requiredOption('-o, --output <directory>', 'output directory')
  .action((file: string, otherFiles: string[], options: Record<string, string>): void => {
    const output = options['output'];
    const command = new DecisionHtmlCommand(output);
    executeCommand(file, otherFiles, command);
  });

program.parse(process.argv);

function executeCommand(file: string, otherFiles: string[], specCmd: SpecCommand) {
  try {
    let files = [file];
    if (otherFiles) {
      files = [...files, ...otherFiles];
    }
    const s = parse(files);
    specCmd.execute(s);
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.stack);
    } else {
      console.error(e);
    }
  }
}
