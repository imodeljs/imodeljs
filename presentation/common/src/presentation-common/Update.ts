/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { NodeKey, NodeKeyJSON } from "./hierarchy/Key";
import { Node, NodeJSON, PartialNode, PartialNodeJSON } from "./hierarchy/Node";

/** @alpha */
export const UPDATE_FULL = "FULL";

/** @alpha */
export interface UpdateInfoJSON {
  [imodel: string]: {
    [rulesetId: string]: {
      hierarchy?: HierarchyUpdateInfoJSON;
      content?: ContentUpdateInfo;
    };
  };
}

/** @alpha */
export interface UpdateInfo {
  [imodel: string]: {
    [rulesetId: string]: {
      hierarchy?: HierarchyUpdateInfo;
      content?: ContentUpdateInfo;
    };
  };
}

/** @alpha */
export namespace UpdateInfo {
  /** Serialize given object to JSON. */
  export function toJSON(obj: UpdateInfo): UpdateInfoJSON {
    const json: UpdateInfoJSON = {};
    for (const imodel in obj) {
      // istanbul ignore if
      if (!obj.hasOwnProperty(imodel))
        continue;

      json[imodel] = {};
      const rulesetObj = obj[imodel];
      for (const rulesetId in rulesetObj) {
        // istanbul ignore if
        if (!rulesetObj.hasOwnProperty(rulesetId))
          continue;

        json[imodel][rulesetId] = {
          hierarchy: rulesetObj[rulesetId].hierarchy ? HierarchyUpdateInfo.toJSON(rulesetObj[rulesetId].hierarchy!) : undefined,
          content: rulesetObj[rulesetId].content,
        };
      }
    }
    return json;
  }

  /** Deserialize given object from JSON */
  export function fromJSON(json: UpdateInfoJSON): UpdateInfo {
    const obj: UpdateInfo = {};
    for (const imodel in json) {
      // istanbul ignore if
      if (!json.hasOwnProperty(imodel))
        continue;

      obj[imodel] = {};
      const rulesetJson = json[imodel];
      for (const rulesetId in rulesetJson) {
        // istanbul ignore if
        if (!rulesetJson.hasOwnProperty(rulesetId))
          continue;

        obj[imodel][rulesetId] = {
          hierarchy: rulesetJson[rulesetId].hierarchy ? HierarchyUpdateInfo.fromJSON(rulesetJson[rulesetId].hierarchy!) : undefined,
          content: rulesetJson[rulesetId].content,
        };
      }
    }
    return obj;
  }
}

/** @alpha */
export interface ExpandedNodeUpdateRecordJSON {
  node: NodeJSON;
  position: number;
}

/** @alpha */
export interface HierarchyUpdateRecordJSON {
  parent?: NodeKeyJSON;
  nodesCount: number;
  expandedNodes?: ExpandedNodeUpdateRecordJSON[];
}

/** @alpha */
export interface ExpandedNodeUpdateRecord {
  node: Node;
  position: number;
}

/** @alpha */
export interface HierarchyUpdateRecord {
  parent?: NodeKey;
  nodesCount: number;
  expandedNodes?: ExpandedNodeUpdateRecord[];
}

/** @alpha */
export namespace ExpandedNodeUpdateRecord { // eslint-disable-line @typescript-eslint/no-redeclare
  /** Serialize given object to JSON. */
  export function toJSON(obj: ExpandedNodeUpdateRecord): ExpandedNodeUpdateRecordJSON {
    return {
      ...obj,
      node: Node.toJSON(obj.node),
    };
  }

  /** Deserialize given object from JSON */
  export function fromJSON(json: ExpandedNodeUpdateRecordJSON): ExpandedNodeUpdateRecord {
    return {
      ...json,
      node: Node.fromJSON(json.node),
    };
  }
}

/** @alpha */
export namespace HierarchyUpdateRecord { // eslint-disable-line @typescript-eslint/no-redeclare
  /** Serialize given object to JSON. */
  export function toJSON(obj: HierarchyUpdateRecord): HierarchyUpdateRecordJSON {
    return {
      ...obj,
      parent: obj.parent ? NodeKey.toJSON(obj.parent) : undefined,
      expandedNodes: obj.expandedNodes ? obj.expandedNodes.map(ExpandedNodeUpdateRecord.toJSON) : undefined,
    };
  }

  /** Deserialize given object from JSON */
  export function fromJSON(json: HierarchyUpdateRecordJSON): HierarchyUpdateRecord {
    return {
      ...json,
      parent: json.parent ? NodeKey.fromJSON(json.parent) : undefined,
      expandedNodes: json.expandedNodes ? json.expandedNodes.map(ExpandedNodeUpdateRecord.fromJSON) : undefined,
    };
  }
}

/** @alpha */
export type HierarchyUpdateInfoJSON = typeof UPDATE_FULL | HierarchyUpdateRecordJSON[];

/** @alpha */
export type HierarchyUpdateInfo = typeof UPDATE_FULL | HierarchyUpdateRecord[];

/** @alpha */
export namespace HierarchyUpdateInfo { // eslint-disable-line @typescript-eslint/no-redeclare
  /** Serialize given object to JSON. */
  export function toJSON(obj: HierarchyUpdateInfo): HierarchyUpdateInfoJSON {
    if (typeof obj === "string")
      return obj;
    return obj.map(HierarchyUpdateRecord.toJSON);
  }

  /** Deserialize given object from JSON */
  export function fromJSON(json: HierarchyUpdateInfoJSON): HierarchyUpdateInfo {
    if (typeof json === "string")
      return json;
    return json.map(HierarchyUpdateRecord.fromJSON);
  }
}

/** @alpha */
export type ContentUpdateInfo = typeof UPDATE_FULL;

/**
 * JSON representation of [[PartialHierarchyModification]].
 * @public
 */
export type PartialHierarchyModificationJSON = NodeInsertionInfoJSON | NodeDeletionInfoJSON | NodeUpdateInfoJSON;

/**
 * Information about a hierarchy change: insertion, deletion or node update.
 * @public
 */
export type PartialHierarchyModification = NodeInsertionInfo | NodeDeletionInfo | NodeUpdateInfo;

/** @public */
export namespace PartialHierarchyModification { // eslint-disable-line @typescript-eslint/no-redeclare
  /** Serialize given object to JSON. */
  export function toJSON(obj: PartialHierarchyModification): PartialHierarchyModificationJSON {
    switch (obj.type) {
      case "Insert":
        return {
          type: "Insert",
          parent: obj.parent === undefined ? undefined : NodeKey.toJSON(obj.parent),
          position: obj.position,
          node: Node.toJSON(obj.node),
        };

      case "Update":
        return {
          type: "Update",
          target: NodeKey.toJSON(obj.target),
          changes: Node.toPartialJSON(obj.changes),
        };

      case "Delete":
        return {
          type: "Delete",
          // eslint-disable-next-line deprecation/deprecation
          target: NodeKey.toJSON(obj.target),
          parent: obj.parent === undefined ? undefined : NodeKey.toJSON(obj.parent),
          position: obj.position,
        };
    }
  }

  /** Deserialize given object from JSON */
  export function fromJSON(json: PartialHierarchyModificationJSON): PartialHierarchyModification {
    switch (json.type) {
      case "Insert":
        return {
          type: "Insert",
          parent: json.parent === undefined ? undefined : NodeKey.fromJSON(json.parent),
          position: json.position,
          node: Node.fromJSON(json.node),
        };

      case "Update":
        return {
          type: "Update",
          target: NodeKey.fromJSON(json.target),
          changes: Node.fromPartialJSON(json.changes),
        };

      case "Delete":
        return {
          type: "Delete",
          // eslint-disable-next-line deprecation/deprecation
          target: NodeKey.fromJSON(json.target),
          parent: json.parent === undefined ? undefined : NodeKey.fromJSON(json.parent),
          position: json.position,
        };
    }
  }
}

/**
 * Information about node insertion.
 * @public
 */
export interface NodeInsertionInfo {
  type: "Insert";
  /** Parent node key */
  parent?: NodeKey;
  /** Index of the new node under its parent */
  position: number;
  /** Inserted node */
  node: Node;
}

/**
 * JSON representation of [[NodeInsertionInfo]].
 * @public
 */
export interface NodeInsertionInfoJSON {
  type: "Insert";
  parent?: NodeKeyJSON;
  position: number;
  node: NodeJSON;
}

/**
 * Information about node deletion.
 * @public
 */
export interface NodeDeletionInfo {
  type: "Delete";
  /** Parent of the deleted node */
  parent?: NodeKey;
  /** Position of the deleted node among its siblings in the initial, not updated tree */
  position: number;

  /**
   * Key of the deleted node
   * @deprecated Use `parent` with `position`
   */
  target: NodeKey;
}

/**
 * JSON representation of [[NodeDeletionInfo]].
 * @public
 */
export interface NodeDeletionInfoJSON {
  type: "Delete";
  /** Parent of the deleted node */
  parent?: NodeKeyJSON;
  /** Position of the deleted node among its siblings in the initial, not updated tree */
  position: number;

  /**
   * Key of the deleted node
   * @deprecated
   */
  target: NodeKeyJSON;
}

/**
 * Information about node update.
 * @public
 */
export interface NodeUpdateInfo {
  type: "Update";
  /** Key of the updated node */
  target: NodeKey;
  /** Updated node attributes */
  changes: PartialNode;
}

/**
 * JSON representation of [[NodeUpdateInfo]].
 * @public
 */
export interface NodeUpdateInfoJSON {
  type: "Update";
  target: NodeKeyJSON;
  changes: PartialNodeJSON;
}

/**
 * JSON representation of [[HierarchyCompareInfo]].
 * @public
 */
export interface HierarchyCompareInfoJSON {
  changes: PartialHierarchyModificationJSON[];
  continuationToken?: {
    prevHierarchyNode: string;
    currHierarchyNode: string;
  };
}

/**
 * Information about hierarchy modification / differences.
 * @public
 */
export interface HierarchyCompareInfo {
  /** A list of hierarchy changes */
  changes: PartialHierarchyModification[];
  /** Continuation token for requesting more changes. */
  continuationToken?: {
    prevHierarchyNode: string;
    currHierarchyNode: string;
  };
}

/** @public */
export namespace HierarchyCompareInfo {
  /** Serialize given object to JSON. */
  export function toJSON(obj: HierarchyCompareInfo): HierarchyCompareInfoJSON {
    return {
      ...obj,
      changes: obj.changes.map((change) => PartialHierarchyModification.toJSON(change)),
    };
  }

  /** Deserialize given object from JSON */
  export function fromJSON(json: HierarchyCompareInfoJSON): HierarchyCompareInfo {
    return {
      ...json,
      changes: json.changes.map((change) => PartialHierarchyModification.fromJSON(change)),
    };
  }
}
