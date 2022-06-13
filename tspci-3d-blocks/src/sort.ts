export const sort = <T, K>(list: T[], getKey: (item: T) => K, desc = false) => {
  list.sort((a: T, b: T) => {
    const valueA = getKey(a);
    const valueB = getKey(b);
    if (valueA < valueB) {
      return !desc ? -1 : 1;
    } else if (valueA > valueB) {
      return !desc ? 1 : -1;
    } else {
      return 0;
    }
  });
  return list;
};

export const planeProjection = (cubes: { x: number; y: number; z: number }[], plane: "x" | "y" | "z", size, grid) => {
  let axes3D = ["x", "y", "z"]; // define all axes
  let axes2D = axes3D.filter((axis) => axis !== plane); // filter the axis which we want to project on
  const planeProjection = []; // create a 2d plane which we set true or false for found blocks
  for (let axisOne = 0; axisOne < grid; axisOne++) {
    for (let axisTwo = 0; axisTwo < grid; axisTwo++) {
      // if cubes found
      const found = cubes.filter((c) => c[axes2D[0]] == axisOne && c[axes2D[1]] == axisTwo).length; // if cubes found
      planeProjection.push({ [axes2D[0]]: axisOne, [axes2D[1]]: axisTwo, found: found > 0 }); // put them in 2dimension plane
    }
  }
  return planeProjection;
};

export const planesToScene = (planes, size, grid) => {
  let cubes = [];
  const { xPlane, yPlane, zPlane } = planes;
  for (let x = 0; x < grid; x++) {
    for (let y = 0; y < grid; y++) {
      for (let z = 0; z < grid; z++) {
        let found = false;
        let cube = { x: null, y: null, z: null };
        if (xPlane.find((c) => c.y == y && c.z == z)?.found) {
          cube.y = y;
          cube.z = z;
          found = yPlane.find((c) => c.x == x && c.z == z)?.found && zPlane.find((c) => c.x == x && c.y == y)?.found;
          cube.x = x;
        } else if (yPlane.find((c) => c.x == x && c.z == z)?.found) {
          cube.x = x;
          cube.z = z;
          found = zPlane.find((c) => c.x == x && c.y == y)?.found && xPlane.find((c) => c.y == y && c.z == z)?.found;
          cube.y = y;
        } else if (zPlane.find((c) => c.x == x && c.y == y)?.found) {
          cube.x = x;
          cube.y = y;
          found = xPlane.find((c) => c.y == y && c.z == z)?.found && yPlane.find((c) => c.x == x && c.z == z)?.found;
          cube.z = z;
        }
        // if cubes found
        found && cubes.push({ x, y, z }); // put them in 3dimensional plane
      }
    }
  }
  return cubes;
};
