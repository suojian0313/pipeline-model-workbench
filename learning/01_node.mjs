// 与 01_python.py 输入和结果相同：先理解业务，再比较语言语法。
function normalizeCode(value) {
  const code = String(value ?? '').replace(/\s+/g, '');
  return code === '-' ? '' : code;
}

const welds = [
  { line_no: ' WW-08001 ', weld_no: '1', welded_on: '2026-10-22', sides: ['pipe-a', 'flange-b'] },
  { line_no: 'WW-08001', weld_no: '2', welded_on: null, sides: ['pipe-a', 'pipe-c'] },
];
const completed = welds.filter(weld => weld.welded_on !== null);
const colored = new Set(completed.flatMap(weld => weld.sides));
const result = {
  normalized_code: normalizeCode('90EL GB13401 -627'),
  weld_key: [normalizeCode(welds[0].line_no), welds[0].weld_no],
  completed: completed.length,
  colored_components: [...colored].sort(),
};
console.log(JSON.stringify(result));
