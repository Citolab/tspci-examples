import { useState, useRef, useLayoutEffect, useCallback } from "preact/hooks";
import useMouse from "@react-hook/mouse-position";
import { useEffect } from "preact/hooks";
import afbeelding from "./verhoudingen.svg";
import { StateModel } from "./store";
import configProps from "./config.json";
import { Action, IStore, useStore } from "@citolab/preact-store";
type PropTypes = typeof configProps;

const svgString = decodeURIComponent(afbeelding).replace("data:image/svg+xml,", "");

const Interaction = ({ config, dom, store }: { config: PropTypes; dom: Document | ShadowRoot; store: IStore<StateModel> }) => {
  const { width, height } = config;
  const colors = config.colors.split(",");

  const [selectedColor, setSelectedColor] = useState<string>(colors[0]);

  const svgContainer = useRef<HTMLDivElement>();
  const paintables = useRef<Element[]>();

  const state = useStore(store);

  const mouse = useMouse(svgContainer, {
    fps: 60,
    enterDelay: 100,
    leaveDelay: 100,
  });

  useEffect(() => {
    const scale = mouse.isDown ? 0.8 : 1;
    svgContainer.current.style.cursor = getCursor(scale, selectedColor);
  }, [selectedColor, mouse.isDown]);

  const handleMouseDown = useCallback(() => {
    const element = dom.elementFromPoint(mouse.clientX, mouse.clientY);
    const ispaintable = paintables.current.find((p) => p == element);
    if (ispaintable && element.getAttribute("fill") !== `${selectedColor}`) {
      const vlakId = element.getAttribute("data-name");
      store.dispatch<{ id: string; color: string }>({ type: 'SET_COLOR', payload: { id: vlakId, color: selectedColor } });
    }
  }, [mouse, selectedColor, paintables, store]);

  useLayoutEffect(() => {
    width && (svgContainer.current.firstElementChild as SVGElement).setAttribute("width", width);
    height && (svgContainer.current.firstElementChild as SVGElement).setAttribute("height", height);
    paintables.current = [...svgContainer.current.querySelectorAll("#giveColor rect")];
  }, [svgContainer]);

  return (
    <div className="flex flex-col h-full">
      <h1 class="mx-auto my-4 text-gray-500">Color the squares with your mouse</h1>
      <div className="flex justify-center" ref={svgContainer}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 643.5 896.5"
          onMouseDown={handleMouseDown}
          preserveAspectRatio="xMidYMid meet">
          <defs>
            <clipPath id="a">
              <rect width="643.5" height="896" fill="none" />
            </clipPath>
            <clipPath id="b">
              <rect width="640" height="896.5" fill="none" />
            </clipPath>
          </defs>

          <g transform="translate(0 .5)" clip-path="url(#a)" fill="none" stroke="#bcbcbc" stroke-dasharray="3 3">
            <line data-name="Line 28" y2="896" transform="translate(.5)" />
            <line data-name="Line 28" y2="896" transform="translate(32.5)" />
            <line data-name="Line 28" y2="896" transform="translate(64.5)" />
            <line data-name="Line 28" y2="896" transform="translate(96.5)" />
            <line data-name="Line 28" y2="896" transform="translate(128.5)" />
            <line data-name="Line 28" y2="896" transform="translate(160.5)" />
            <line data-name="Line 28" y2="896" transform="translate(192.5)" />
            <line data-name="Line 28" y2="896" transform="translate(224.5)" />
            <line data-name="Line 28" y2="896" transform="translate(256.5)" />
            <line data-name="Line 28" y2="896" transform="translate(288.5)" />
            <line data-name="Line 28" y2="896" transform="translate(320.5)" />
            <line data-name="Line 28" y2="896" transform="translate(352.5)" />
            <line data-name="Line 28" y2="896" transform="translate(384.5)" />
            <line data-name="Line 28" y2="896" transform="translate(416.5)" />
            <line data-name="Line 28" y2="896" transform="translate(448.5)" />
            <line data-name="Line 28" y2="896" transform="translate(480.5)" />
            <line data-name="Line 28" y2="896" transform="translate(512.5)" />
            <line data-name="Line 28" y2="896" transform="translate(544.5)" />
            <line data-name="Line 28" y2="896" transform="translate(576.5)" />
            <line data-name="Line 28" y2="896" transform="translate(608.5)" />
            <line data-name="Line 28" y2="896" transform="translate(640.5)" />
          </g>
          <g transform="translate(.5)" clip-path="url(#b)" fill="none" stroke="#bcbcbc" stroke-dasharray="3 3">
            <line data-name="Line 29" x2="640" transform="translate(0 .5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 32.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 64.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 96.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 128.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 160.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 192.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 224.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 256.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 288.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 320.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 352.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 384.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 416.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 448.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 480.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 512.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 544.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 576.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 608.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 640.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 672.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 704.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 736.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 768.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 800.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 832.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 864.5)" />
            <line data-name="Line 29" x2="640" transform="translate(0 896.5)" />
          </g>
          <g id="giveColor" transform="translate(.5 .5)" fill="#fff" stroke="#5c5c5c" stroke-width="3">
            <rect data-name="192" width="512" height="384" transform="translate(64 64)" fill={state.vlakken.find(v => v.id === '192')?.color || '#fff'} />
            <rect data-name="96" width="256" height="384" transform="translate(65 448)" fill={state.vlakken.find(v => v.id === '96')?.color || '#fff'} />
            <rect data-name="48" width="256" height="192" transform="translate(320 448)" fill={state.vlakken.find(v => v.id === '48')?.color || '#fff'} />
            <rect data-name="24" width="128" height="192" transform="translate(320 640)" fill={state.vlakken.find(v => v.id === '24')?.color || '#fff'} />
            <rect data-name="12B" width="128" height="96" transform="translate(448 736)" fill={state.vlakken.find(v => v.id === '12B')?.color || '#fff'} />
            <rect data-name="12A" width="128" height="96" transform="translate(448 640)" fill={state.vlakken.find(v => v.id === '12A')?.color || '#fff'} />
          </g>
        </svg>
      </div>
      <div className="flex justify-center">
        <div className="bg-white rounded-full shadow-lg border border-gray-200 -mt-2 p-1 w-auto flex items-center justify-center space-x-1">
          {colors.map((c, idx) => (
            <div
              className={` rounded-full border-4 w-10 h-10 ${c == selectedColor ? `border-opacity-70 border-gray-100 ` : `border-white`
                }`}
              style={{ background: `${c}` }}
              onClick={() => setSelectedColor(c)}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
};

function getCursor(scale: number, selectedColor: string): string {
  return (
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E` +
    `%3Ccircle id='Ellipse_10' cx='16' cy='16' r='16' fill='%23fff'/%3E` +
    `%3Cg style='transition: all .4s; transform: translate(${16 * (1 - scale)}px,${16 * (1 - scale)
    }px) scale(${scale})' %3E` +
    `%3Ccircle id='Ellipse_11' cx='12' cy='12' r='12' transform='translate(4 4)' fill='${selectedColor}'/%3E` +
    `%3C/g%3E` +
    `%3C/svg%3E` +
    `") 16 16, pointer`
  );
}

export default Interaction;
