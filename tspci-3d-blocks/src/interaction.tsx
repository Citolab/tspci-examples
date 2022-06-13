import { useEffect } from "preact/hooks";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { ActionType, StateModel } from "./store";
import configProps from "./config.json";
import { useStore } from "@citolab/preact-store";
type PropTypes = typeof configProps;

export const Interaction = (props: { config: PropTypes }) => {
  const { config } = props;

  let voxel: VoxelPainterClass;
  let dom: HTMLElement;

  const [state, dispatch] = useStore<StateModel, ActionType>(
    (type, payload) => {
      // console.log(`type: ${type}, payload: ${payload}`);
    }
  );

  useEffect(() => {
    voxel = new VoxelPainterClass({
      width: config.width,
      height: config.height,
      gridDivisions: config.gridDivisions,
      cubePixelSize: config.cubePixelSize,
      htmlElementToAppendTo: dom,
    });
    voxel.restoreObjects(state.cubes);

    dom?.addEventListener(
      "onPositionsChanged",
      (positionsArray: CustomEvent) => {
        dispatch<{ x: number }>("SET_STATE", positionsArray.detail);
      }
    );
    return () => {
      voxel = null;
    };
  }, []);

  return (
    <div className="w-full h-full" ref={(node) => (dom = node as HTMLElement)}>
      <img
        className="hidden"
        id="arrow-front"
        width={100}
        src="data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8' standalone='no'%3F%3E%3Csvg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' preserveAspectRatio='xMidYMid meet' viewBox='261.8571428571428 254.1626632325672 162.22142818995894 146.3691395493506' width='200' height='200'%3E%3Cdefs%3E%3Ctext id='a1z4szAWH' x='224' y='340' font-size='74' font-family='Arial' font-weight='normal' font-style='normal' letter-spacing='0' alignment-baseline='before-edge' transform='matrix(1 0 0 1 42.85714285714266 -35.03511884375507)' style='line-height:100%25' xml:space='preserve' dominant-baseline='text-before-edge'%3E%3Ctspan x='224' dy='0em' alignment-baseline='before-edge' dominant-baseline='text-before-edge' text-anchor='start'%3Efront%3C/tspan%3E%3C/text%3E%3Cpath d='M361.75 292.53L345.54 292.53L345.54 326.2L340.59 326.2L340.59 292.53L322.19 292.53L332.08 273.84L341.97 255.16L351.86 273.84L361.75 292.53Z' id='c7lzESt7db'%3E%3C/path%3E%3C/defs%3E%3Cg%3E%3Cg id='c4VrQc8u2d'%3E%3Cuse xlink:href='%23a1z4szAWH' opacity='1' fill='%23000000' fill-opacity='1'%3E%3C/use%3E%3C/g%3E%3Cg%3E%3Cuse xlink:href='%23c7lzESt7db' opacity='1' fill='%23000000' fill-opacity='1'%3E%3C/use%3E%3C/g%3E%3C/g%3E%3C/svg%3E"
      />
    </div>
  );
};

class VoxelPainterClass {
  private camera: THREE.PerspectiveCamera;

  private controls: OrbitControls;
  private target = new THREE.Vector3(0, 0, 0);

  private canvasWidth: number;
  private canvasHeight: number;
  private gridDivisions = 4;
  private gridSize = 400;
  private scene: THREE.Scene;
  private cubeColor: string | number = 0x00b6dd;
  private rollOverMaterial: THREE.MeshLambertMaterial;
  private rollOverMesh: THREE.Mesh<THREE.BoxBufferGeometry, any>;
  private cubeGeo: THREE.BoxBufferGeometry;
  private cubeMaterial: THREE.MeshLambertMaterial;
  private cubeMaterialSelected: THREE.MeshLambertMaterial;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private plane: THREE.Mesh<THREE.PlaneBufferGeometry, THREE.MeshBasicMaterial>;
  private objects: any[] = [];
  private labelMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private renderer: THREE.WebGLRenderer;
  private isMouseDown: boolean;
  private mouseMoveRotateActive = true;
  private isRotating = false;
  private arrowFront: CanvasImageSource;
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
    // move camera x pixels down (e.g. -75px) so it's not centered, but more in bottom of screen
    this.camera.setViewOffset(
      this.canvasWidth,
      this.canvasHeight,
      0,
      -150,
      this.canvasWidth,
      this.canvasHeight
    );

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    this.arrowFront = this.domEl.querySelector(
      "#arrow-front"
    ) as CanvasImageSource;

    if (props) {
      if (props.gridDivisions && props.cubePixelSize) {
        this.gridDivisions = props.gridDivisions;
        this.gridSize = props.gridDivisions * props.cubePixelSize;
      }
    }

    const cubeSideSize = this.gridSize / this.gridDivisions;

    // materials
    const cubeStandard = new THREE.MeshLambertMaterial({
      color: this.cubeColor,
      map: new THREE.TextureLoader().load(
        this.getCubeTexture("square-1px.png")
      ),
    });
    const cubeTransparent = new THREE.MeshLambertMaterial({
      color: this.cubeColor,
      opacity: 0.5,
      transparent: true,
      map: new THREE.TextureLoader().load(
        this.getCubeTexture("square-1px.png")
      ),
    });
    const cubeTransparentRed = new THREE.MeshLambertMaterial({
      color: 0xff0000,
      opacity: 0.5,
      transparent: true,
      map: new THREE.TextureLoader().load(
        this.getCubeTexture("square-1px.png")
      ),
    });

    // roll-over helpers

    const rollOverGeo = new THREE.BoxBufferGeometry(
      cubeSideSize,
      cubeSideSize,
      cubeSideSize
    );

    if (this.gridDivisions % 2 == 1) {
      rollOverGeo.applyMatrix4(
        new THREE.Matrix4().makeTranslation(0, cubeSideSize / 2, 0)
      );
    }

    this.rollOverMaterial = cubeTransparent;
    this.rollOverMesh = new THREE.Mesh(rollOverGeo, this.rollOverMaterial);
    this.scene.add(this.rollOverMesh);

    // cubes

    this.cubeGeo = new THREE.BoxBufferGeometry(
      cubeSideSize,
      cubeSideSize,
      cubeSideSize
    );

    if (this.gridDivisions % 2 == 1) {
      this.cubeGeo.applyMatrix4(
        new THREE.Matrix4().makeTranslation(0, cubeSideSize / 2, 0)
      );
    }

    this.cubeMaterial = cubeStandard;
    this.cubeMaterialSelected = cubeTransparentRed;

    // grid

    const gridHelper = new THREE.GridHelper(this.gridSize, this.gridDivisions);
    // gridHelper.applyMatrix4(new THREE.Matrix4().makeTranslation(cubeSideSize / 2, 0, cubeSideSize / 2));

    this.scene.add(gridHelper);

    //
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // plane under grid
    const geometry = new THREE.PlaneBufferGeometry(
      this.gridSize,
      this.gridSize
    );
    geometry.rotateX(-Math.PI / 2);
    this.plane = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.plane.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -1, 0));

    this.scene.add(this.plane);
    this.objects.push(this.plane);

    // lights
    const ambientLight = new THREE.AmbientLight(0x606060);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff);
    // directionalLight.position.set( 1, 0.75, 0.5 ).normalize();
    directionalLight.position.set(0, 1, 0.75).normalize();
    this.scene.add(directionalLight);

    // label shown at the frontside of the grid for better reference when rotating
    this.labelMesh = this.getFrontsideLabel();
    this.scene.add(this.labelMesh);

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);

    const canvas = this.renderer.domElement as HTMLCanvasElement;
    canvas.setAttribute("id", "voxelPainterCanvas");

    this.domEl.appendChild(canvas);

    // add Orbital for drag + zoom
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableKeys = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    // this.controls.update();

    this.domEl.addEventListener(
      "mousemove",
      (e) => this.onDocumentMouseMove(e),
      false
    );
    this.domEl.addEventListener(
      "mousedown",
      (e) => this.onDocumentMouseDown(e),
      false
    );
    this.domEl.addEventListener(
      "mouseup",
      (e) => this.onDocumentMouseUp(e),
      false
    );

    if (props.width && props.height) {
      window.addEventListener("resize", () => this.onWindowResize(), false);
    }

    this.render();
  }

  private onWindowResize() {
    this.canvasWidth = this.domEl.clientWidth; // props && props.width ? props.width : window.innerWidth;
    this.canvasHeight = this.domEl.clientHeight;
    this.camera.aspect = this.canvasWidth / this.canvasHeight;
    this.camera.setViewOffset(
      this.canvasWidth,
      this.canvasHeight,
      0,
      -150,
      this.canvasWidth,
      this.canvasHeight
    );
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
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

  private addNewCube() {
    const voxel = new THREE.Mesh(this.cubeGeo, this.cubeMaterial);

    voxel.position.copy(this.rollOverMesh.position);

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
    this.scene.children.forEach((element: THREE.Mesh) => {
      if (this.isCube(element)) {
        element.material = this.cubeMaterial;
      }
    });
  }

  private setCubeOpacity(uuid) {
    this.scene.children.forEach((element: THREE.Mesh) => {
      if (element.uuid == uuid) {
        element.material = this.cubeMaterialSelected;
      } else if (this.isCube(element)) {
        element.material = this.cubeMaterial;
      }
    });
  }

  private isCube(element) {
    const gridId = this.plane.uuid;
    const labelId = this.labelMesh.uuid;
    const cubeHelperId = this.rollOverMesh.uuid;

    return (
      element.type.toLowerCase() == "mesh" &&
      element.uuid != cubeHelperId &&
      element.uuid != gridId &&
      element.uuid != labelId
    );
  }

  private getFrontsideLabel() {
    const svg_width = 200;

    const height = svg_width;
    const canvas1width = this.gridSize;
    const canvas1height = height;

    const canvas1 = document.createElement("canvas");
    canvas1.width = canvas1width;
    canvas1.height = canvas1height;

    const x = canvas1.width / 2;

    const context1 = canvas1.getContext("2d");

    // -- set a text label --
    // context1.font = "Bold 40px Arial";
    // context1.fillStyle = "rgba(255,0,0,0.95)";
    // context1.textAlign = "center";
    // context1.fillText('voorkant', x, height);

    // -- set a label with img/svg, make sure it's in the index.html --
    context1.drawImage(this.arrowFront, x - svg_width / 2, 0);

    // -- show the rectangular space reserved for this label --
    // context1.fillRect(0, 0, canvas1width, canvas1height);

    // canvas contents will be used for a texture
    const texture1 = new THREE.Texture(canvas1);
    texture1.needsUpdate = true;

    const material1 = new THREE.MeshBasicMaterial({
      map: texture1,
      side: THREE.DoubleSide,
    });
    material1.transparent = true;

    const geometry1 = new THREE.PlaneGeometry(canvas1width, canvas1height);
    geometry1.rotateX(-Math.PI / 2);

    const label = new THREE.Mesh(geometry1, material1);
    const labelZ = (this.gridSize + height) / 2; //(this.gridSize / 2) + height;
    label.position.set(0, 0, labelZ);

    return label;
  }

  private getCubeTexture(pngName: string = null) {
    const square_1px =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF8WlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNi4wLWMwMDIgNzkuMTY0NDYwLCAyMDIwLzA1LzEyLTE2OjA0OjE3ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjEuMiAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDIwLTA2LTI2VDE0OjUzOjE2KzAyOjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyMC0wNi0yNlQxNTo1Mzo1OCswMjowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMC0wNi0yNlQxNTo1Mzo1OCswMjowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHBob3Rvc2hvcDpJQ0NQcm9maWxlPSJzUkdCIElFQzYxOTY2LTIuMSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDplMDI3NTUzZC01MGY2LTc5NDUtOWJmMi1iZTExNDQ5OGI4YmIiIHhtcE1NOkRvY3VtZW50SUQ9ImFkb2JlOmRvY2lkOnBob3Rvc2hvcDo3MGViZWRlZi1hZWYzLTYzNDEtYTAxZi1hNDI4MzU3Yjg5MGMiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo0NDhhODBkOC1hZWUyLWFkNDAtOTE1ZS04NTQ2MDgwYjFiMTYiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjQ0OGE4MGQ4LWFlZTItYWQ0MC05MTVlLTg1NDYwODBiMWIxNiIgc3RFdnQ6d2hlbj0iMjAyMC0wNi0yNlQxNDo1MzoxNiswMjowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIxLjIgKFdpbmRvd3MpIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDplMDI3NTUzZC01MGY2LTc5NDUtOWJmMi1iZTExNDQ5OGI4YmIiIHN0RXZ0OndoZW49IjIwMjAtMDYtMjZUMTU6NTM6NTgrMDI6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyMS4yIChXaW5kb3dzKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz44whNcAAAAZ0lEQVRoge3PQQ3AMAzAwGT8OXcc1oc16Q6BPfNzOzPnnDrjo9196oZbBmoGagZqBmoGagZqBmoGagZqBmoGagZqBmoGagZqBmoGagZqBmoGagZqBmoGagZqBmoGagZqBmoGaga49AJT1wN8ckHKHwAAAABJRU5ErkJggg==";
    const square_thick =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAVklEQVRo3u3RsQ0AIAwDwYT9dzYlTIAUcd+l8ylV0t/1fSSZMbrP7DX9AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACSXrQBS9IDcNBhO+QAAAAASUVORK5CYII=";
    const square_thin =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF8WlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNi4wLWMwMDIgNzkuMTY0NDYwLCAyMDIwLzA1LzEyLTE2OjA0OjE3ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjEuMiAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDIwLTA2LTI2VDE0OjUzOjE2KzAyOjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyMC0wNi0yNlQxNTo1MzoyMCswMjowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMC0wNi0yNlQxNTo1MzoyMCswMjowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHBob3Rvc2hvcDpJQ0NQcm9maWxlPSJzUkdCIElFQzYxOTY2LTIuMSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpjZGFhYmRjNy1hMWI0LTMwNGEtOTQ0ZS1lZmYxNjllNWJlYTYiIHhtcE1NOkRvY3VtZW50SUQ9ImFkb2JlOmRvY2lkOnBob3Rvc2hvcDpmMDhiNWEyOS0wYmY1LTRmNGMtOGZkMS0wMzNiZWFiNzhiNTMiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpkZDUzOWRmNy0zYjU2LWRiNDItOTFjMS01Mjk2NWU4YTVkZDkiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOmRkNTM5ZGY3LTNiNTYtZGI0Mi05MWMxLTUyOTY1ZThhNWRkOSIgc3RFdnQ6d2hlbj0iMjAyMC0wNi0yNlQxNDo1MzoxNiswMjowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIxLjIgKFdpbmRvd3MpIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpjZGFhYmRjNy1hMWI0LTMwNGEtOTQ0ZS1lZmYxNjllNWJlYTYiIHN0RXZ0OndoZW49IjIwMjAtMDYtMjZUMTU6NTM6MjArMDI6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyMS4yIChXaW5kb3dzKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz6WaHW1AAAAZ0lEQVRoge3PoQGAQAwEwYT+e34EHYAYwY45ezsTa58559gfL+zuzFz6xlcFaAVoBWgFaAVoBWgFaAVoBWgFaAVoBWgFaAVoBWgFaAVoBWgFaAVoBWgFaAVoBWgFaAVoBWgFaAXk726mewN4gL/h6QAAAABJRU5ErkJggg==";

    switch (pngName) {
      case "square-thick.png":
        return square_thick;
      case "square_thin.png":
        return square_thin;
      default:
      case "square-1px.png":
        return square_1px;
    }
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
      const voxel = new THREE.Mesh(this.cubeGeo, this.cubeMaterial);

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

      voxel.position.set(coordsX, coordsY, coordsZ);

      this.scene.add(voxel);
      this.objects.push(voxel);
    });

    this.render();
  }
}
