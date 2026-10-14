import { useEffect } from "preact/hooks";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { brickColor, createBaseplate, createBrickGeometry, DEFAULT_BRICK_COLORS, parseColors, plasticMaterial, srgb } from "./bricks";
import { Actions, StateModel } from "./store";
import configProps from "./config.json";

import { IStore, Unsubscribe } from "@citolab/preact-store";
import type { PciProperties } from "@citolab/tspci";
type PropTypes = PciProperties<typeof configProps>;

export const Interaction = (props: { config: PropTypes, store: IStore<StateModel, Actions> }) => {
  const { config, store } = props;

  let voxel: VoxelPainterClass;

  let dom: HTMLElement;

  useEffect(() => {
    voxel = new VoxelPainterClass({
      width: config.width,
      height: config.height,
      gridDivisions: config.gridDivisions,
      cubePixelSize: config.cubePixelSize,
      frontLabel: config.frontLabel,
      brickColorMode: config.brickColorMode,
      brickColors: config.brickColors,
      baseplateColor: config.baseplateColor,
      htmlElementToAppendTo: dom,
    });
    let unsubscribe: Unsubscribe | undefined;
    // prevent a black box to appear when the page is loaded
    const timer = setTimeout(() => {
      // subscribe calls us right away with the current cubes, and again on every change
      unsubscribe = store.subscribe(s => {
        voxel?.restoreObjects(s.cubes);
      });
      voxel?.onWindowResize()
    }, 10);

    dom?.addEventListener(
      "onPositionsChanged",
      (positionsArray: CustomEvent) => {
        const currentPositions = store.getState().cubes;
        const newPositions = positionsArray.detail;
        // compare currentPositions with newPositions create an object with the following information:
        // which cubes are added, which cubes are removed, which cubes are changed
        // and dispatch this information to the store
        const cubesToAdd = newPositions.filter((p) => !currentPositions.find((c) => c.x === p.x && c.y === p.y && c.z === p.z));
        const cubesToRemove = currentPositions.filter((c) => !newPositions.find((p) => c.x === p.x && c.y === p.y && c.z === p.z));

        cubesToAdd.forEach((c) => {
          store.dispatch({ type: "ADDED_CUBE", payload: { x: c.x, y: c.y, z: c.z } });
        });
        cubesToRemove.forEach((c) => {
          store.dispatch({ type: "REMOVED_CUBE", payload: { x: c.x, y: c.y, z: c.z } });
        });
      }
    );
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
      voxel?.destroy();
      voxel = null;
    };
  }, [
    config.width,
    config.height,
    config.gridDivisions,
    config.cubePixelSize,
    config.frontLabel,
    config.brickColorMode,
    config.brickColors,
    config.baseplateColor,
  ]);

  return (
    <>
      {/* The scene gets the configured size (shrinking on a narrow screen), so the camera has a fixed frame to fill. */}
      <div
        style={{ width: `${config.width}px`, maxWidth: "100%", height: `${config.height}px` }}
        ref={(node) => { dom = node as HTMLElement; }}
      />
    </>
  );
};

class VoxelPainterClass {
  private camera: THREE.PerspectiveCamera;

  private controls: OrbitControls;
  private target = new THREE.Vector3(0, 0, 0);
  private framingObjects: THREE.Object3D[] = [];
  private readonly framePadding = 1.3;

  private canvasWidth: number;
  private canvasHeight: number;
  private gridDivisions = 4;
  private gridSize = 400;
  private scene: THREE.Scene;
  private rollOverMaterial: THREE.MeshStandardMaterial;
  private rollOverMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  /** The box a click hits (invisible); the brick on it is what the candidate sees. */
  private cubeGeo: THREE.BoxBufferGeometry;
  private brickGeo: THREE.BufferGeometry;
  private hitMaterial: THREE.MeshBasicMaterial;
  private cubeMaterialSelected: THREE.MeshStandardMaterial;
  private baseplate: THREE.Mesh;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private plane: THREE.Mesh<THREE.PlaneBufferGeometry, THREE.MeshBasicMaterial>;
  private objects: any[] = [];
  private labelMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private renderer: THREE.WebGLRenderer;
  private isMouseDown: boolean;
  private mouseMoveRotateActive = true;
  private isRotating = false;
  private frontLabel = "front";
  private brickColorMode = "mixed";
  private brickPalette = DEFAULT_BRICK_COLORS;
  private baseplateColor = "#4b9f4a";
  private handleMouseMove: (e: MouseEvent) => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private handleMouseUp: (e: MouseEvent) => void;
  private handleMouseLeave: () => void;
  private handleResize?: () => void;
  domEl: any;

  constructor(props) {
    this.domEl =
      props && props.htmlElementToAppendTo
        ? props.htmlElementToAppendTo
        : document.body;
    this.canvasWidth = props.width ? props.width : this.domEl.clientWidth;
    this.canvasHeight = props.height ? props.height : this.domEl.clientHeight;

    this.camera = new THREE.PerspectiveCamera(
      42,
      this.canvasWidth / this.canvasHeight,
      1,
      10000
    );
    this.camera.position.set(200, 600, 1000);
    this.camera.lookAt(this.target);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    if (props) {
      if (props.frontLabel) {
        this.frontLabel = String(props.frontLabel);
      }
      this.brickColorMode = props.brickColorMode === "single" ? "single" : "mixed";
      this.brickPalette = parseColors(props.brickColors);
      if (props.baseplateColor && CSS.supports?.("color", props.baseplateColor) !== false) {
        this.baseplateColor = String(props.baseplateColor);
      }
      if (props.gridDivisions && props.cubePixelSize) {
        this.gridDivisions = props.gridDivisions;
        this.gridSize = props.gridDivisions * props.cubePixelSize;
      }
    }

    const cubeSideSize = this.gridSize / this.gridDivisions;

    // Looks: bricks, baseplate, light and shadow (bricks.ts). Placing and removing works on invisible boxes:
    // the box faces (top = faces 4 and 5) are what isGoingToBePlacedOnTop reads, whatever a brick looks like.
    this.scene.background = srgb(0xeef1f5);
    this.hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.cubeMaterialSelected = new THREE.MeshStandardMaterial({ color: srgb(0xff3b30), opacity: 0.55, transparent: true, roughness: 0.4 });

    this.cubeGeo = new THREE.BoxBufferGeometry(cubeSideSize, cubeSideSize, cubeSideSize);
    this.brickGeo = createBrickGeometry(cubeSideSize);
    if (this.gridDivisions % 2 == 1) {
      const up = new THREE.Matrix4().makeTranslation(0, cubeSideSize / 2, 0);
      this.cubeGeo.applyMatrix4(up);
      this.brickGeo.applyMatrix4(up);
    }

    // roll-over helper: a see-through brick where the next one goes
    this.rollOverMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 0.45, transparent: true, roughness: 0.3, depthWrite: false });
    this.rollOverMesh = new THREE.Mesh(this.brickGeo, this.rollOverMaterial);
    // added on the first mouse move over the grid, so nothing floats there before the candidate points

    // the baseplate; faint lines on top mark the cells
    this.baseplate = createBaseplate(this.gridSize, this.gridDivisions, this.baseplateColor);
    this.scene.add(this.baseplate);
    this.framingObjects.push(this.baseplate);

    // the space a build can take (as high as the grid is wide): framed by the camera, so a stack stays in view
    const buildVolume = new THREE.Mesh(
      new THREE.BoxBufferGeometry(this.gridSize, this.gridSize, this.gridSize),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    buildVolume.position.y = this.gridSize / 2;
    this.scene.add(buildVolume);
    this.framingObjects.push(buildVolume);

    const lineColor = srgb(this.baseplateColor).multiplyScalar(0.55); // a darker shade of the plate
    const gridHelper = new THREE.GridHelper(this.gridSize, this.gridDivisions, lineColor, lineColor);
    gridHelper.position.y = 0.4;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.35;
    this.scene.add(gridHelper);
    this.framingObjects.push(gridHelper);

    // a floor that only shows the shadow of the plate and the bricks
    const floor = new THREE.Mesh(
      new THREE.PlaneBufferGeometry(this.gridSize * 12, this.gridSize * 12),
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    floor.rotateX(-Math.PI / 2);
    floor.position.y = -cubeSideSize * 0.12 - 0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    //
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // plane under grid (what the mouse hits where there is no brick yet)
    const geometry = new THREE.PlaneBufferGeometry(this.gridSize, this.gridSize);
    geometry.rotateX(-Math.PI / 2);
    this.plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
    this.plane.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -1, 0));

    this.scene.add(this.plane);
    this.objects.push(this.plane);
    this.framingObjects.push(this.plane);

    // lights: soft sky light, and a sun from the front left that casts the shadows
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.95);
    sun.position.set(-0.7 * this.gridSize, 2.2 * this.gridSize, 1.3 * this.gridSize);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const reach = this.gridSize * 1.6;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: this.gridSize * 8 });
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    this.scene.add(sun);

    // label shown at the frontside of the grid for better reference when rotating
    this.labelMesh = this.getFrontsideLabel();
    this.scene.add(this.labelMesh);
    this.framingObjects.push(this.labelMesh);

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement as HTMLCanvasElement;
    canvas.setAttribute("id", "voxelPainterCanvas");

    this.domEl.appendChild(canvas);

    // add Orbital for drag + zoom
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableKeys = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.updateCameraFrame();

    this.handleMouseMove = (e) => this.onDocumentMouseMove(e);
    this.handleMouseDown = (e) => this.onDocumentMouseDown(e);
    this.handleMouseUp = (e) => this.onDocumentMouseUp(e);

    this.domEl.addEventListener("mousemove", this.handleMouseMove, false);
    this.domEl.addEventListener("mousedown", this.handleMouseDown, false);
    this.domEl.addEventListener("mouseup", this.handleMouseUp, false);
    this.handleMouseLeave = () => {
      this.hideCubeHelper();
      this.resetCubesOpacity();
      this.render();
    };
    this.domEl.addEventListener("mouseleave", this.handleMouseLeave, false);

    if (props.width && props.height) {
      this.handleResize = () => this.onWindowResize();
      window.addEventListener("resize", this.handleResize, false);
    }

    this.render();
  }

  public onWindowResize() {
    this.canvasWidth = this.domEl.clientWidth; // props && props.width ? props.width : window.innerWidth;
    this.canvasHeight = this.domEl.clientHeight;
    this.camera.aspect = this.canvasWidth / this.canvasHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    this.updateCameraFrame();
    this.render()
  }

  private updateCameraFrame() {
    if (!this.framingObjects.length) {
      return;
    }

    const bounds = new THREE.Box3();
    this.framingObjects.forEach((object) => bounds.expandByObject(object));

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const fitHeightDistance = maxSize / (2 * Math.tan(halfFov));
    const fitWidthDistance = fitHeightDistance / this.camera.aspect;
    const distance = this.framePadding * Math.max(fitHeightDistance, fitWidthDistance);

    const direction = this.camera.position.clone().sub(this.controls?.target ?? this.target);
    if (direction.lengthSq() === 0) {
      direction.set(200, 600, 1000);
    }
    direction.normalize();

    this.target.copy(center);
    this.camera.position.copy(center).add(direction.multiplyScalar(distance));
    this.camera.near = Math.max(0.1, distance / 100);
    this.camera.far = Math.max(10000, distance * 20);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.target.copy(center);
      this.controls.update();
    }
  }

  private onDocumentMouseMove(event) {
    event.preventDefault();

    const criteriaForMouseDownMovement =
      this.isMouseDown &&
      (Math.abs(event.movementX) > 1 || Math.abs(event.movementY) > 1);
    if (this.mouseMoveRotateActive && criteriaForMouseDownMovement) {
      this.isRotating = true;
      // this.controls.update();
    }

    this.setMouseCoordinates(event);

    const intersects = this.raycaster.intersectObjects(this.objects);

    this.hideCubeHelper();
    this.resetCubesOpacity();

    const cubeSideSize = this.gridSize / this.gridDivisions;
    if (intersects.length > 0) {
      const intersect = intersects[0];

      const isOdd = this.gridDivisions % 2 == 1;

      intersect.point.z = Math.round(
        intersect.point.z + (isOdd ? cubeSideSize / 2 : 0)
      );
      intersect.point.x = Math.round(
        intersect.point.x + (isOdd ? cubeSideSize / 2 : 0)
      );
      intersect.point.y = Math.round(intersect.point.y);

      this.showHelpersMouseOnly(intersect);
    }

    this.render();
  }

  private showHelpersMouseOnly(intersect) {
    const onTop = this.isGoingToBePlacedOnTop(intersect);
    const rotating = this.isRotating;

    if (!rotating && onTop) {
      const cubeSideSize = this.gridSize / this.gridDivisions;

      this.rollOverMesh.position
        .copy(intersect.point)
        .add(intersect.face.normal);
      this.rollOverMesh.position
        .divideScalar(cubeSideSize)
        .floor()
        .multiplyScalar(cubeSideSize);

      if (this.gridDivisions % 2 == 0) {
        this.rollOverMesh.position.addScalar(cubeSideSize / 2);
      }

      if (!this.isOutsideGrid(this.rollOverMesh)) {
        this.showCubeHelper();
      } else if (this.isTopVoxel(intersect.object)) {
        this.setCubeOpacity(intersect.object.uuid);
      }
    } else if (!this.isRotating && this.isCube(intersect.object)) {
      this.setCubeOpacity(intersect.object.uuid);
    }
  }

  private onDocumentMouseDown(event) {
    event.preventDefault();
    this.isMouseDown = true;
  }

  private onDocumentMouseUp(event) {
    this.isMouseDown = false;

    if (!this.isRotating) {
      this.handleMouseEvent(event);
    }

    this.isRotating = false;
    this.showCubeHelper();
  }

  private handleMouseEvent(event) {
    this.setMouseCoordinates(event);

    const intersects = this.raycaster.intersectObjects(this.objects);

    if (intersects.length > 0) {
      const intersect = intersects[0];

      if (this.isTopVoxel(intersect.object) && this.isCube(intersect.object)) {
        this.removeCube(intersect);
      } else if (this.isGoingToBePlacedOnTop(intersect)) {
        this.addNewCube();
      } else if (this.isCube(intersect.object)) {
        this.removeCube(intersect);
      }

      this.render();

      // PK: Fixed this so every change is bubbled to the above
      const event = new CustomEvent("onPositionsChanged", {
        detail: this.getObjectsPositions(),
        bubbles: true,
      });
      this.renderer.domElement.dispatchEvent(event);
    }
  }

  /** A cube: the invisible box that clicks hit, carrying the brick the candidate sees. */
  private createCube(position: THREE.Vector3) {
    const cube = new THREE.Mesh(this.cubeGeo, this.hitMaterial);
    cube.position.copy(position);
    const material = plasticMaterial(brickColor(position, this.gridSize / this.gridDivisions, this.brickPalette, this.brickColorMode));
    const brick = new THREE.Mesh(this.brickGeo, material);
    brick.castShadow = true;
    brick.receiveShadow = true;
    brick.raycast = () => {}; // clicks are for the box
    cube.add(brick);
    cube.userData = { isCube: true, brick, material };
    return cube;
  }

  private addNewCube() {
    const voxel = this.createCube(this.rollOverMesh.position);

    if (!this.isOutsideGrid(voxel)) {
      this.scene.add(voxel);

      this.objects.push(voxel);
    }
  }

  private removeCube(intersect) {
    this.scene.remove(intersect.object);
    this.objects.splice(this.objects.indexOf(intersect.object), 1);
  }

  private setMouseCoordinates(event) {
    const mouseCoordinates = this.getMouseCoordinatesNormalized(event);
    this.mouse.set(mouseCoordinates.mouseX, mouseCoordinates.mouseY);
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  private getMouseCoordinatesNormalized(event) {
    const mouseX = (event.offsetX / this.canvasWidth) * 2 - 1;
    const mouseY = -(event.offsetY / this.canvasHeight) * 2 + 1;

    return { mouseX, mouseY };
  }

  private isOutsideGrid(voxel: any) {
    const x = Math.abs(voxel.position.x);
    const y = Math.abs(voxel.position.y);
    const z = Math.abs(voxel.position.z);

    const isOutOfRangeX = x > this.gridSize / 2;
    const isOutOfRangeY = y > this.gridSize || voxel.position.y < 0;
    const isOutOfRangeZ = z > this.gridSize / 2;

    const outsideGrid = isOutOfRangeX || isOutOfRangeY || isOutOfRangeZ;

    return outsideGrid;
  }

  private isTopVoxel(voxel: any) {
    const y = Math.abs(voxel.position.y);
    const cubeSize = this.gridSize / this.gridDivisions;
    const isTopVoxel = y >= this.gridSize - cubeSize;

    return isTopVoxel;
  }

  private hideCubeHelper() {
    this.scene.remove(this.rollOverMesh);
  }

  private showCubeHelper() {
    this.scene.add(this.rollOverMesh);
  }

  private isGridBottom(object) {
    const id = object.uuid;
    const isGridBottom = id == this.plane.uuid;

    return isGridBottom;
  }

  private isGoingToBePlacedOnTop(interectingObject) {
    const faceIndex = interectingObject.faceIndex;

    const isGridBottom = this.isGridBottom(interectingObject.object);

    return (
      (isGridBottom && (faceIndex == 0 || faceIndex == 1)) ||
      faceIndex == 4 ||
      faceIndex == 5
    );
  }

  private resetCubesOpacity() {
    this.scene.children.forEach((element) => {
      if (this.isCube(element)) {
        element.userData.brick.material = element.userData.material;
      }
    });
  }

  /** Marks the brick a click would remove (red, see-through); the others get their own colour back. */
  private setCubeOpacity(uuid) {
    this.scene.children.forEach((element) => {
      if (this.isCube(element)) {
        element.userData.brick.material = element.uuid == uuid ? this.cubeMaterialSelected : element.userData.material;
      }
    });
  }

  private isCube(element) {
    return element?.userData?.isCube === true;
  }

  /**
   * The arrow and the label in front of the grid ("front", or the configured frontLabel), so the candidate keeps
   * their bearings while rotating. Drawn on a canvas: the font shrinks to fit any label, and the plane is scaled to
   * the grid, so it never dwarfs the blocks (it is part of what the camera frames).
   */
  private getFrontsideLabel() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const centerX = canvas.width / 2;

    // arrow pointing at the grid
    context.fillStyle = "#000000";
    context.beginPath();
    context.moveTo(centerX, 8);
    context.lineTo(centerX + 34, 64);
    context.lineTo(centerX + 10, 64);
    context.lineTo(centerX + 10, 112);
    context.lineTo(centerX - 10, 112);
    context.lineTo(centerX - 10, 64);
    context.lineTo(centerX - 34, 64);
    context.closePath();
    context.fill();

    // label, as large as fits
    let fontSize = 104;
    context.font = `${fontSize}px Arial, sans-serif`;
    while (fontSize > 24 && context.measureText(this.frontLabel).width > canvas.width - 16) {
      fontSize -= 4;
      context.font = `${fontSize}px Arial, sans-serif`;
    }
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(this.frontLabel, centerX, 128);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true });

    const labelWidth = this.gridSize;
    const labelHeight = labelWidth * (canvas.height / canvas.width);
    const geometry = new THREE.PlaneGeometry(labelWidth, labelHeight);
    geometry.rotateX(-Math.PI / 2);

    const label = new THREE.Mesh(geometry, material);
    label.position.set(0, 0, this.gridSize / 2 + labelHeight / 2 + this.gridSize * 0.05);
    return label;
  }

  public clearObjects() {
    const objectIdsToRemoveFromScene = [];
    this.objects.forEach((element, index) => {
      if (element.uuid !== this.plane.uuid) {
        objectIdsToRemoveFromScene.push(element.uuid);
      }
    });

    objectIdsToRemoveFromScene.forEach((element) => {
      const objectIndex = this.objects.findIndex((o) => o.uuid === element);
      if (objectIndex != -1) this.objects.splice(objectIndex, 1);

      const sceneChildIndex = this.scene.children.findIndex(
        (c) => c.uuid === element
      );
      if (sceneChildIndex != -1) this.scene.children.splice(sceneChildIndex, 1);
    });
  }

  public destroy() {
    if (this.handleResize) {
      window.removeEventListener("resize", this.handleResize, false);
    }
    this.domEl?.removeEventListener("mousemove", this.handleMouseMove, false);
    this.domEl?.removeEventListener("mousedown", this.handleMouseDown, false);
    this.domEl?.removeEventListener("mouseup", this.handleMouseUp, false);
    this.domEl?.removeEventListener("mouseleave", this.handleMouseLeave, false);
    this.controls?.dispose();
    this.renderer?.dispose();
    const canvas = this.renderer?.domElement;
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  }

  private render() {
    // this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public objectsArray;
  public getObjectsPositions() {
    const positionsArray = [];
    this.objects.forEach((element) => {
      if (this.isCube(element)) {
        const isEvenGrid = this.gridDivisions % 2 == 0;
        const cubePixelSize = this.gridSize / this.gridDivisions;
        const correction = -(cubePixelSize / 2);
        const coordsY =
          (element.position.y + (isEvenGrid ? correction : 0)) / cubePixelSize;
        const coordsX =
          (element.position.x +
            (this.gridDivisions * cubePixelSize) / 2 +
            correction) /
          cubePixelSize;
        const coordsZ =
          (element.position.z +
            (this.gridDivisions * cubePixelSize) / 2 +
            correction) /
          cubePixelSize;

        positionsArray.push({
          x: coordsX,
          y: coordsY,
          z: coordsZ,
        });
      }
    });

    return positionsArray;
  }

  public restoreObjects(positionsArray: any[]) {
    this.clearObjects();

    positionsArray.forEach((element) => {

      const isEvenGrid = this.gridDivisions % 2 == 0;
      const cubePixelSize = this.gridSize / this.gridDivisions;
      const correction = cubePixelSize / 2;
      const coordsY =
        element.y * cubePixelSize - (isEvenGrid ? -correction : 0);
      const coordsX =
        element.x * cubePixelSize -
        (this.gridDivisions * cubePixelSize) / 2 +
        correction;
      const coordsZ =
        element.z * cubePixelSize -
        (this.gridDivisions * cubePixelSize) / 2 +
        correction;

      const voxel = this.createCube(new THREE.Vector3(coordsX, coordsY, coordsZ));

      this.scene.add(voxel);
      this.objects.push(voxel);
    });

    this.render();
  }
}
