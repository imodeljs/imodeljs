/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { immerable } from "immer";
import _ from "lodash";
import { assert } from "@bentley/bentleyjs-core";
import { PropertyRecord } from "@bentley/ui-abstract";
import { CheckBoxState } from "@bentley/ui-core";
import { DelayLoadedTreeNodeItem, ImmediatelyLoadedTreeNodeItem, TreeNodeItem } from "../TreeDataProvider";
import { SparseArray, SparseTree } from "./internal/SparseTree";

/**
 * Immutable data structure that describes tree node.
 * @public
 */
export interface TreeModelNode {
  readonly id: string;
  readonly parentId: string | undefined;
  readonly depth: number;

  readonly isLoading?: boolean;
  readonly numChildren: number | undefined;

  readonly description: string | undefined;
  readonly isExpanded: boolean;
  readonly label: PropertyRecord;
  readonly isSelected: boolean;

  /** Specifies that node is in editing mode. It holds callbacks that are used by node editor. */
  readonly editingInfo?: TreeModelNodeEditingInfo;

  readonly checkbox: CheckBoxInfo;

  readonly item: TreeNodeItem;
}

/**
 * Immutable data structure that describes checkbox info.
 * @public
 */
export interface CheckBoxInfo {
  readonly state: CheckBoxState;
  readonly tooltip?: string;
  readonly isDisabled: boolean;
  readonly isVisible: boolean;
}

/**
 * Mutable data structure that describes tree node.
 * @public
 */
export interface MutableTreeModelNode extends TreeModelNode {
  isLoading: boolean;

  description: string;
  isExpanded: boolean;
  label: PropertyRecord;
  isSelected: boolean;

  /** Specifies that node is in editing mode. It holds callbacks that are used by node editor. */
  editingInfo?: TreeModelNodeEditingInfo;

  checkbox: MutableCheckBoxInfo;

  item: TreeNodeItem;
}

/**
 * Data structure that holds callbacks used for tree node editing.
 * @public
 */
export interface TreeModelNodeEditingInfo {
  onCommit: (node: TreeModelNode, newValue: string) => void;
  onCancel: () => void;
}

/**
 * Mutable data structure that describes checkbox info.
 * @public
 */
export interface MutableCheckBoxInfo extends CheckBoxInfo {
  state: CheckBoxState;
  tooltip?: string;
  isDisabled: boolean;
  isVisible: boolean;
}

/**
 * Data structure that describes tree node placeholder.
 * @public
 */
export interface TreeModelNodePlaceholder {
  readonly childIndex: number;
  readonly depth: number;
  readonly parentId?: string;
}

/**
 * Data structure that describes tree root node.
 * @public
 */
export interface TreeModelRootNode {
  readonly depth: -1;
  readonly id: undefined;
  readonly numChildren: number | undefined;
}

/**
 * Data structure that describes input used to create tree node.
 * @public
 */
export interface TreeModelNodeInput {
  readonly description?: string;
  readonly isExpanded: boolean;
  readonly id: string;
  readonly item: TreeNodeItem;
  readonly label: PropertyRecord;
  readonly isLoading: boolean;
  readonly numChildren?: number;
  readonly isSelected: boolean;
}

/**
 * Type definition of all tree model nodes.
 * @public
 */
export type TreeModelNodeType = TreeModelNode | TreeModelNodePlaceholder | TreeModelRootNode;

/**
 * Checks if object is [[TreeModelNode]]
 * @public
 */
export function isTreeModelNode(obj: TreeModelNodeType | undefined): obj is TreeModelNode {
  return obj !== undefined && !isTreeModelNodePlaceholder(obj) && !isTreeModelRootNode(obj);
}

/**
 * Checks if object is [[TreeModelNodePlaceholder]]
 * @public
 */
export function isTreeModelNodePlaceholder(obj: TreeModelNodeType | undefined): obj is TreeModelNodePlaceholder {
  return obj !== undefined && "childIndex" in obj;
}

/**
 * Checks if object is [[TreeModelRootNode]]
 * @public
 */
export function isTreeModelRootNode(obj: TreeModelNodeType | undefined): obj is TreeModelRootNode {
  return obj !== undefined && (obj as TreeModelRootNode).id === undefined && !("childIndex" in obj);
}

/**
 * Type definition of tree node item data.
 * @public
 */
export type TreeNodeItemData = ImmediatelyLoadedTreeNodeItem & DelayLoadedTreeNodeItem;

/**
 * Data structure that describes set of visible tree nodes as a flat list.
 * @public
 */
export interface VisibleTreeNodes extends Iterable<TreeModelNode | TreeModelNodePlaceholder> {
  getNumNodes(): number;
  getAtIndex(index: number): TreeModelNode | TreeModelNodePlaceholder | undefined;
  getModel(): TreeModel;
  getNumRootNodes(): number | undefined;
  getIndexOfNode(nodeId: string): number;
}

/**
 * Data structure that describes tree model.
 * @public
 */
export interface TreeModel {
  getRootNode(): TreeModelRootNode;

  getNode(id: string): TreeModelNode | undefined;
  getNode(parentId: string | undefined, childIndex: number): TreeModelNode | TreeModelNodePlaceholder | undefined;
  getNode(nodeId: string | undefined, childIndex?: number): TreeModelNode | TreeModelNodePlaceholder | TreeModelRootNode | undefined;

  getChildren(parentId: string | undefined): SparseArray<string> | undefined;
  getChildOffset(parentId: string | undefined, childId: string): number | undefined;

  iterateTreeModelNodes(parentId?: string): IterableIterator<TreeModelNode>;
}

/**
 * Mutable tree model which holds nodes and allows adding or removing them.
 * @public
 */
export class MutableTreeModel implements TreeModel {
  public [immerable] = true;

  private _tree = new SparseTree<MutableTreeModelNode>();
  private _rootNode: TreeModelRootNode = { depth: -1, id: undefined, numChildren: undefined };

  /** Returns root node of a tree. This node is not visible and is there to allow having multiple visible root nodes. */
  public getRootNode(): TreeModelRootNode {
    return this._rootNode;
  }

  /** Returns tree node or placeholder for node that is not loaded yet.
   * @returns node, node placeholder or undefined if node is not found in model.
   */
  public getNode(id: string): MutableTreeModelNode | undefined;
  public getNode(parentId: string | undefined, childIndex: number): MutableTreeModelNode | TreeModelNodePlaceholder | undefined;
  public getNode(nodeId: string | undefined, childIndex?: number): MutableTreeModelNode | TreeModelNodePlaceholder | undefined {
    if (childIndex === undefined) {
      return this._tree.getNode(nodeId!);
    }

    const children = this._tree.getChildren(nodeId);
    const childId = children !== undefined ? children.get(childIndex) : undefined;
    if (childId !== undefined) {
      return this._tree.getNode(childId);
    }

    const parentNode = nodeId === undefined ? this._rootNode : this._tree.getNode(nodeId);
    if (parentNode !== undefined) {
      return {
        childIndex,
        depth: parentNode.depth + 1,
        parentId: nodeId,
      };
    }

    return undefined;
  }

  /** Returns children for specific parent.
   * @param parentId id of parent node.
   * @returns children of parent node or root nodes if undefined is passed as parent id.
   */
  public getChildren(parentId: string | undefined): SparseArray<string> | undefined {
    return this._tree.getChildren(parentId);
  }

  /** Returns children offset in children array for specific parent. */
  public getChildOffset(parentId: string | undefined, childId: string): number | undefined {
    return this._tree.getChildOffset(parentId, childId);
  }

  /**
   * Sets children for parent node starting from the specific offset.
   * If offset overlaps with already added nodes, the overlapping nodes are overwritten.
   */
  public setChildren(parentId: string | undefined, nodeInputs: TreeModelNodeInput[], offset: number): void {
    const parentNode = parentId === undefined ? this._rootNode : this._tree.getNode(parentId);
    if (parentNode === undefined)
      return;

    const children: MutableTreeModelNode[] = [];
    for (const input of nodeInputs) {
      const child = MutableTreeModel.createTreeModelNode(parentNode, input);
      children.push(child);
    }

    this._tree.setChildren(parentNode.id, children, offset);
    MutableTreeModel.setNumChildrenForNode(parentNode, this._tree.getChildren(parentNode.id));
  }

  /**
   * Inserts child in the specified position.
   * If offset is higher then current length of children array, the length is increased.
   */
  public insertChild(parentId: string | undefined, childNodeInput: TreeModelNodeInput, offset: number): void {
    const parentNode = parentId === undefined ? this._rootNode : this._tree.getNode(parentId);
    if (parentNode === undefined)
      return;

    const child = MutableTreeModel.createTreeModelNode(parentNode, childNodeInput);

    this._tree.insertChild(parentNode.id, child, offset);
    MutableTreeModel.setNumChildrenForNode(parentNode, this._tree.getChildren(parentNode.id));
  }

  /**
   * Changes the id of target node.
   * @returns `true` on success, `false` otherwise.
   */
  public changeNodeId(currentId: string, newId: string): boolean {
    const node = this.getNode(currentId);
    if (node === undefined) {
      return false;
    }

    if (currentId === newId) {
      return true;
    }

    const index = this.getChildOffset(node.parentId, currentId);
    assert(index !== undefined);

    if (!this._tree.setNodeId(node.parentId, index, newId)) {
      return false;
    }

    (node.id as string) = newId; // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    for (const [childId] of this.getChildren(newId)?.iterateValues() ?? []) {
      const child = this.getNode(childId);
      assert(child !== undefined);
      (child.parentId as string) = newId;
    }

    return true;
  }

  /**
   * Transfers node along with its children to a new location. Fails if destination has undefined child count.
   * @param sourceNodeId Node that is being moved.
   * @param targetParentId Node that will receive a new child.
   * @param targetIndex Insertion location among target's *current* children.
   * @returns `true` on success, `false` otherwise.
   */
  public moveNode(sourceNodeId: string, targetParentId: string | undefined, targetIndex: number): boolean {
    const sourceNode = this.getNode(sourceNodeId);
    if (sourceNode === undefined) {
      return false;
    }

    const targetParent = targetParentId === undefined ? this._rootNode : this.getNode(targetParentId);
    if (targetParent === undefined || targetParent.numChildren === undefined) {
      return false;
    }

    if (targetParentId !== undefined && this.areNodesRelated(sourceNodeId, targetParentId)) {
      return false;
    }

    this._tree.moveNode(sourceNode.parentId, sourceNodeId, targetParentId, targetIndex);

    const sourceParent = sourceNode.parentId === undefined ? this._rootNode : this.getNode(sourceNode.parentId);
    assert(sourceParent !== undefined);
    MutableTreeModel.setNumChildrenForNode(sourceParent, this._tree.getChildren(sourceNode.parentId));
    MutableTreeModel.setNumChildrenForNode(targetParent, this._tree.getChildren(targetParentId));

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    (sourceNode.parentId as string | undefined) = targetParentId;

    const updateDepths = (parentId: string, depth: number) => {
      const node = this.getNode(parentId);
      assert(node !== undefined);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      (node.depth as number) = depth;
      for (const [nodeId] of this.getChildren(parentId)?.iterateValues() ?? []) {
        updateDepths(nodeId, depth + 1);
      }
    };

    updateDepths(sourceNodeId, targetParent.depth + 1);
    return true;
  }

  private areNodesRelated(ancestorNodeId: string, descendantNodeId: string): boolean {
    const node = this.getNode(descendantNodeId);
    if (node === undefined || node.parentId === undefined) {
      return false;
    }

    return node.parentId === ancestorNodeId ? true : this.areNodesRelated(ancestorNodeId, node.parentId);
  }

  /**
   * Sets the number of child nodes a parent is expected to contain. All child nodes of this parent will be subsequently
   * removed.
   */
  public setNumChildren(parentId: string | undefined, numChildren: number | undefined): void {
    const parentNode = parentId === undefined ? this._rootNode : this._tree.getNode(parentId);
    if (parentNode === undefined) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    (parentNode.numChildren as number | undefined) = numChildren;
    this._tree.setNumChildren(parentId, numChildren ?? 0);
  }

  /** Removes children specified by id.
   * @param parentId id of the parent node.
   * @param child child node id or index that should be removed.
   */
  public removeChild(parentId: string | undefined, child: string | number): void {
    const parentNode = parentId === undefined ? this._rootNode : this._tree.getNode(parentId);
    this._tree.removeChild(parentId, child);

    // istanbul ignore else
    if (parentNode)
      MutableTreeModel.setNumChildrenForNode(parentNode, this._tree.getChildren(parentNode.id));
  }

  /** Removes all children for parent specified by id.
   * @param parentId id of parent node or undefined to remove root nodes.
   */
  public clearChildren(parentId: string | undefined) {
    const parentNode = parentId === undefined ? this._rootNode : this._tree.getNode(parentId);
    if (parentNode !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      (parentNode.numChildren as number | undefined) = undefined;
    }
    this._tree.deleteSubtree(parentId, false);
  }

  /** Generates flat list of visible nodes in the tree model. */
  public computeVisibleNodes(): VisibleTreeNodes {
    const result = MutableTreeModel.getVisibleDescendants(this._tree, this._rootNode);
    return {
      getNumNodes: () => result.length,
      getAtIndex: (index: number): TreeModelNode | TreeModelNodePlaceholder | undefined => {
        if (typeof (index) === "number") {
          return result[index];
        }

        return this._tree.getNode(index);
      },
      getModel: () => this,
      getNumRootNodes: () => this._rootNode.numChildren,
      [Symbol.iterator]: () => result[Symbol.iterator](),
      getIndexOfNode: (nodeId: string): number => {
        return result.findIndex((visibleNode) => (visibleNode as TreeModelNode).id === nodeId);
      },
    };
  }

  /** Iterates over all nodes present in the tree model. */
  public * iterateTreeModelNodes(parentId?: string): IterableIterator<MutableTreeModelNode> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const _this = this;
    function* iterateDescendants(subParentId: string | undefined): IterableIterator<MutableTreeModelNode> {
      const children = _this.getChildren(subParentId);
      if (children === undefined) {
        return;
      }

      for (const [nodeId] of children.iterateValues()) {
        const node = _this.getNode(nodeId);
        if (node !== undefined) {
          yield node;
          yield* iterateDescendants(nodeId);
        }
      }
    }

    yield* iterateDescendants(parentId);
  }

  private static setNumChildrenForNode(node: TreeModelRootNode | MutableTreeModelNode, children: SparseArray<string> | undefined) {
    const numChildren = children ? children.getLength() : undefined;
    if (node.numChildren === numChildren)
      return;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    (node.numChildren as number | undefined) = numChildren;
  }

  private static createTreeModelNode(parentNode: TreeModelNode | TreeModelRootNode, input: TreeModelNodeInput): MutableTreeModelNode {
    return {
      id: input.id,
      parentId: parentNode.id,
      depth: parentNode.depth + 1,

      isLoading: input.isLoading,
      numChildren: input.numChildren,

      description: input.description || "",
      isExpanded: input.isExpanded,
      label: input.label,
      isSelected: input.isSelected,

      checkbox: {
        state: input.item.checkBoxState || CheckBoxState.Off,
        isDisabled: !!input.item.isCheckboxDisabled,
        isVisible: !!input.item.isCheckboxVisible,
      },

      item: _.cloneDeep(input.item),
    };
  }

  // Traverses the tree and collects visible descendants.
  private static getVisibleDescendants(
    tree: SparseTree<TreeModelNode>,
    rootNode: TreeModelNode | TreeModelRootNode,
    result: Array<TreeModelNode | TreeModelNodePlaceholder> = [],
  ): Array<TreeModelNode | TreeModelNodePlaceholder> {
    const children = tree.getChildren(rootNode.id);
    if (!children) {
      return result;
    }

    let index = 0;
    for (const childId of children) {
      if (childId === undefined) {
        result.push({ parentId: rootNode.id, depth: rootNode.depth + 1, childIndex: index });
      } else {
        const childNode = tree.getNode(childId);
        if (childNode === undefined) {
          // node was disposed
          result.push({ parentId: rootNode.id, depth: rootNode.depth + 1, childIndex: index });
        } else {
          result.push(childNode);
          if (childNode.isExpanded && childNode.numChildren !== undefined) {
            MutableTreeModel.getVisibleDescendants(tree, childNode, result);
          }
        }
      }

      ++index;
    }

    return result;
  }
}
