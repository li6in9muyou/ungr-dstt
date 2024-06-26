import { expect, test } from "vitest";
import { FactoryMap, Agv, Job, simulation } from "./index";
import { planShortestPath } from "./djShortest";
import rng from "mersenne-twister";

test("FactoryMap", () => {
  // TODO: document expected behaviour with it("should ...", ...)
  const crossroads = new FactoryMap(5);

  const [X, T, R, B, L, bad] = crossroads.listNodes();
  expect(bad).toBeUndefined();

  crossroads.twoWayLink(X, [T, R, B, L]);
  expect(crossroads.getNeighbours(X)).toEqual(
    expect.arrayContaining([T, R, B, L]),
  );

  const foo = new Agv(crossroads, T, () => []);
  const bar = new Agv(crossroads, B, () => []);
  expect(crossroads.tryLock(X, foo)).toBeTruthy();
  expect(crossroads.tryLock(X, bar)).toBeFalsy();
  expect(crossroads.tryLock(X, bar)).toBeFalsy();
  expect(crossroads.tryLock(X, bar)).toBeFalsy();

  crossroads.unlock(X, bar);
  expect(crossroads.tryLock(X, bar)).toBeFalsy();
  crossroads.unlock(X, foo);
  expect(crossroads.tryLock(X, bar)).toBeTruthy();

  expect(crossroads.tryLock(NaN, bar)).toBeFalsy();
});

test("deadlock 2 agvs", () => {
  const crossroads = new FactoryMap(5);

  const [X, T, R, B, L] = crossroads.listNodes();
  crossroads.twoWayLink(X, [T, R, B, L]);

  const jobs: Job[] = [new Job(1, T, L), new Job(1, B, R)];

  const agvs = [
    new Agv(crossroads, T, planShortestPath),
    new Agv(crossroads, B, planShortestPath),
  ];

  const ITERATION_CNT = 6;
  simulation({ jobs: jobs, agvs: agvs, iteration_cnt: ITERATION_CNT });
  expect(jobs.every((job) => job.completion_time < ITERATION_CNT)).toBeTruthy();
});

test("crossroads", () => {
  const crossroads = new FactoryMap(5);

  const [X, T, R, B, L] = crossroads.listNodes();
  crossroads.twoWayLink(X, [T, R, B, L]);

  const jobs: Job[] = [
    new Job(1, T, B),
    new Job(1, L, R),
    new Job(1, L, B),
    new Job(1, R, B),
  ];

  const agvs = [new Agv(crossroads, X, planShortestPath)];
  simulation({ jobs: jobs, agvs: agvs, iteration_cnt: 25 });
});

test("trivial", () => {
  const straightLine = new FactoryMap(3);

  const [A, M, B] = straightLine.listNodes();
  straightLine.twoWayLink(A, [M]);
  straightLine.twoWayLink(M, [B]);

  const jobs: Job[] = [new Job(1, B, A), new Job(2, B, A)];

  const agvs = [new Agv(straightLine, M, planShortestPath)];
  expect(planShortestPath(straightLine, B, A)).toStrictEqual([B, M, A]);

  simulation({
    skipStatistics: true,
    jobs: jobs,
    agvs: agvs,
    iteration_cnt: 18,
  });
});

test("fully connected trigangle factory", () => {
  const simpliestFactory = new FactoryMap(3);
  const [A, B, C] = simpliestFactory.listNodes();
  simpliestFactory.twoWayLink(A, [B, C]);
  simpliestFactory.twoWayLink(B, [C]);

  const jobs: Job[] = [
    new Job(1, B, A),
    new Job(1, A, B),
    new Job(2, B, A),
    new Job(5, B, A),
  ];

  const agvs = [new Agv(simpliestFactory, A, planShortestPath)];

  simulation({ jobs: jobs, agvs: agvs, iteration_cnt: 20 });
  expect(1 + 1).toBe(2);
});

function sample<T>(
  array: T[],
  n = 1,
  random_fn: () => number = Math.random,
): T[] {
  console.assert(
    array.length > n,
    "sample: array.length must be bigger than n",
  );

  const result: T[] = [];
  const taken = new Set<number>();

  while (result.length < n) {
    const i = Math.floor(random_fn() * array.length);
    if (!taken.has(i)) {
      result.push(array[i]);
      taken.add(i);
    }
  }

  return result;
}

function connectBetweenNodes(world: FactoryMap, nodes: number[]): void {
  for (let i = 0; i < nodes.length - 1; i++) {
    world.twoWayLink(nodes[i], [nodes[i + 1]]);
  }
}

function zip(
  fn: (zipped: any[], index: number, arrays: any[][]) => any,
  ...arrays: any[][]
): void {
  const arrLen = arrays[0].length;
  console.assert(
    arrays.every((arr) => arr.length === arrLen),
    "zip: arrays must have same length",
  );

  for (let i = 0; i < arrLen; i++) {
    const zipped: any[] = [];
    for (const array of arrays) {
      zipped.push(array[i]);
    }
    fn(zipped, i, arrays);
  }
}

function makeGrid(size: number) {
  const grid = new FactoryMap(size * size);
  const nodes = grid.listNodes();
  const rows = Array.from(nodes).reduce((manyRow, node) => {
    let lastRow = manyRow[manyRow.length - 1];
    const shouldNextRow = lastRow === undefined || lastRow.length === size;
    if (shouldNextRow) {
      lastRow = [];
      manyRow.push(lastRow);
    }
    lastRow.push(node);
    return manyRow;
  }, [] as number[][]);

  rows.forEach((row) => connectBetweenNodes(grid, row));
  zip((column: number[]) => connectBetweenNodes(grid, column), ...rows);

  return grid;
}

test("10x10 grid single agv", () => {
  const GRID_SIZE = 10;
  const JOB_CNT = 3;

  const grid = makeGrid(GRID_SIZE);

  const adj = grid.listAdjacentNodes();
  const corners = Array.from(adj.entries())
    .filter(([_, ngb]) => ngb.length === 2)
    .map(([k, _]) => k);

  const gen = new rng(55200628 + 2);
  const jobs: Job[] = new Array(JOB_CNT).fill(null).map((_, idx) => {
    const arrive_at = idx + 1;
    const [from, to] = sample(corners, 2, gen.random.bind(gen));
    return new Job(arrive_at, from, to);
  });

  const agvs: Agv[] = [new Agv(grid, grid.listNodes()[3], planShortestPath)];

  simulation({ jobs: jobs, agvs: agvs, iteration_cnt: GRID_SIZE * 30 });
});

test("10x10 grid multiple agvs", () => {
  const GRID_SIZE = 10;
  const JOB_CNT = 6;

  const grid = makeGrid(GRID_SIZE);

  const corners = Array.from(grid.listAdjacentNodes().entries())
    .filter(([_, ngb]) => ngb.length === 2)
    .map(([k, _]) => k);

  const gen = new rng(55200628 * 1.2);
  const jobs: Job[] = new Array(JOB_CNT).fill(null).map((_, idx) => {
    const arrive_at = idx + 1;
    const [from, to] = sample(corners, 2, gen.random.bind(gen));
    return new Job(arrive_at, from, to);
  });

  const agvs: Agv[] = [
    new Agv(grid, grid.listNodes()[14], planShortestPath),
    new Agv(grid, grid.listNodes()[25], planShortestPath),
  ];

  simulation({ jobs: jobs, agvs: agvs, iteration_cnt: GRID_SIZE * 9 });
});
