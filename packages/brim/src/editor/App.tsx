import React from 'react';
import './App.css';
import Editor from './Editor';

const App: React.FC = () => {
  return (
    <div className="App">
      <div className="App-editor"><Editor /></div>
      <div className="App-divider" />
      {/* <div>
        <h2>Notes</h2>
        <ul>
          <li>If you don't see a green selection/cursor box, focus the editor.</li>
          <li>The mouse can be used to select parts of the tree, but otherwise editing is keyboard-driven.</li>
          <li>Up/down arrows move selection up and down within lists (expressions, arguments, arrays).</li>
          <li>Right/left arrows move selection in and out of nested structures.</li>
          <li>Enter on an expression (or expression sub-tree) will begin editing it. Pressing enter again will stop editing.</li>
          <li>Instead of pressing enter, you can just start typing letters/numbers and it will begin the edit (overwriting what it there).</li>
          <li>Escape aborts the current edit.</li>
          <li>Shift-enter (or comma) adds a new expression (or array item) below the current one.</li>
          <li>Pressing the = key on on an expression will move to editing its name/label.</li>
          <li>A red box indicates an undefined expression.</li>
          <li>Tab edits the next undefined expression.</li>
          <li>Delete will delete expressions, array items, etc.</li>
          <li>Typing [ when editing an expression will create an array literal.</li>
        </ul>
      </div> */}
      <div id="output" />
    </div>
  );
}

export default App;
