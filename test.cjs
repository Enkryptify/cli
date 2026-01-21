const fs = require('fs');

// Parse command-line arguments
const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');

if (fileIndex === -1 || fileIndex === args.length - 1) {
  console.error('Usage: node test.js --file <filename>');
  process.exit(1);
}

const filename = args[fileIndex + 1];

try {
  const contents = fs.readFileSync(filename, 'utf8');
  console.log(contents);
} catch (error) {
  console.error(`Error reading file: ${error.message}`);
  process.exit(1);
}
