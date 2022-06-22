import { IAction } from "@citolab/preact-store"

export type ActionType = "ADD_ACTION";

export const actions = [
  {
    type: "ADD_ACTION",
    action: (currentState: StateModel, { x }: { x: number }) => {
      const newState = { attempts: [x, ...currentState.attempts] };
      return newState;
    },
  } as IAction<StateModel, { x: number }, ActionType>,
];


export type StateModel = {
  attempts: number[];
};
