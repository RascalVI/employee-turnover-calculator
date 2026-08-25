const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

if (!script) {
  throw new Error('В index.html не найден встроенный JavaScript калькулятора');
}

function createCalculator() {
  const elements = {};
  const document = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = { value: '', innerHTML: '', style: {} };
      }
      return elements[id];
    },
  };
  const context = vm.createContext({ document });
  vm.runInContext(script, context);

  return {
    runGeneral(values) {
      for (const id of ['start', 'hired', 'end', 'left', 'months']) {
        document.getElementById(id).value = values[id] ?? '';
      }
      context.calculateGeneral();
      return document.getElementById('resultGeneral').innerHTML;
    },
    runNew(values) {
      for (const id of ['newhired', 'newleft']) {
        document.getElementById(id).value = values[id] ?? '';
      }
      context.calculateNew();
      return document.getElementById('resultNew').innerHTML;
    },
  };
}

test('общая текучесть одинаково рассчитывается при разном масштабе', () => {
  const calculator = createCalculator();
  const cases = [
    { start: 10, hired: 1, end: 10, left: 1, months: 12 },
    { start: 100, hired: 10, end: 100, left: 10, months: 12 },
    { start: 1000, hired: 100, end: 1000, left: 100, months: 12 },
    { start: 100000, hired: 10000, end: 100000, left: 10000, months: 12 },
  ];

  for (const values of cases) {
    assert.match(calculator.runGeneral(values), /10\.00%/);
  }
});

test('несогласованный кадровый баланс отклоняется', () => {
  const calculator = createCalculator();
  const result = calculator.runGeneral({
    start: 1000,
    hired: 0,
    end: 950,
    left: 30,
    months: 12,
  });

  assert.match(result, /не сходится/i);
  assert.doesNotMatch(result, /3\.08%/);
});

test('пустые, отрицательные и дробные значения численности отклоняются', () => {
  const calculator = createCalculator();

  assert.match(calculator.runGeneral({}), /заполните/i);
  assert.match(
    calculator.runGeneral({ start: 100, hired: 0, end: 100, left: -5, months: 12 }),
    /неотрицательн/i,
  );
  assert.match(
    calculator.runGeneral({ start: 100.5, hired: 0.5, end: 100, left: 1, months: 12 }),
    /целыми/i,
  );
});

test('период должен быть целым числом от 1 до 12', () => {
  const calculator = createCalculator();

  assert.match(
    calculator.runGeneral({ start: 100, hired: 10, end: 100, left: 10, months: 0.5 }),
    /от 1 до 12/i,
  );
  assert.match(
    calculator.runGeneral({ start: 100, hired: 10, end: 100, left: 10, months: 13 }),
    /от 1 до 12/i,
  );
});

test('согласованный кадровый баланс рассчитывается', () => {
  const calculator = createCalculator();
  const result = calculator.runGeneral({
    start: 1000,
    hired: 30,
    end: 950,
    left: 80,
    months: 12,
  });

  assert.match(result, /8\.21%/);
  assert.doesNotMatch(result, /ошибка/i);
});

test('текучесть новых сотрудников требует допустимый размер группы', () => {
  const calculator = createCalculator();

  assert.match(calculator.runNew({ newhired: 0, newleft: 5 }), /больше нуля/i);
  assert.match(calculator.runNew({ newhired: 10, newleft: 12 }), /не может превышать/i);
  assert.match(calculator.runNew({ newhired: 10, newleft: -1 }), /неотрицательн/i);
});

test('допустимая текучесть новых сотрудников рассчитывается', () => {
  const calculator = createCalculator();
  assert.match(calculator.runNew({ newhired: 10, newleft: 2 }), /20\.00%/);
});
