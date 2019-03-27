import { createExecutionContext } from './chinook';
import programs from './programs';

const programListElem = document.getElementById('program-list');

let currentContext;

const startProgram = (program) => {
  if (currentContext) {
    currentContext.terminate();
    currentContext = undefined;
  }

  currentContext = createExecutionContext(program.main);
  currentContext.update(); // do initial update. any further updates will be async
}

for (const prog of programs) {
  const anchorElem = document.createElement('a');
  anchorElem.textContent = prog.name;
  anchorElem.setAttribute('href', '#');
  (() => {
    anchorElem.addEventListener('click', (e) => {
      e.preventDefault();
      setTimeout(() => { // start program with delay so it doesn't get this click event
        startProgram(prog);
      }, 0);
    });
  })();

  const itemElem = document.createElement('li');
  itemElem.appendChild(anchorElem);

  programListElem.appendChild(itemElem);
}

startProgram(programs[0]);
