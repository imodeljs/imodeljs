/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";
import * as moq from "typemoq";
import { AxisIndex, Matrix3d, Transform, Vector3d } from "@bentley/geometry-core";
import { DrawingViewState, IModelConnection, ScreenViewport } from "@bentley/imodeljs-frontend";
import { Face } from "@bentley/ui-core";
import { cleanup, fireEvent, render, wait } from "@testing-library/react";
import { CubeHover, CubeNavigationAid, CubeNavigationHitBoxX, CubeNavigationHitBoxY, CubeNavigationHitBoxZ, FaceCell, NavCubeFace } from "../../ui-components/navigationaids/CubeNavigationAid";
import { ViewportComponentEvents } from "../../ui-components/viewport/ViewportComponentEvents";
import TestUtils from "../TestUtils";

describe("CubeNavigationAid", () => {

  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  afterEach(cleanup);

  let rotation = Matrix3d.createIdentity();

  const connection = moq.Mock.ofType<IModelConnection>();
  const viewState = moq.Mock.ofType<DrawingViewState>();
  viewState.setup((x) => x.id).returns(() => "id1");
  viewState.setup((x) => x.classFullName).returns(() => "Bis:DrawingViewDefinition");
  viewState.setup((x) => x.getRotation).returns(() => () => rotation);
  const vp = moq.Mock.ofType<ScreenViewport>();
  vp.setup((x) => x.view).returns(() => viewState.object);
  vp.setup((x) => x.rotation).returns(() => rotation);

  const waitForSpy = async (spy: sinon.SinonSpy, timeoutMillis: number = 1500) => {
    return wait(() => {
      if (!spy.called)
        throw new Error("Waiting for spy timed out!");
    }, { timeout: timeoutMillis, interval: 10 });
  };

  const cssMatrix3dToBentleyTransform = (mStr: string) => {
    const mat = mStr.match(/matrix3d\(([-\de\. ,]+)\)/);
    if (mat !== null && mat[1] !== undefined) {
      const params = mat[1].split(",");
      if (params.length !== 16)
        return undefined;
      const p = [];
      for (const param of params) {
        const n = parseFloat(param);
        if (isNaN(n)) {
          return undefined;
        }
        p.push(n);
      }
      return Transform.createRowValues(
        p[0], p[4], p[8], p[12],
        p[1], p[5], p[9], p[13],
        p[2], p[6], p[10], p[14],
      );
    }
    return undefined;
  };

  describe("<CubeNavigationAid />", () => {
    afterEach(cleanup);

    it("should render", () => {
      render(<CubeNavigationAid iModelConnection={connection.object} />);
    });
    it("should exist", async () => {
      const component = render(<CubeNavigationAid iModelConnection={connection.object} />);
      const navAid = component.getByTestId("components-cube-navigation-aid");
      expect(navAid).to.exist;
    });
    it("should change from top to front when arrow clicked", async () => {
      const animationEnd = sinon.fake();
      const component = render(<CubeNavigationAid iModelConnection={connection.object} animationTime={.1} onAnimationEnd={animationEnd} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const pointerButton = component.getByTestId("cube-pointer-button-down");

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;

      pointerButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

      await waitForSpy(animationEnd);

      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(1, 0, 0, 0, 0, -1, 0, 1, 0))).is.true;
    });
    it("should change from top to back when arrow clicked", async () => {
      const animationEnd = sinon.fake();
      const component = render(<CubeNavigationAid iModelConnection={connection.object} animationTime={.1} onAnimationEnd={animationEnd} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const pointerButton = component.getByTestId("cube-pointer-button-up");

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;

      pointerButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

      await waitForSpy(animationEnd);

      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(-1, 0, 0, 0, 0, -1, 0, -1, 0))).is.true;
    });
    it("should change from top to left when arrow clicked", async () => {
      const animationEnd = sinon.fake();
      const component = render(<CubeNavigationAid iModelConnection={connection.object} animationTime={.1} onAnimationEnd={animationEnd} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const pointerButton = component.getByTestId("cube-pointer-button-left");

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;

      pointerButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

      await waitForSpy(animationEnd);

      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(0, 1, 0, 0, 0, -1, -1, 0, 0))).is.true;
    });
    it("should change from top to right when arrow clicked", async () => {
      const animationEnd = sinon.fake();
      const component = render(<CubeNavigationAid iModelConnection={connection.object} animationTime={.1} onAnimationEnd={animationEnd} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const pointerButton = component.getByTestId("cube-pointer-button-right");

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;

      pointerButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

      await waitForSpy(animationEnd);

      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(0, -1, 0, 0, 0, -1, 1, 0, 0))).is.true;
    });
    it("should highlight hovered cell", async () => {
      const component = render(<CubeNavigationAid iModelConnection={connection.object} />);

      const topCenterCell = component.getByTestId("nav-cube-face-cell-top-0-0-1");

      expect(topCenterCell.classList.contains("cube-hover")).to.be.false;

      topCenterCell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));

      expect(topCenterCell.classList.contains("cube-hover")).to.be.true;
    });
    it("should click center cell", async () => {
      const component = render(<CubeNavigationAid iModelConnection={connection.object} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const topCenterCell = component.getByTestId("nav-cube-face-cell-top-0-0-1");

      expect(topCenterCell.classList.contains("cube-active")).to.be.false;

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
      topCenterCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      expect(topCenterCell.classList.contains("cube-active")).to.be.true;
      topCenterCell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
    });
    it("should click corner cell", async () => {
      const animationEnd = sinon.fake();
      const component = render(<CubeNavigationAid iModelConnection={connection.object} animationTime={.1} onAnimationEnd={animationEnd} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const topCornerCell = component.getByTestId("nav-cube-face-cell-top-1-0-1");

      expect(topCornerCell.classList.contains("cube-active")).to.be.false;

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
      topCornerCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      expect(topCornerCell.classList.contains("cube-active")).to.be.true;
      topCornerCell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      await waitForSpy(animationEnd);
      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(0, -1, 0, 0.70710678, 0, -0.70710678, 0.70710678, 0, 0.70710678))).is.true;
    });
    it("should switch from edge to top face", async () => {
      const animationEnd = sinon.fake();
      const component = render(<CubeNavigationAid iModelConnection={connection.object} animationTime={.1} onAnimationEnd={animationEnd} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const topEdgeCell = component.getByTestId("nav-cube-face-cell-top-1-0-1");
      const topCenterCell = component.getByTestId("nav-cube-face-cell-top-0-0-1");

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
      topEdgeCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      topEdgeCell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      await waitForSpy(animationEnd);

      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(0, -1, 0, 0.70710678, 0, -0.70710678, 0.70710678, 0, 0.70710678))).is.true;
      animationEnd.resetHistory();
      topCenterCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      topCenterCell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      await waitForSpy(animationEnd);
      const mat3 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat3.matrix.isAlmostEqual(Matrix3d.createRowValues(0, -1, 0, 1, 0, 0, 0, 0, 1))).is.true;
    });
    it("should switch from edge to bottom face", async () => {
      const animationEnd = sinon.fake();
      const component = render(<CubeNavigationAid iModelConnection={connection.object} animationTime={.1} onAnimationEnd={animationEnd} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const bottomCornerCell = component.getByTestId("nav-cube-face-cell-bottom--1-0--1");
      const bottomCornerCenter = component.getByTestId("nav-cube-face-cell-bottom-0-0--1");

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
      bottomCornerCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      bottomCornerCell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      await waitForSpy(animationEnd);

      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(0, 1, 0, 0.70710678, 0, -0.70710678, -0.70710678, 0, -0.70710678))).is.true;

      animationEnd.resetHistory();
      bottomCornerCenter.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      bottomCornerCenter.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      await waitForSpy(animationEnd);

      const mat3 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat3.matrix.isAlmostEqual(Matrix3d.createRowValues(0, 1, 0, 1, 0, 0, 0, 0, -1))).is.true;
    });
    it("should drag cube", async () => {
      const component = render(<CubeNavigationAid iModelConnection={connection.object} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const topCenterCell = component.getByTestId("nav-cube-face-cell-top-0-0-1");

      expect(topCenterCell.classList.contains("cube-active")).to.be.false;

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
      topCenterCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, clientX: 2, clientY: 2 }));
      topCenterCell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window, clientX: 10, clientY: 2 }));
      topCenterCell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window, clientX: 20, clientY: 2 }));
      topCenterCell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window, clientX: 20, clientY: 2 }));
      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(0.62160997, 0.7833269, 0, -0.7833269, 0.62160997, 0, 0, 0, 1))).is.true;
    });
    it.skip("should touch drag cube", async () => { // Touch isn't currently supported so we can't test it...
      const component = render(<CubeNavigationAid iModelConnection={connection.object} />);

      const topFace = component.getByTestId("core-cube-face-top");
      const topCenterCell = component.getByTestId("nav-cube-face-cell-top-0-0-1");

      expect(topCenterCell.classList.contains("cube-active")).to.be.false;

      const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
      const touchStart = new Touch({ identifier: 0, target: topCenterCell, clientX: 2, clientY: 2 }); // <== ReferenceError: Touch is not defined
      const touchMove1 = new Touch({ identifier: 0, target: topCenterCell, clientX: 10, clientY: 2 });
      const touchMove2 = new Touch({ identifier: 0, target: topCenterCell, clientX: 20, clientY: 2 });
      const touchEnd = new Touch({ identifier: 0, target: topCenterCell, clientX: 20, clientY: 2 });
      topCenterCell.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, view: window, touches: [touchStart], changedTouches: [touchStart], targetTouches: [touchStart] }));
      topCenterCell.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, view: window, touches: [touchMove1], changedTouches: [touchMove1], targetTouches: [touchMove1] }));
      topCenterCell.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, view: window, touches: [touchMove2], changedTouches: [touchMove2], targetTouches: [touchMove2] }));
      topCenterCell.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, view: window, touches: [touchEnd], changedTouches: [touchEnd] }));
      const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
      expect(mat2.isIdentity).is.false;
    });
    describe("onViewRotationChangeEvent", () => {
      afterEach(cleanup);

      beforeEach(() => {
        rotation = Matrix3d.createIdentity();
      });
      it("should update onViewRotationChangeEvent", async () => {
        const component = render(<CubeNavigationAid iModelConnection={connection.object} viewport={vp.object} />);
        const topFace = component.getByTestId("core-cube-face-top");
        const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
        expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
        ViewportComponentEvents.onViewRotationChangeEvent.emit({ viewport: vp.object });
        const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
        expect(mat2.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
      });
      it("should update onViewRotationChangeEvent with new rotation", async () => {
        const component = render(<CubeNavigationAid iModelConnection={connection.object} viewport={vp.object} />);
        const topFace = component.getByTestId("core-cube-face-top");
        const mat = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
        expect(mat.matrix.isAlmostEqual(Matrix3d.createIdentity())).is.true;
        rotation = Matrix3d.create90DegreeRotationAroundAxis(AxisIndex.Z);
        ViewportComponentEvents.onViewRotationChangeEvent.emit({ viewport: vp.object });
        const mat2 = cssMatrix3dToBentleyTransform(topFace.style.transform)!;
        expect(mat2.matrix.isAlmostEqual(Matrix3d.createRowValues(0, 1, 0, -1, 0, 0, 0, 0, 1))).is.true;
      });
    });
  });
  describe("<NavCubeFace />", () => {
    afterEach(cleanup);

    it("should render", () => {
      render(<NavCubeFace face={Face.Top} label="test" hoverMap={{}} onFaceCellClick={sinon.fake()} onFaceCellHoverChange={sinon.fake()} />);
    });
    it("should exist", () => {
      const component = render(<NavCubeFace face={Face.Top} label="test" hoverMap={{}} onFaceCellClick={sinon.fake()} onFaceCellHoverChange={sinon.fake()} />);
      const face = component.getByTestId("nav-cube-face");
      expect(face).to.exist;
    });
    describe("methods and callbacks", () => {
      beforeEach(() => {
        NavCubeFace.faceCellToPos = sinon.spy(NavCubeFace.faceCellToPos);
        render(<NavCubeFace face={Face.Top} label="test" hoverMap={{}} onFaceCellClick={sinon.fake()} onFaceCellHoverChange={sinon.fake()} />);
      });

      describe("faceCellToPos", () => {
        it("should be called when component is rendered", () => {
          NavCubeFace.faceCellToPos.should.have.been.calledWith(Face.Top, 0, 0);
        });
        it("should return correct Point3d", () => {
          const pos = NavCubeFace.faceCellToPos(Face.Back, -1, 1);
          pos.x.should.equal(CubeNavigationHitBoxX.Right);
          pos.y.should.equal(CubeNavigationHitBoxY.Back);
          pos.z.should.equal(CubeNavigationHitBoxZ.Bottom);
        });
      });
    });
  });
  describe("<FaceCell />", () => {
    it("should render", () => {
      render(<FaceCell onFaceCellClick={sinon.fake()} onFaceCellHoverChange={sinon.fake()} hoverMap={{}} vector={Vector3d.create(1, 1, 1)} face={Face.Top} />);
    });
    it("should exist", () => {
      const component = render(<FaceCell onFaceCellClick={sinon.fake()} onFaceCellHoverChange={sinon.fake()} hoverMap={{}} vector={Vector3d.create(1, 1, 1)} face={Face.Top} />);
      const faceCell = component.getByTestId("nav-cube-face-cell-top-1-1-1");
      expect(faceCell).to.exist;
    });
    describe("onFaceCellClick", () => {
      afterEach(cleanup);

      it("should be called when cell is clicked", () => {
        const cellClick = sinon.spy();
        const pos = Vector3d.create(1, 1, 1);
        const component = render(<FaceCell onFaceCellClick={cellClick} onFaceCellHoverChange={sinon.fake()} hoverMap={{}} vector={pos} face={Face.Top} />);
        const faceCell = component.getByTestId("nav-cube-face-cell-top-1-1-1");
        fireEvent.mouseDown(faceCell);
        fireEvent.mouseUp(faceCell);
        expect(cellClick).to.be.called;
      });

      it("should be called when cell is touched", () => {
        const cellClick = sinon.spy();
        const pos = Vector3d.create(1, 1, 1);
        const component = render(<FaceCell onFaceCellClick={cellClick} onFaceCellHoverChange={sinon.fake()} hoverMap={{}} vector={pos} face={Face.Top} />);
        const faceCell = component.getByTestId("nav-cube-face-cell-top-1-1-1");
        fireEvent.touchStart(faceCell, {
          targetTouches: [{
            clientX: 10,
            clientY: 10,
          }],
        });
        fireEvent.touchEnd(faceCell, {
          changedTouches: [{
            clientX: 10,
            clientY: 10,
          }],
        });
        expect(cellClick).to.be.called;
      });
    });
    describe("onFaceCellHoverChange", () => {
      afterEach(cleanup);

      it("should be called when cell is hovered", () => {
        const cellHover = sinon.spy();
        const pos = Vector3d.create(1, 1, 1);
        const component = render(<FaceCell onFaceCellClick={sinon.fake()} onFaceCellHoverChange={cellHover} hoverMap={{}} vector={pos} face={Face.Top} />);
        const faceCell = component.getByTestId("nav-cube-face-cell-top-1-1-1");
        fireEvent.mouseOver(faceCell);
        expect(cellHover).to.be.calledWithExactly(pos, CubeHover.Hover);
      });
      it("should be called when cell is unhovered", () => {
        const cellHover = sinon.spy();
        const pos = Vector3d.create(1, 1, 1);
        const component = render(<FaceCell onFaceCellClick={sinon.fake()} onFaceCellHoverChange={cellHover} hoverMap={{}} vector={pos} face={Face.Top} />);
        const faceCell = component.getByTestId("nav-cube-face-cell-top-1-1-1");
        fireEvent.mouseOver(faceCell);
        fireEvent.mouseOut(faceCell);
        expect(cellHover).to.be.calledWithExactly(pos, CubeHover.None);
      });
      it("should be called when cell is clicked", () => {
        const cellHover = sinon.spy();
        const pos = Vector3d.create(1, 1, 1);
        const component = render(<FaceCell onFaceCellClick={sinon.fake()} onFaceCellHoverChange={cellHover} hoverMap={{}} vector={pos} face={Face.Top} />);
        const faceCell = component.getByTestId("nav-cube-face-cell-top-1-1-1");
        fireEvent.mouseDown(faceCell);
        expect(cellHover).to.be.calledWithExactly(pos, CubeHover.Active);
      });
      it("should be called when cell is unclicked", () => {
        const cellHover = sinon.spy();
        const pos = Vector3d.create(1, 1, 1);
        const component = render(<FaceCell onFaceCellClick={sinon.fake()} onFaceCellHoverChange={cellHover} hoverMap={{}} vector={pos} face={Face.Top} />);
        const faceCell = component.getByTestId("nav-cube-face-cell-top-1-1-1");
        fireEvent.mouseDown(faceCell);
        fireEvent.mouseUp(faceCell);
        expect(cellHover).to.be.calledWithExactly(pos, CubeHover.None);
      });
    });
  });

});
