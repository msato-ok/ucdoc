import { Command } from 'commander';
import { SpecCommand, ICommandOption } from './command/base';
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
  .option('-v, --verbose', 'verbose mode')
  .action((file: string, otherFiles: string[], option: ICommandOption): void => {
    const command = new UsecaseCommand(option);
    executeCommand(file, otherFiles, command);
  });

program
  .command('uctest <file> [otherFiles...]')
  .description('generate uctest documents')
  .requiredOption('-o, --output <directory>', 'output directory')
  .option('-v, --verbose', 'verbose mode')
  .action((file: string, otherFiles: string[], option: ICommandOption): void => {
    const command = new UsecaseTestCommand(option);
    executeCommand(file, otherFiles, command);
  });

program
  .command('pict <file> [otherFiles...]')
  .description('generate pict combination')
  .requiredOption('-o, --output <directory>', 'output directory')
  .option('-v, --verbose', 'verbose mode')
  .action((file: string, otherFiles: string[], option: ICommandOption): void => {
    const command = new PictCommand(option);
    executeCommand(file, otherFiles, command);
  });

program
  .command('decision <file> [otherFiles...]')
  .description('generate decision table')
  .requiredOption('-o, --output <directory>', 'output directory')
  .option('-v, --verbose', 'verbose mode')
  .action((file: string, otherFiles: string[], option: ICommandOption): void => {
    const command = new DecisionHtmlCommand(option);
    executeCommand(file, otherFiles, command);
  });

program.parse(process.argv);

function executeCommand(file: string, otherFiles: string[], specCmd: SpecCommand) {
  try {
    let files = [file];
    if (otherFiles) {
      files = [...files, ...otherFiles];
    }
    const s = parse(files, specCmd.option.verbose);
    specCmd.execute(s);
  } catch (e) {
    if (e instanceof Error) {
      if (specCmd.option.verbose) {
        console.error(e.stack);
      } else {
        console.error(e.message);
      }
    } else {
      console.error(e);
    }
  }
}
