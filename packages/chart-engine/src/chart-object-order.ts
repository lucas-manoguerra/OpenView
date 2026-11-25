export type ChartObjectKind = 'price-series' | 'volume' | 'indicator' | 'drawing';

export type ChartObjectOrderItem = Readonly<{
  kind: ChartObjectKind;
  id: string;
}>;

export type ChartObjectOrderAction = 'front' | 'forward' | 'backward' | 'back';

const assertUniqueObjects = (objects: readonly ChartObjectOrderItem[]): void => {
  const keys = new Set<string>();

  for (const object of objects) {
    if (object.id.length === 0) {
      throw new RangeError('Chart object order items must have an id.');
    }

    const key = `${object.kind}:${object.id}`;
    if (keys.has(key)) {
      throw new RangeError('Chart object order items must be unique.');
    }
    keys.add(key);
  }
};

export const createChartObjectOrder = (
  objects: readonly ChartObjectOrderItem[],
): readonly ChartObjectOrderItem[] => {
  assertUniqueObjects(objects);
  return Object.freeze(objects.map((object) => Object.freeze({ ...object })));
};

export const reconcileChartObjectOrder = (
  currentOrder: readonly ChartObjectOrderItem[],
  availableObjects: readonly ChartObjectOrderItem[],
): readonly ChartObjectOrderItem[] => {
  assertUniqueObjects(currentOrder);
  assertUniqueObjects(availableObjects);

  const available = new Map(
    availableObjects.map((object) => [`${object.kind}:${object.id}`, object]),
  );
  const retained = currentOrder
    .map((object) => available.get(`${object.kind}:${object.id}`))
    .filter((object): object is ChartObjectOrderItem => object !== undefined);
  const retainedKeys = new Set(retained.map((object) => `${object.kind}:${object.id}`));
  const added = availableObjects.filter(
    (object) => !retainedKeys.has(`${object.kind}:${object.id}`),
  );

  return createChartObjectOrder([...retained, ...added]);
};

export const moveChartObjectInOrder = (
  order: readonly ChartObjectOrderItem[],
  target: ChartObjectOrderItem,
  action: ChartObjectOrderAction,
): readonly ChartObjectOrderItem[] => {
  assertUniqueObjects(order);
  const targetKey = `${target.kind}:${target.id}`;
  const currentIndex = order.findIndex((object) => `${object.kind}:${object.id}` === targetKey);

  if (currentIndex === -1) {
    return createChartObjectOrder(order);
  }

  const nextIndex =
    action === 'front'
      ? order.length - 1
      : action === 'back'
        ? 0
        : action === 'forward'
          ? Math.min(order.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);

  if (nextIndex === currentIndex) {
    return order;
  }

  const nextOrder = [...order];
  const [moved] = nextOrder.splice(currentIndex, 1);
  if (moved === undefined) {
    return order;
  }
  nextOrder.splice(nextIndex, 0, moved);
  return createChartObjectOrder(nextOrder);
};
