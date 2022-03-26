import { Command } from 'commander';
import * as usecase from './command/usecase';
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
    const command = new usecase.UcmdSpecCommand(output);
    executeCommand(file, otherFiles, command);
  });

// program
//   .command('itmd <file> [otherFiles...]')
//   .description('generate IT test scenarios flow')
//   .action((file: string, otherFiles: string[]) => {
//     // TODO
//   });

program.parse(process.argv);

function executeCommand(file: string, otherFiles: string[], specCmd: usecase.SpecCommand) {
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
