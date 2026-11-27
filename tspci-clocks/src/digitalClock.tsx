import type { PciProperties } from "@citolab/tspci";
import { IStore, useStore } from "@citolab/preact-store";
import { useRef } from "preact/hooks";
import configProps from "./config.json";
import digitalface from "./img/digitalface.png";
import { ClockRadio, clockColor, clockFont, digitalSkin } from "./skins";
import { Actions, StateModel } from "./store";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
    config: PropTypes;
    store: IStore<StateModel, Actions>;
    readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

export function DigitalClock({ config, store, readOnly }: Props) {
    const skin = digitalSkin(config.skin); // how it looks (skins.tsx)
    const color = clockColor(config.color); // the colour of the case, or null: the skin's own
    const font = clockFont(config.font); // the font of the digits, or null: the segments of a display
    const mode = config.typeOfQuestion === "askTime" ? "ask" : "set";

    // The time in the store (re-renders when it changes); until it is set, the initial time from the settings.
    const state = useStore(store);
    const [, initialHour, initialMinute] = /(\d{1,2}):(\d{2})/.exec(config.initialtime ?? "") ?? [];
    const hour = state.hour ?? Number(initialHour ?? 12);
    const minute = state.minute ?? Number(initialMinute ?? 0);
    const is12Hour = config.twentyFourHour === "false"; // settings arrive as strings

    const display = (
        <>
            <EditHour config={config} hour={hour}></EditHour>
            <p className="text-[5em] leading-none m-0">
                <Digits font={font} skinGhost={skin.ghost} className={skin.hour[mode]}>{displayTime("hour", hour, is12Hour)}</Digits>
                {/* the colon of the display font sits low: lift it to the middle of the digits */}
                <span className={`relative ${font ? "top-[-0.08em] font-bold" : "top-[-0.19em]"} ${skin.colon[mode]}`} style={{ fontFamily: font ?? undefined }}>:</span>
                <Digits font={font} skinGhost={skin.ghost} className={skin.minute}>{displayTime("minute", minute, is12Hour)}</Digits>
            </p>
            <EditMinute config={config} minute={minute}></EditMinute>
        </>
    );

    if (skin.frame === "image") {
        return (
            <div className="relative w-fit">
                {color ? <ClockRadio color={color} /> : <img className="block" src={digitalface} alt="digital"></img>}
                {/* overlay on the black screen of the image (not its frame and feet): hour arrows, time, minute arrows */}
                <div className="absolute left-[3%] right-[3%] top-[8%] bottom-[12%] flex items-center justify-center gap-2">
                    {display}
                </div>
            </div>
        );
    }
    return (
        <div className={"w-fit " + skin.frame} style={color ? skin.tint?.(color) : undefined}>
            <div className={"flex items-center justify-center gap-2 " + skin.screen}>{display}</div>
        </div>
    );

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
        const arrowColour = type === "hour" ? skin.hourArrow : skin.minuteArrow;
        let jumps = type === "minute" ? Number(config.minutePerJumps) : 1;
        return (
            <button disabled={readOnly} className="disabled:opacity-40" onClick={() => wrapTime(type, digit + jumps)}>
                <svg className={arrowColour + (readOnly ? "" : " cursor-pointer")} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m18 15-6-6-6 6" />
                </svg>
            </button>
        )
    }

    function ArrowDown({ type, digit }: { type: "hour" | "minute", digit: number }) {
        const arrowColour = type === "hour" ? skin.hourArrow : skin.minuteArrow;
        let jumps = type === "minute" ? Number(config.minutePerJumps) : 1;
        return (
            <button disabled={readOnly} className="disabled:opacity-40" onClick={() => wrapTime(type, digit - jumps)}>
                <svg className={arrowColour + (readOnly ? "" : " cursor-pointer")} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>
        )
    }
}

/**
 * Digits on the display, in the segments of the display font; on an LCD screen with the dim "88" of the unlit segments
 * behind them. In a font of the author's they are plain digits, each as wide as the next, without unlit segments.
 */
function Digits({ font, skinGhost, className, children }: { font: string | null; skinGhost: string | null; className: string; children: string }) {
    if (font) return <span data-digits className={"font-bold tabular-nums " + className} style={{ fontFamily: font }}>{children}</span>;
    if (!skinGhost) return <span data-digits className={"font-digital " + className}>{children}</span>;
    return (
        <span className="inline-grid">
            <span className={"font-digital col-start-1 row-start-1 " + skinGhost} aria-hidden="true">88</span>
            <span data-digits className={"font-digital col-start-1 row-start-1 " + className}>{children}</span>
        </span>
    );
}
