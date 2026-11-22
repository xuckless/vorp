// Which of the Live API's turnComplete messages end a reply. A tool call ends a model turn of
// its own, and that turnComplete is not the end of the reply. Only a turn made of tool calls
// alone is swallowed; it is decided per turn, so a turn that never comes (the model stays
// silent after a call) cannot shift the count onto a later reply.

export interface ModelTurn {
  toolCall: boolean;
  output: boolean;
}

export const EMPTY_TURN: ModelTurn = { toolCall: false, output: false };

/** The turn after a message that may carry a tool call or reply output. */
export function observe(turn: ModelTurn, seen: Partial<ModelTurn>): ModelTurn {
  return { toolCall: turn.toolCall || !!seen.toolCall, output: turn.output || !!seen.output };
}

/** Whether the turnComplete ending this turn ends a reply. */
export function endsReply(turn: ModelTurn): boolean {
  return !(turn.toolCall && !turn.output);
}
