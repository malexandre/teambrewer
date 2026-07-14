import { fireEvent } from "@testing-library/react";

/**
 * Type `text` into a `contenteditable` {@link MentionComposer} editor in a test.
 *
 * jsdom does not implement contenteditable editing, so `userEvent.type` cannot
 * drive it. This mutates the DOM + collapsed caret the way a real keystroke at
 * the end of the content would, then fires the `input` event the composer reads.
 *
 * Fresh typing replaces the content with a single text node. `append: true`
 * continues typing at the end — extending the trailing text node in place (so
 * any preceding `+card` pill nodes are preserved, exactly as the browser would
 * leave them), or starting a new one if the content ends in a pill.
 */
export function typeInEditor(
  editorElement: HTMLElement,
  text: string,
  { append = false }: { append?: boolean } = {},
): void {
  let caretNode: Text;
  if (!append) {
    editorElement.textContent = "";
    caretNode = document.createTextNode(text);
    editorElement.appendChild(caretNode);
  } else if (editorElement.lastChild?.nodeType === Node.TEXT_NODE) {
    caretNode = editorElement.lastChild as Text;
    caretNode.data += text;
  } else {
    caretNode = document.createTextNode(text);
    editorElement.appendChild(caretNode);
  }
  const range = document.createRange();
  range.setStart(caretNode, caretNode.data.length);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.input(editorElement);
}
