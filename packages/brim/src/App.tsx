import React from 'react';
import './App.css';
import Editor from './Editor';

const App: React.FC = () => {
  return (
    <div className="App">
      <Editor autoFocus={true} />
      <div>
        <h2>Notes</h2>
        <ul>
          <li><strong>The goal of this is to explore if there's a good way to do keyboard-driven structured code editing that doesn't suck. To not suck, I believe that there must be a very small number of keyboard commands, and they should be rather intuitive/obvious. As a bonus, it would be nice if it behaved similarly to spreadsheets or normal programming editors.</strong></li>
          <li>Warning: A bunch of shit only half-works.</li>
          <li>If you don't see a green selection/cursor box, focus the editor.</li>
          <li>There's no mouse/touch support yet, only keyboard.</li>
          <li>The AST always stays "well-formed", but some bits are allowed to be temporarily unspecified or invalid. The program may still be able to run with unspecified values, and it will be very clear to the user (red boxes) what is invalid/missing.</li>
          <li>This code doesn't yet "run", it's just a fake language for now.</li>
          <li>Up/down arrows move up and down between expressions and array items.</li>
          <li>Shift-left (or just left, if unambiguous) "zooms out" selection and shift-right (Or just right, if unambiguous) "zooms in" selection (into nested structures).</li>
          <li>Pressing enter on an expression (or sub-expression) will begin editing it. Pressing enter again will stop editing.</li>
          <li>Instead of pressing enter, you can just start typing letters/numbers and it will begin the edit (overwriting what it there).</li>
          <li>Pressing the = key on on an expression will move to editing its name.</li>
          <li>A red box indicates an undefined expression.</li>
          <li>If you enter an invalid number as an expression, it will ignore it and leave an undefined box.</li>
          <li>Semicolon or comma (interchangeable) will both add a new assignment or array item below the current one (even during a text edit).</li>
          <li>Delete will delete expressions, array items, etc.</li>
          <li>Typeing just [ when editing an expression will create an array literal.</li>
          <li><strong>TODO</strong> Escape will revert any in-progress edit.</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
