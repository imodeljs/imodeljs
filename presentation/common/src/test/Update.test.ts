/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import {
  ExpandedNodeUpdateRecord,
  ExpandedNodeUpdateRecordJSON,
  HierarchyCompareInfo, HierarchyCompareInfoJSON, HierarchyUpdateInfo, HierarchyUpdateInfoJSON, HierarchyUpdateRecord, HierarchyUpdateRecordJSON, Node, NodeDeletionInfo, NodeDeletionInfoJSON,
  NodeInsertionInfo, NodeInsertionInfoJSON, NodeJSON, NodeUpdateInfo, NodeUpdateInfoJSON, PartialHierarchyModification, StandardNodeTypes, UpdateInfo,
  UpdateInfoJSON,
} from "../presentation-common";

const testNode: Node = {
  key: {
    instanceKeys: [],
    pathFromRoot: [],
    type: StandardNodeTypes.ECInstancesNode,
  },
  label: {
    displayValue: "TestNode",
    rawValue: "test_node",
    typeName: "string",
  },
};

const testNodeJson: NodeJSON = {
  key: {
    instanceKeys: [],
    pathFromRoot: [],
    type: StandardNodeTypes.ECInstancesNode,
  },
  labelDefinition: {
    displayValue: "TestNode",
    rawValue: "test_node",
    typeName: "string",
  },
};

describe("UpdateInfo", () => {
  describe("toJSON", () => {
    it("serializes `UpdateInfo` object to JSON", () => {
      const info: UpdateInfo = {
        ["test_imodel_1"]: {
          ["test_ruleset_1"]: {
            content: "FULL",
          },
          ["test_ruleset_2"]: {
            hierarchy: "FULL",
          },
        },
        ["test_imodel_2"]: {
          ["test_ruleset_3"]: {
            hierarchy: [{
              nodesCount: 1,
            }],
          },
        },
      };
      expect(UpdateInfo.toJSON(info)).to.matchSnapshot();
    });
  });

  describe("fromJSON", () => {
    it("deserializes `UpdateInfo` object from JSON", () => {
      const json: UpdateInfoJSON = {
        ["test_imodel_1"]: {
          ["test_ruleset_1"]: {
            content: "FULL",
          },
          ["test_ruleset_2"]: {
            hierarchy: "FULL",
          },
        },
        ["test_imodel_2"]: {
          ["test_ruleset_3"]: {
            hierarchy: [{
              nodesCount: 1,
            }],
          },
        },
      };
      expect(UpdateInfo.fromJSON(json)).to.matchSnapshot();
    });
  });
});

describe("HierarchyUpdateInfo", () => {
  describe("toJSON", () => {
    it("serializes \"FULL\" `HierarchyUpdateInfo` to JSON", () => {
      const info: HierarchyUpdateInfo = "FULL";
      expect(HierarchyUpdateInfo.toJSON(info)).to.eq("FULL");
    });

    it("serializes partial `HierarchyUpdateInfo` to JSON", () => {
      const info: HierarchyUpdateInfo = [{
        nodesCount: 1,
      }];
      expect(HierarchyUpdateInfo.toJSON(info)).to.matchSnapshot();
    });
  });

  describe("fromJSON", () => {
    it("deserializes \"FULL\" `HierarchyUpdateInfo` from JSON", () => {
      const json: HierarchyUpdateInfoJSON = "FULL";
      expect(HierarchyUpdateInfo.fromJSON(json)).to.eq("FULL");
    });

    it("deserializes partial `HierarchyUpdateInfo` from JSON", () => {
      const json: HierarchyUpdateInfoJSON = [{
        nodesCount: 1,
      }];
      expect(HierarchyUpdateInfo.fromJSON(json)).to.matchSnapshot();
    });
  });
});

describe("ExpandedNodeUpdateRecord", () => {
  describe("toJSON", () => {
    it("serializes partial `ExpandedNodeUpdateRecord` to JSON", () => {
      const info: ExpandedNodeUpdateRecord = {
        node: testNode,
        position: 1,
      };
      expect(ExpandedNodeUpdateRecord.toJSON(info)).to.matchSnapshot();
    });
  });

  describe("fromJSON", () => {
    it("deserializes partial `ExpandedNodeUpdateRecord` from JSON", () => {
      const json: ExpandedNodeUpdateRecordJSON = {
        node: testNodeJson,
        position: 1,
      };
      expect(ExpandedNodeUpdateRecord.fromJSON(json)).to.matchSnapshot();
    });
  });
});

describe("HierarchyUpdateRecord", () => {
  describe("toJSON", () => {
    it("serializes partial `HierarchyUpdateRecord` to JSON", () => {
      const info: HierarchyUpdateRecord = {
        parent: testNode.key,
        nodesCount: 2,
        expandedNodes: [{
          node: testNode,
          position: 0,
        }],
      };
      expect(HierarchyUpdateRecord.toJSON(info)).to.matchSnapshot();
    });
  });

  describe("fromJSON", () => {
    it("deserializes partial `HierarchyUpdateRecord` from JSON", () => {
      const json: HierarchyUpdateRecordJSON = {
        parent: testNodeJson.key,
        nodesCount: 2,
        expandedNodes: [{
          node: testNodeJson,
          position: 0,
        }],
      };
      expect(HierarchyUpdateRecord.fromJSON(json)).to.matchSnapshot();
    });
  });
});

describe("PartialHierarchyModification", () => {
  describe("toJSON", () => {
    it("serializes `NodeInsertionInfo` without parent", () => {
      const info: NodeInsertionInfo = {
        type: "Insert",
        position: 123,
        node: testNode,
      };
      expect(PartialHierarchyModification.toJSON(info)).to.matchSnapshot();
    });

    it("serializes `NodeInsertionInfo` with parent", () => {
      const info: NodeInsertionInfo = {
        type: "Insert",
        parent: testNode.key,
        position: 123,
        node: testNode,
      };
      expect(PartialHierarchyModification.toJSON(info)).to.matchSnapshot();
    });

    it("serializes `NodeUpdateInfo`", () => {
      const info: NodeUpdateInfo = {
        type: "Update",
        target: testNode.key,
        changes: {
          backColor: "new value",
        },
      };
      expect(PartialHierarchyModification.toJSON(info)).to.matchSnapshot();
    });

    it("serializes `NodeDeletionInfo` with parent", () => {
      const info: NodeDeletionInfo = {
        type: "Delete",
        target: testNode.key,
        parent: testNode.key,
        position: 123,
      };
      expect(PartialHierarchyModification.toJSON(info)).to.matchSnapshot();
    });

    it("serializes `NodeDeletionInfo` without parent", () => {
      const info: NodeDeletionInfo = {
        type: "Delete",
        target: testNode.key,
        position: 123,
      };
      expect(PartialHierarchyModification.toJSON(info)).to.matchSnapshot();
    });
  });

  describe("fromJSON", () => {
    it("deserializes `NodeInsertionInfo` without parent from JSON", () => {
      const info: NodeInsertionInfoJSON = {
        type: "Insert",
        position: 123,
        node: testNodeJson,
      };
      expect(PartialHierarchyModification.fromJSON(info)).to.matchSnapshot();
    });

    it("deserializes `NodeInsertionInfo` with parent from JSON", () => {
      const info: NodeInsertionInfoJSON = {
        type: "Insert",
        parent: testNodeJson.key,
        position: 123,
        node: testNodeJson,
      };
      expect(PartialHierarchyModification.fromJSON(info)).to.matchSnapshot();
    });

    it("deserializes `NodeUpdateInfo` from JSON", () => {
      const info: NodeUpdateInfoJSON = {
        type: "Update",
        target: testNode.key,
        changes: {
          backColor: "new value",
        },
      };
      expect(PartialHierarchyModification.fromJSON(info)).to.matchSnapshot();
    });

    it("deserializes `NodeDeletionInfo` without parent from JSON", () => {
      const info: NodeDeletionInfoJSON = {
        type: "Delete",
        target: testNodeJson.key,
        position: 0,
      };
      expect(PartialHierarchyModification.fromJSON(info)).to.matchSnapshot();
    });

    it("deserializes `NodeDeletionInfo` with parent from JSON", () => {
      const info: NodeDeletionInfoJSON = {
        type: "Delete",
        target: testNodeJson.key,
        parent: testNodeJson.key,
        position: 0,
      };
      expect(PartialHierarchyModification.fromJSON(info)).to.matchSnapshot();
    });
  });
});

describe("HierarchyCompareInfo", () => {
  describe("toJSON", () => {
    it("serializes `HierarchyCompareInfo` to JSON", () => {
      const info: HierarchyCompareInfo = {
        changes: [
          {
            type: "Insert",
            position: 123,
            node: testNode,
          },
          {
            type: "Update",
            target: testNode.key,
            changes: {
              backColor: "new value",
            },
          },
          {
            type: "Delete",
            target: testNode.key,
            parent: testNode.key,
            position: 0,
          },
        ],
        continuationToken: {
          prevHierarchyNode: "prevHierarchyNode",
          currHierarchyNode: "currHierarchyNode",
        },
      };
      expect(HierarchyCompareInfo.toJSON(info)).to.matchSnapshot();
    });
  });

  describe("fromJSON", () => {
    it("deserializes `HierarchyCompareInfo` from JSON", () => {
      const info: HierarchyCompareInfoJSON = {
        changes: [
          {
            type: "Insert",
            position: 123,
            node: testNodeJson,
          },
          {
            type: "Update",
            target: testNodeJson.key,
            changes: {
              backColor: "new value",
            },
          },
          {
            type: "Delete",
            target: testNodeJson.key,
            parent: testNodeJson.key,
            position: 0,
          },
        ],
        continuationToken: {
          prevHierarchyNode: "prevHierarchyNode",
          currHierarchyNode: "currHierarchyNode",
        },
      };
      expect(HierarchyCompareInfo.fromJSON(info)).to.matchSnapshot();
    });
  });
});
