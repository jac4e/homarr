import { GridStack, GridStackNode } from 'fily-publish-gridstack';
import {
  createRef,
  MutableRefObject,
  RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useConfigContext } from '../../../../config/provider';
import { useConfigStore } from '../../../../config/store';
import { useResize } from '../../../../hooks/use-resize';
import { useScreenLargerThan } from '../../../../hooks/useScreenLargerThan';
import { AppType } from '../../../../types/app';
import { AreaType } from '../../../../types/area';
import { IWidget } from '../../../../widgets/widgets';
import { useEditModeStore } from '../../Views/useEditModeStore';
import { initializeGridstack } from './init-gridstack';

interface UseGristackReturnType {
  apps: AppType[];
  widgets: IWidget<string, any>[];
  refs: {
    wrapper: RefObject<HTMLDivElement>;
    items: MutableRefObject<Record<string, RefObject<HTMLDivElement>>>;
    gridstack: MutableRefObject<GridStack | undefined>;
  };
}

const useWrapperColumnCount = () => {
  const isLargerThanSm = useScreenLargerThan('sm');
  const isLargerThanXl = useScreenLargerThan('xl');

  return typeof isLargerThanXl === 'undefined' || isLargerThanXl ? 12 : isLargerThanSm ? 6 : 3;
};

export const useGridstack = (
  areaType: 'wrapper' | 'category' | 'sidebar',
  areaId: string
): UseGristackReturnType => {
  const wrapperColumnCount = useWrapperColumnCount();
  const isEditMode = useEditModeStore((x) => x.enabled);
  const { config, configVersion, name: configName } = useConfigContext();
  const updateConfig = useConfigStore((x) => x.updateConfig);
  // define reference for wrapper - is used to calculate the width of the wrapper
  const wrapperRef = useRef<HTMLDivElement>(null);
  // references to the diffrent items contained in the gridstack
  const itemRefs = useRef<Record<string, RefObject<HTMLDivElement>>>({});
  // reference of the gridstack object for modifications after initialization
  const gridRef = useRef<GridStack>();
  // width of the wrapper (updating on page resize)
  const { width } = useResize(wrapperRef);
  const root: HTMLHtmlElement = useMemo(() => document.querySelector(':root')!, []);

  const items = useMemo(
    () =>
      config?.apps.filter(
        (x) =>
          x.area.type === areaType &&
          (x.area.type === 'sidebar'
            ? x.area.properties.location === areaId
            : x.area.properties.id === areaId)
      ) ?? [],
    [configVersion, config?.apps.length]
  );
  const widgets = useMemo(() => {
    if (!config) return [];
    return config.widgets.filter(
      (w) =>
        w.area.type === areaType &&
        (w.area.type === 'sidebar'
          ? w.area.properties.location === areaId
          : w.area.properties.id === areaId)
    );
  }, [configVersion, config?.widgets.length]);

  // define items in itemRefs for easy access and reference to items
  if (Object.keys(itemRefs.current).length !== items.length + (widgets ?? []).length) {
    items.forEach(({ id }: { id: keyof typeof itemRefs.current }) => {
      itemRefs.current[id] = itemRefs.current[id] || createRef();
    });
    (widgets ?? []).forEach(({ id }) => {
      itemRefs.current[id] = itemRefs.current[id] || createRef();
    });
  }

  // change column count depending on the width and the gridRef
  useEffect(() => {
    if (areaType === 'sidebar') return;
    gridRef.current?.column(
      wrapperColumnCount,
      (column, prevColumn, newNodes, nodes) => {
        let nextRow = 0;
        let available = column;

        if (column === prevColumn) {
          newNodes.concat(nodes);
          return;
        }

        const getGridstackAttribute = (node: GridStackNode, path: 'x' | 'y' | 'w' | 'h'): number => parseInt(node.el!.getAttribute(`data-gridstack-${path}`)!, 10);

        const getGridstackAttributes = (node: GridStackNode) => ({
          width: getGridstackAttribute(node, 'w'),
          height: getGridstackAttribute(node, 'h'),
          x: getGridstackAttribute(node, 'x'),
          y: getGridstackAttribute(node, 'y'),
        });

        const sortNodes = (a: GridStackNode, b: GridStackNode) => {
          const aAttributes = getGridstackAttributes(a);
          const bAttributes = getGridstackAttributes(b);

          const differenceY = aAttributes.y - bAttributes.y;

          return differenceY !== 0 ? differenceY : aAttributes.x - bAttributes.x;
        };

        const sorted = nodes.sort(sortNodes);

        console.log(sorted);

        sorted.forEach((node) => {
          const newnode = node;
          const width = parseInt(newnode.el!.getAttribute('data-gridstack-w')!, 10);
          const height = parseInt(newnode.el!.getAttribute('data-gridstack-h')!, 10);
          const x = parseInt(newnode.el!.getAttribute('data-gridstack-x')!, 10);
          const y = parseInt(newnode.el!.getAttribute('data-gridstack-y')!, 10);
          const moveYDown = 1;

          if (column === 3) {
            newnode.x = available >= width ? 3 - available : 0;
            newnode.y = available === 3 || available >= width ? nextRow : nextRow += moveYDown;

            if (width > 3) {
              newnode.w = 3;
              nextRow += moveYDown;
              available = 3;
            } else if (available >= width) {
              available -= width;
              if (available === 0) {
                nextRow += moveYDown;
                available = 3;
              }
            } else if (available < width) {
              newnode.y = newnode.y! + moveYDown;
              available = 3 - width;
              nextRow += moveYDown;
            }
          } else if (column === 6) {
            newnode.x = available >= width ? 6 - available : 0;
            newnode.y = nextRow;

            if (width > 6) {
              newnode.w = 6;
              nextRow += moveYDown;
              available = 6;
            } else if (available >= width) {
              available -= width;
              if (available === 0) {
                nextRow += moveYDown;
                available = 6;
              }
            } else if (available < width) {
              newnode.y = newnode.y! + moveYDown;
              available = 6 - width;
              nextRow += moveYDown;
            }
          } else {
            newnode.x = y % 2 === 1 ? x + 6 : x;
            newnode.y = Math.floor(y / 2);
          }

          console.log(newnode);

          newNodes.push(newnode);
        });
      }
    );
  }, [wrapperColumnCount]);

  useEffect(() => {
    if (width === 0) return;
    const widgetWidth = width / wrapperColumnCount;
    // widget width is used to define sizes of gridstack items within global.scss
    root.style.setProperty('--gridstack-widget-width', widgetWidth.toString());
    gridRef.current?.cellHeight(widgetWidth);
  }, [width, wrapperColumnCount]);

  const onChange = isEditMode
    ? (changedNode: GridStackNode) => {
        if (!configName) return;

        const itemType = changedNode.el?.getAttribute('data-type');
        const itemId = changedNode.el?.getAttribute('data-id');
        if (!itemType || !itemId) return;

        // Updates the config and defines the new position of the item
        updateConfig(configName, (previous) => {
          const currentItem =
            itemType === 'app'
              ? previous.apps.find((x) => x.id === itemId)
              : previous.widgets.find((x) => x.id === itemId);
          if (!currentItem) return previous;

          currentItem.shape = {
            location: {
              x: changedNode.x ?? currentItem.shape.location.x,
              y: changedNode.y ?? currentItem.shape.location.y,
            },
            size: {
              width: changedNode.w ?? currentItem.shape.size.width,
              height: changedNode.h ?? currentItem.shape.size.height,
            },
          };

          if (itemType === 'app') {
            return {
              ...previous,
              apps: [
                ...previous.apps.filter((x) => x.id !== itemId),
                { ...(currentItem as AppType) },
              ],
            };
          }

          return {
            ...previous,
            widgets: [
              ...previous.widgets.filter((x) => x.id !== itemId),
              { ...(currentItem as IWidget<string, any>) },
            ],
          };
        });
      }
    : () => {};

  const onAdd = isEditMode
    ? (addedNode: GridStackNode) => {
        if (!configName) return;

        const itemType = addedNode.el?.getAttribute('data-type');
        const itemId = addedNode.el?.getAttribute('data-id');
        if (!itemType || !itemId) return;

        // Updates the config and defines the new position and wrapper of the item
        updateConfig(
          configName,
          (previous) => {
            const currentItem =
              itemType === 'app'
                ? previous.apps.find((x) => x.id === itemId)
                : previous.widgets.find((x) => x.id === itemId);
            if (!currentItem) return previous;

            if (areaType === 'sidebar') {
              currentItem.area = {
                type: areaType,
                properties: {
                  location: areaId as 'right' | 'left',
                },
              };
            } else {
              currentItem.area = {
                type: areaType,
                properties: {
                  id: areaId,
                },
              };
            }

            currentItem.shape = {
              location: {
                x: addedNode.x ?? currentItem.shape.location.x,
                y: addedNode.y ?? currentItem.shape.location.y,
              },
              size: {
                width: addedNode.w ?? currentItem.shape.size.width,
                height: addedNode.h ?? currentItem.shape.size.height,
              },
            };

            if (itemType === 'app') {
              return {
                ...previous,
                apps: [
                  ...previous.apps.filter((x) => x.id !== itemId),
                  { ...(currentItem as AppType) },
                ],
              };
            }

            return {
              ...previous,
              widgets: [
                ...previous.widgets.filter((x) => x.id !== itemId),
                { ...(currentItem as IWidget<string, any>) },
              ],
            };
          },
          (prev, curr) => {
            const isApp = itemType === 'app';

            if (isApp) {
              const currItem = curr.apps.find((x) => x.id === itemId);
              const prevItem = prev.apps.find((x) => x.id === itemId);
              if (!currItem || !prevItem) return false;

              return (
                currItem.area.type !== prevItem.area.type ||
                Object.entries(currItem.area.properties).some(
                  ([key, value]) =>
                    prevItem.area.properties[key as keyof AreaType['properties']] !== value
                )
              );
            }

            const currItem = curr.widgets.find((x) => x.id === itemId);
            const prevItem = prev.widgets.find((x) => x.id === itemId);
            if (!currItem || !prevItem) return false;

            return (
              currItem.area.type !== prevItem.area.type ||
              Object.entries(currItem.area.properties).some(
                ([key, value]) =>
                  prevItem.area.properties[key as keyof AreaType['properties']] !== value
              )
            );
          }
        );
      }
    : () => {};

  // initialize the gridstack
  useLayoutEffect(() => {
    initializeGridstack(
      areaType,
      wrapperRef,
      gridRef,
      itemRefs,
      areaId,
      items,
      widgets ?? [],
      isEditMode,
      wrapperColumnCount,
      {
        onChange,
        onAdd,
      }
    );
  }, [items, wrapperRef.current, widgets]);

  return {
    apps: items,
    widgets: widgets ?? [],
    refs: {
      items: itemRefs,
      wrapper: wrapperRef,
      gridstack: gridRef,
    },
  };
};
