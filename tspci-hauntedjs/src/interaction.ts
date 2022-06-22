import { component, html, virtual, useState, useEffect, useRef } from "haunted";
import {ref, createRef} from 'lit/directives/ref.js';

import evaluate from "evaluator.js";

import { Apple } from "./apple";
import { ActionType, StateModel } from "./store";
import { useStore } from "./litstore";

export const Interaction = virtual(({config}) => {
  const { sum1, sum2, buttonText, tableSize } = config;

  const [state, dispatch] = useStore<StateModel, ActionType>((type, payload) => {
    // console.log(`type: ${type}, payload: ${payload}`);
  });

  const replaceAll = (str: string, find: string, replace: string) => {
    return str?.replace(new RegExp(find, "g"), replace);
  };

  const sum = (attempt: number, s: string) => {
    if (attempt) {
      return evaluate(replaceAll(replaceAll(s, "\\$1", attempt.toString()), "x", "*"));
    }
  };

  const inputReference = createRef<HTMLInputElement>();


  useEffect(() => {
    if (inputReference.value) {
      inputReference.value.value = "";
    }
  }, [state]);

  const calc = () => {
    const inputValue = inputReference.value?.value;
    if (!isNaN(parseInt(inputValue))) {
      dispatch<{ x: number }>("ADD_ACTION", { x: +inputValue });
    }
  };

  const Block = virtual(({children, className}) => {
    return html`
      <div
        class="${className} flex items-center justify-center bg-white border-1 text-right h-16 w-16"
      >
        ${children}
      </div>
    `;
  });

  const Button = virtual(({children, click}) => {
    return html`
      <button
        @click=${click}
        class="m-2 bg-blue-500 w-full text-blue-100 whitespace-nowrap py-1 px-6 rounded border-0">
        ${children}
      </button>
    `;
  });

  return html`
    <div class="flex space-x-4">
      <div class="basis-1/4 flex flex-col space-y-3 p-3">
        <div class="flex h-16">
          <label class="flex items-center space-x-2 bg-white shadow border border-gray-200 rounded px-2">
            ${Apple({})}
            <div>=</div>
            <input
              ${ref(inputReference)}
              maxlength="{3}"
              class="text-gray-700 text-4xl w-16 leading-tight focus:outline-none focus:shadow-outline"
            />
          </label>
          <!-- <button onClick="{calc}">{buttonText}</button> -->

          ${Button({
            children: buttonText,
            "click": calc,
          })}
        </div>
        ${[sum1, sum2].map((sum) => {
          const expression = replaceAll(sum, "\\$1", "#");
          return html`
            <div class="flex h-16 space-x-1 items-center justify-end text-4xl">
              ${expression?.split("").map((sumPart, i) => {
                if (sumPart === "#") {
                  return Apple({});
                } else {
                  return html`
                    <div key="{i}" class=${"x*+/".includes(sumPart.toLowerCase()) ? "text-gray-400" : "italic"}>
                      ${sumPart.replace("*", "×")}
                    </div>
                  `;
                }
              })}
              <div class="text-gray-400">=</div>
            </div>
          `;
        })}
      </div>
      <div class="basis-3/4 bg-gray-100 p-3 rounded overflow-x-auto">
        <div class="flex space-x-2 text-4xl h-full">
          ${state.attempts &&
          new Array(
            state.attempts.length <= tableSize
              ? state.attempts.length + tableSize - state.attempts.length
              : state.attempts.length
          )
            .fill("")
            .map((_, idx) => state.attempts[idx])
            .map((attempt, i) => {
              return html`
                <div class="flex flex-col space-y-3" key="{i}">
                  ${Block({
                      children: attempt,
                      "click": () => calc(),
                    })}
                  <!--<Block class="font-bold">{attempt}</Block>-->
                  ${[sum1, sum2].map((s, index) => {
                    const result = sum(attempt, s);
                    return Block({
                      children: result,
                      "click": () => calc(),
                    });
                  })}
                </div>
              `;
            })}
        </div>
      </div>
    </div>
  `;
});
