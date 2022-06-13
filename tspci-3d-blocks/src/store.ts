import { IAction } from "@citolab/preact-store";

export type ActionType = "ADD_ACTION" | "REMOVE_ACTION" | "SET_STATE";
// export type RemoveActionType = "REMOVE_ACTION";

export const actions = [
  // {
  //   type: "ADD_ACTION",
  //   action: (currentState: StateModel, { x }: { x: number }) => {
  //     const newState = { cubes: [...currentState.cubes, x] };
  //     return newState;
  //   },
  // } as IAction<StateModel, { x: number }, ActionType>,

  // {
  //   type: "REMOVE_ACTION",
  //   action: (currentState: StateModel, { x }: { x: number }) => {
  //     const newState = { cubes: currentState.cubes.filter((val) => val !== x) };
  //     return newState;
  //   },
  // } as IAction<StateModel, { x: number }, ActionType>,
  {
    type: "SET_STATE",
    action: (currentState: StateModel, payload: [{x:number, y:number, z:number}]) => {
      const newState = { cubes : [...payload] };
      return newState;
    },
  } as IAction<StateModel, {x:number, y:number, z:number}[], ActionType>,
];

export type StateModel = {
  cubes: {x:number, y:number, z:number}[];
};

//   setCompleteState(state, payload: [{x:number, y:number, z:number}]) {
//     return { cubes : [...payload] }
//   }
