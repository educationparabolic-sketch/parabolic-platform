import {writeFile} from 'node:fs/promises';
import {inspect} from 'node:util';

// Direct file execution exposes actual test events on Node 20. A completed
// receipt distinguishes a finished suite from an early process.exit(0).
export default async function* reporter(events) {
  const receipt = {passed: 0, failed: 0, skipped: 0, todo: 0, completed: false};
  for await (const {type, data} of events) {
    if (type === 'test:pass' || type === 'test:fail') {
      if (data.skip) receipt.skipped++;
      if (data.todo) receipt.todo++;
      if (data.details.type !== 'suite') receipt[type === 'test:pass' ? 'passed' : 'failed']++;
      yield `${type === 'test:pass' ? 'PASS' : 'FAIL'} ${data.name}${data.skip ? ' (SKIP)' : ''}${data.todo ? ' (TODO)' : ''}\n`;
      if (data.details.error) yield `${inspect(data.details.error, {depth: 4})}\n`;
    }
  }
  receipt.completed = true;
  await writeFile(process.env.FRONTEND_TEST_RECEIPT, JSON.stringify(receipt), {flag: 'wx'});
}
