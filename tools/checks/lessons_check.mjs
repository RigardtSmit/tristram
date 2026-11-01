// Ogden's check (SPEC 14): every lesson in the library has a recorded CEO approval. Exit 0 pass, 1 defect.
import { verifyLibrary } from '../lib/lessons.mjs';
const problems = verifyLibrary();
if (problems.length) { console.log(`## lessons_check (FAIL)\n\n${problems.map((p) => `- FAIL ${p}`).join('\n')}`); process.exit(1); }
console.log('## lessons_check (PASS)\n\n- PASS every library lesson has a recorded CEO approval');
