import type { PciProperties } from "@citolab/tspci";
import { IStore, useStore } from "@citolab/preact-store";
import { useRef } from "preact/hooks";
import configProps from "./config.json";
import digitalface from "./img/digitalface.png";
import { Actions, StateModel } from "./store";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
    config: PropTypes;
    store: IStore<StateModel, Actions>;
    readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

export function DigitalClock({ config, store, readOnly }: Props) {
    const hourStyle = config.typeOfQuestion === "askTime" ? "text-red-500" : "text-blue-500";
    const dotStyle = config.typeOfQuestion === "askTime" ? "text-red-500" : "text-white "

    // The time in the store (re-renders when it changes); until it is set, the initial time from the settings.
    const state = useStore(store);
    const [, initialHour, initialMinute] = /(\d{1,2}):(\d{2})/.exec(config.initialtime ?? "") ?? [];
    const hour = state.hour ?? Number(initialHour ?? 12);
    const minute = state.minute ?? Number(initialMinute ?? 0);
    const is12Hour = config.timezone === "us";

    return (
        <div className="relative w-fit">
            <img className="block" src={digitalface} alt="digital"></img>
            {/* overlay on the black screen of the image (not its frame and feet): hour arrows, time, minute arrows */}
            <div className="absolute left-[3%] right-[3%] top-[8%] bottom-[12%] flex items-center justify-center gap-2">
                <EditHour config={config} hour={hour}></EditHour>
                <p className="text-[5em] leading-none m-0">
                    <span className={"font-digital " + hourStyle}>{displayTime("hour", hour, is12Hour)}</span>
                    <span className={"relative top-[-15px] " + dotStyle}>:</span>
                    <span className="font-digital text-red-500">{displayTime("minute", minute, is12Hour)}</span></p>
                <EditMinute config={config} minute={minute}></EditMinute>
            </div>
        </div>
    )


    /**
     * The text on the display for an hour (0-23) or a minute (0-59): always two digits, so "07" and not "7".
     * On a 12-hour clock the hours run from 1 to 12: 0 and 12 show as "12", 13 as "01".
     */
    function displayTime(type: "hour" | "minute", number: number, is12Hour: boolean) {
        if (type === "hour" && is12Hour) number = ((number + 11) % 12) + 1;
        return String(number).padStart(2, "0");
    }

    /**
     * Keeps an hour or minute in range after an arrow changed it: past the last value it starts again at the first, and
     * the other way round (23 -> 0 and 0 -> 23 for hours, 59 -> 0 and 0 -> 59 for minutes).
     */
    function wrapTime(types: "hour" | "minute", number: number) {
        const count = types === "hour" ? 24 : 60;
        const dataDigit = ((number % count) + count) % count;
        if (types === "hour") {
            store.dispatch({ type: "SET_HOUR", payload: { hour: dataDigit } })
        } else {
            store.dispatch({ type: "SET_MINUTE", payload: { minute: dataDigit } })
        }

    }

    function EditHour({ config, hour }: { config: PropTypes, hour: number }) {
        if (config.typeOfQuestion === "askTime") return null;
        return (
            <div className="flex flex-col">
                <ArrowUp type="hour" digit={hour}></ArrowUp>
                <ArrowDown type="hour" digit={hour}></ArrowDown>
            </div>
        )
    }

    function EditMinute({ config, minute }: { config: PropTypes, minute: number }) {
        if (config.typeOfQuestion === "askTime") return null;
        return (
            <div className="flex flex-col">
                <ArrowUp type="minute" digit={minute}></ArrowUp>
                <ArrowDown type="minute" digit={minute}></ArrowDown>
            </div>
        )
    }

    function ArrowUp({ type, digit }: { type: "hour" | "minute", digit: number }) {
        const arrowColour = type === "hour" ? "text-blue-500 hover:text-blue-800" : "text-red-500 hover:text-red-800";
        let jumps = type === "minute" ? Number(config.minutePerJumps) : 1;
        return (
            <button onClick={() => wrapTime(type, digit + jumps)}>
                <svg className={arrowColour + " cursor-pointer"} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m18 15-6-6-6 6" />
                </svg>
            </button>
        )
    }

    function ArrowDown({ type, digit }: { type: "hour" | "minute", digit: number }) {
        const arrowColour = type === "hour" ? "text-blue-500 hover:text-blue-800" : "text-red-500 hover:text-red-800";
        let jumps = type === "minute" ? Number(config.minutePerJumps) : 1;
        return (
            <button onClick={() => wrapTime(type, digit - jumps)}>
                <svg className={arrowColour + " cursor-pointer"} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>
        )
    }
}